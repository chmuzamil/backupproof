import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { computeConfidenceScore } from "./confidenceScore";
import { engineContext, getEngineAdapter } from "./engines";
import { runChecksumProof, writeDrReport, writeProofReport } from "./proofReport";
import { sendAlert } from "./notifications";
import { Store } from "./store";
import { backupPathsForApp, prepareDatabaseDump, prepareDockerCompose, runHealthCheck } from "./recipes";
import type { App, Job, JobType, Repository } from "../shared/types";

export class JobRunner {
  private activeCount = 0;
  private queue: Job[] = [];

  constructor(private readonly store: Store, private readonly emit: () => void) {}

  async enqueue(type: JobType, appId?: string, options: Pick<Job, "requestedSnapshotId" | "restoreTargetDir"> = {}) {
    const job = await this.store.addJob({ type, appId, ...options });
    this.emit();
    this.queue.push(job);
    void this.drain();
    return job;
  }

  private async drain() {
    while (this.activeCount < config.maxConcurrentJobs && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) return;
      this.activeCount += 1;
      void this.run(job).finally(() => {
        this.activeCount -= 1;
        this.emit();
        void this.drain();
      });
    }
  }

  private repoSecrets(repository: Repository) {
    return engineContext({
      passwordSecret: this.store.getSecret(repository.passwordSecretId),
      credentialSecret: this.store.getSecret(repository.credentialSecretId)
    });
  }

  private async run(job: Job) {
    await this.store.updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });
    this.emit();

    try {
      const state = this.store.snapshot();
      const app = state.apps.find((item) => item.id === job.appId);
      if (!app) throw new Error("App is required for this job");
      const repository = state.repositories.find((item) => item.id === app.repositoryId);
      const policy = state.policies.find((item) => item.id === app.policyId);
      if (!repository || !policy) throw new Error("App repository or policy is missing");
      const onLine = async (line: string) => {
        await this.store.appendLog(job.id, line);
        this.emit();
      };
      const adapter = getEngineAdapter(repository.engine);
      const ctx = this.repoSecrets(repository);

      if (job.type === "backup") {
        await prepareDockerCompose(app, onLine);
        await prepareDatabaseDump(app, onLine, this.store.getSecret(app.database?.passwordSecretId));
        const snapshot = await adapter.backup(app, repository, backupPathsForApp(app), onLine, ctx);
        await this.store.updateJob(job.id, { snapshotId: snapshot.id });

        for (const secondaryId of app.secondaryRepositoryIds ?? []) {
          const secondary = state.repositories.find((r) => r.id === secondaryId);
          if (!secondary) continue;
          try {
            const secondaryAdapter = getEngineAdapter(secondary.engine);
            await secondaryAdapter.backup(app, secondary, backupPathsForApp(app), onLine, this.repoSecrets(secondary));
            await onLine(`Secondary destination ${secondary.name} backup succeeded.`);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Secondary backup failed";
            await onLine(`Secondary destination failed: ${message}`);
            await this.store.addAlert({
              appId: app.id,
              severity: "warning",
              title: "Secondary backup failed",
              message: `${app.name}: ${message}`
            });
          }
        }
        await this.finish(job.id, 0);
      } else if (job.type === "check") {
        await adapter.check(repository, onLine, ctx);
        const snapshots = await adapter.listSnapshots(app, repository, ctx);
        await onLine(`${snapshots.length} snapshot${snapshots.length === 1 ? "" : "s"} found.`);
        await this.finish(job.id, 0);
      } else if (job.type === "prune") {
        const result = await adapter.prune(app, repository, policy, onLine, ctx);
        await onLine(`Retention complete: kept ${result.kept}, pruned ${result.pruned}.`);
        await this.finish(job.id, 0);
      } else if (job.type === "restore-test") {
        await this.runRestoreTest(job.id, app, repository);
      } else if (job.type === "dr-run") {
        await this.runDrJob(job, app, repository);
      } else {
        await this.runManualRestore(job, app, repository);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown job failure";
      await this.store.appendLog(job.id, message);
      await this.finish(job.id, 1, message);
    } finally {
      this.emit();
    }
  }

  private proofRepository(app: App, state: ReturnType<Store["snapshot"]>) {
    const secondary = app.secondaryRepositoryIds?.[0];
    if (secondary) {
      const repo = state.repositories.find((r) => r.id === secondary);
      if (repo) return repo;
    }
    return state.repositories.find((r) => r.id === app.repositoryId);
  }

  private async runRestoreTest(jobId: string, app: App, repository: Repository, finalize = true) {
    const onLine = async (line: string) => {
      await this.store.appendLog(jobId, line);
      this.emit();
    };
    const state = this.store.snapshot();
    const proofRepo = this.proofRepository(app, state) ?? repository;
    const adapter = getEngineAdapter(proofRepo.engine);
    const ctx = this.repoSecrets(proofRepo);
    const snapshots = await adapter.listSnapshots(app, proofRepo, ctx);
    const snapshotId = snapshots[0]?.id;
    if (!snapshotId) {
      await this.finish(jobId, 1, "No backup snapshots available to restore");
      return;
    }

    const restoreDir = path.join(config.dataDir, "restore-tests", app.id, snapshotId);
    await fs.rm(restoreDir, { recursive: true, force: true });
    await fs.mkdir(restoreDir, { recursive: true });

    const partialPaths = app.proofPaths?.length ? app.proofPaths : undefined;
    await adapter.restore(app, proofRepo, snapshotId, restoreDir, onLine, ctx, { paths: partialPaths });

    const healthResults = [];
    for (const check of app.healthChecks) {
      healthResults.push(await runHealthCheck(check, restoreDir, onLine));
    }
    const checksumResults = await runChecksumProof(app, restoreDir, onLine);

    const passed = healthResults.every((r) => r.passed) && checksumResults.every((r) => r.passed);
    const policy = state.policies.find((item) => item.id === app.policyId);
    const expiresAt = new Date(Date.now() + (policy?.proofFreshnessHours ?? 168) * 60 * 60 * 1000).toISOString();
    const testedAt = new Date().toISOString();

    const recentFailures = state.jobs.filter((j) => j.appId === app.id && j.status === "failed").length;
    const confidenceScore = computeConfidenceScore({
      app,
      proof: { id: "", appId: app.id, snapshotId, testedAt, expiresAt, status: passed ? "passed" : "failed", healthResults, checksumResults },
      latestBackup: state.jobs.find((j) => j.appId === app.id && j.type === "backup"),
      snapshotCount: snapshots.length,
      policy,
      recentFailures
    });

    const reportPath = await writeProofReport(app, {
      appId: app.id,
      snapshotId,
      testedAt,
      expiresAt,
      status: passed ? "passed" : "failed",
      healthResults,
      checksumResults,
      confidenceScore
    });

    await this.store.addRestoreProof({
      appId: app.id,
      snapshotId,
      testedAt,
      expiresAt,
      status: passed ? "passed" : "failed",
      healthResults,
      checksumResults,
      confidenceScore,
      reportPath
    });
    await this.store.updateJob(jobId, { snapshotId });
    if (finalize) {
      await this.finish(jobId, passed ? 0 : 1, passed ? undefined : "Restore test failed");
    }
    return passed;
  }

  private async runManualRestore(job: Job, app: App, repository: Repository, finalize = true) {
    const onLine = async (line: string) => {
      await this.store.appendLog(job.id, line);
      this.emit();
    };
    const adapter = getEngineAdapter(repository.engine);
    const ctx = this.repoSecrets(repository);
    const snapshots = await adapter.listSnapshots(app, repository, ctx);
    const snapshotId = job.requestedSnapshotId ?? snapshots[0]?.id;
    if (!snapshotId) {
      await this.finish(job.id, 1, "No backup snapshots available to restore");
      return;
    }
    const restoreDir = job.restoreTargetDir?.trim() || path.join(config.dataDir, "manual-restores", app.id, snapshotId);
    await onLine(`Manual restore target: ${restoreDir}`);
    await adapter.restore(app, repository, snapshotId, restoreDir, onLine, ctx);
    await this.store.updateJob(job.id, { snapshotId, restoreTargetDir: restoreDir });
    if (finalize) {
      await this.finish(job.id, 0);
    }
  }

  private async runDrJob(job: Job, app: App, repository: Repository) {
    const onLine = async (line: string) => {
      await this.store.appendLog(job.id, line);
      this.emit();
    };
    const scenario = job.restoreTargetDir ?? "lost-server";
    const steps = [
      `Scenario: ${scenario}`,
      "Selected snapshot and restore destination",
      "Restore completed",
      "Restore proof started"
    ];
    await this.runManualRestore({ ...job, type: "manual-restore" }, app, repository, false);
    const passed = await this.runRestoreTest(job.id, app, repository, false);
    const proof = this.store.snapshot().restoreProofs.find((p) => p.appId === app.id);
    await writeDrReport({
      appId: app.id,
      appName: app.name,
      scenario,
      snapshotId: proof?.snapshotId ?? "unknown",
      restoredAt: new Date().toISOString(),
      proofStatus: proof?.status ?? "unknown",
      confidenceScore: proof?.confidenceScore ?? 0,
      steps
    });
    await onLine("DR report written.");
    await this.finish(job.id, passed ? 0 : 1, passed ? undefined : "DR run failed proof");
  }

  private async finish(jobId: string, exitCode: number, error?: string) {
    await this.store.updateJob(jobId, {
      status: exitCode === 0 ? "succeeded" : "failed",
      exitCode,
      error,
      finishedAt: new Date().toISOString()
    });
    if (error) {
      const job = this.store.snapshot().jobs.find((item) => item.id === jobId);
      const alert = await this.store.addAlert({
        appId: job?.appId,
        severity: "critical",
        title: `${job?.type ?? "Job"} failed`,
        message: error
      });
      const targets = this.store.snapshot().notificationTargets;
      for (const target of targets) {
        try {
          const delivered = await sendAlert(target, this.store.getSecret(target.configSecretId), alert);
          await this.store.upsertNotification({
            ...target,
            lastDeliveryAt: new Date().toISOString(),
            lastDeliveryStatus: delivered ? "succeeded" : target.lastDeliveryStatus
          });
        } catch {
          await this.store.upsertNotification({ ...target, lastDeliveryAt: new Date().toISOString(), lastDeliveryStatus: "failed" });
        }
      }
    }
  }
}
