import fs from "node:fs/promises";
import path from "node:path";
import { buildRecoveryAnalytics, type AnalyticsPeriodDays } from "../shared/recoveryAnalytics";
import { enrichSummary } from "./confidenceScore";
import { config } from "./config";
import { getEngineAdapter } from "./engines";
import { listDrReports } from "./proofReport";
import type { AppSummary, DrReportSummary } from "../shared/types";
import type { Store } from "./store";

async function listAllDrReports(appIds: string[]): Promise<DrReportSummary[]> {
  const reports = await Promise.all(appIds.map((appId) => listDrReports(appId)));
  return reports.flat().sort((a, b) => b.restoredAt.localeCompare(a.restoredAt));
}

export async function buildSummariesForAnalytics(store: Store): Promise<AppSummary[]> {
  const state = store.snapshot();
  return Promise.all(state.apps.map(async (app) => {
    const jobs = state.jobs.filter((job) => job.appId === app.id);
    const restoreProof = state.restoreProofs.find((proof) => proof.appId === app.id);
    const proofFresh = restoreProof?.status === "passed" && new Date(restoreProof.expiresAt).getTime() > Date.now();
    const repository = state.repositories.find((repo) => repo.id === app.repositoryId);
    const snapshots = repository
      ? await getEngineAdapter(repository.engine).listSnapshots(app, repository, {
          passwordSecret: store.getSecret(repository.passwordSecretId),
          credentialSecret: store.getSecret(repository.credentialSecretId)
        })
      : [];
    const recentFailures = jobs.filter((job) => job.status === "failed").length;
    const repositories = [repository, ...(app.secondaryRepositoryIds ?? []).map((id) => state.repositories.find((repo) => repo.id === id))]
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const { inspectBackupSafetyCached } = await import("./backupSafety");
    const safety = await inspectBackupSafetyCached(app, repositories);
    return enrichSummary({
      app,
      repository,
      policy: state.policies.find((policy) => policy.id === app.policyId),
      latestBackup: jobs.find((job) => job.type === "backup"),
      latestRestoreTest: jobs.find((job) => job.type === "restore-test"),
      restoreProof,
      snapshotCount: snapshots.length,
      latestSnapshot: snapshots[0]
        ? { id: snapshots[0].id, createdAt: snapshots[0].createdAt, sizeBytes: snapshots[0].sizeBytes }
        : undefined,
      alerts: state.alerts.filter((alert) => alert.appId === app.id && !alert.acknowledgedAt),
      restorable: Boolean(proofFresh),
      safety,
      snapshotHistory: snapshots.slice(0, 12).reverse().map((snapshot) => ({
        id: snapshot.id,
        createdAt: snapshot.createdAt,
        sizeBytes: snapshot.sizeBytes
      }))
    }, recentFailures);
  }));
}

export async function getRecoveryAnalytics(store: Store, periodDays: AnalyticsPeriodDays = 30) {
  const state = store.snapshot();
  const summaries = await buildSummariesForAnalytics(store);
  const drills = await listAllDrReports(state.apps.map((app) => app.id));
  return buildRecoveryAnalytics({
    summaries,
    restoreProofs: state.restoreProofs,
    drills,
    periodDays
  });
}

const weeklySummaryPath = () => path.join(config.dataDir, "weekly-summary.json");

export async function readWeeklySummaryState() {
  try {
    return JSON.parse(await fs.readFile(weeklySummaryPath(), "utf8")) as { lastSentAt?: string };
  } catch {
    return {};
  }
}

export async function markWeeklySummarySent(at = new Date().toISOString()) {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(weeklySummaryPath(), JSON.stringify({ lastSentAt: at }, null, 2));
}
