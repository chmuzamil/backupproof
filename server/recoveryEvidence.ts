import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";
import { v4 as uuid } from "uuid";
import { config } from "./config";
import { listDrReports, readDrReport } from "./proofReport";
import type { App, DashboardState } from "../shared/types";

type EvidenceState = Pick<DashboardState, "repositories" | "policies" | "restoreProofs" | "restoreDestinationTemplates">;

function line(value?: string | number) {
  return value === undefined || value === "" ? "Not configured" : String(value);
}

function bullets(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

export async function buildRecoveryRunbook(state: EvidenceState, app: App) {
  const repository = state.repositories.find((item) => item.id === app.repositoryId);
  const policy = state.policies.find((item) => item.id === app.policyId);
  const proof = state.restoreProofs.find((item) => item.appId === app.id);
  const templates = state.restoreDestinationTemplates.filter((template) => !template.appId || template.appId === app.id);
  const reports = await listDrReports(app.id);
  const generatedAt = new Date().toISOString();

  return `# ${app.name} Recovery Runbook

Generated: ${generatedAt}

## Recovery Status

- Latest proven snapshot: ${line(proof?.snapshotId)}
- Proof status: ${line(proof?.status)}
- Proof tested at: ${line(proof?.testedAt)}
- Proof expires at: ${line(proof?.expiresAt)}
- Confidence score: ${line(proof?.confidenceScore)}

## Protected Data

${bullets(app.backupPaths)}

## Restore Proof Checks

${app.healthChecks.length ? app.healthChecks.map((check) => `- ${check.type}: ${check.target}`).join("\n") : "- No health checks configured"}

## Vault

- Name: ${line(repository?.name)}
- Engine: ${line(repository?.engine)}
- Type: ${line(repository?.type)}
- Location: ${line(repository?.location)}

## Schedule And Retention

- Backup schedule: ${line(policy?.backupCron)}
- Restore-test schedule: ${line(policy?.restoreTestCron)}
- Proof freshness: ${line(policy?.proofFreshnessHours)} hours
- Retention: daily ${line(policy?.retention.keepDaily)}, weekly ${line(policy?.retention.keepWeekly)}, monthly ${line(policy?.retention.keepMonthly)}

## Saved Restore Destinations

${templates.length ? templates.map((template) => `- ${template.name}: ${template.path}${template.description ? ` (${template.description})` : ""}`).join("\n") : "- No saved restore destinations"}

## Disaster Recovery Steps

1. Start BackupProof on the recovery server.
2. Import the BackupProof recovery kit if this is a fresh dashboard.
3. Ensure the vault location is reachable.
4. Choose the latest proven snapshot unless a different point-in-time restore is required.
5. Pick a saved restore destination or enter an isolated restore folder.
6. Run restore preflight.
7. Restore the full snapshot or selected files.
8. Confirm post-restore verification passes.
9. Run a guided recovery drill if this is a rehearsal.
10. Save or download the drill report as recovery evidence.

## Recent Drill Reports

${reports.length ? reports.slice(0, 10).map((report) => `- ${report.restoredAt}: ${report.scenario}, snapshot ${report.snapshotId}, proof ${report.proofStatus}, confidence ${report.confidenceScore}%`).join("\n") : "- No drill reports yet"}
`;
}

export async function createEvidenceBundle(state: EvidenceState, app: App) {
  const tempDir = path.join(config.dataDir, "exports", `evidence-${uuid()}`);
  const bundlePath = `${tempDir}.tar.gz`;
  await fs.mkdir(tempDir, { recursive: true });
  const cleanup = async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(bundlePath, { force: true });
  };

  try {
    await fs.writeFile(path.join(tempDir, "recovery-runbook.md"), await buildRecoveryRunbook(state, app));
    const reports = await listDrReports(app.id);
    const reportDir = path.join(tempDir, "drill-reports");
    await fs.mkdir(reportDir, { recursive: true });
    for (const report of reports.slice(0, 20)) {
      await fs.writeFile(path.join(reportDir, `${report.id}.json`), await readDrReport(app.id, report.id));
    }
    const latestProof = state.restoreProofs.find((proof) => proof.appId === app.id && proof.reportPath);
    if (latestProof?.reportPath) {
      await fs.mkdir(path.join(tempDir, "restore-proof"), { recursive: true });
      await fs.copyFile(latestProof.reportPath, path.join(tempDir, "restore-proof", "latest-proof.json")).catch(() => undefined);
    }
    await fs.writeFile(path.join(tempDir, "manifest.json"), JSON.stringify({
      format: "backupproof-evidence-bundle-v1",
      appId: app.id,
      appName: app.name,
      exportedAt: new Date().toISOString(),
      includes: ["recovery-runbook.md", "drill-reports/*.json", "restore-proof/latest-proof.json when available"],
      excludes: ["vault credentials", "user accounts", "sessions", "backup data"]
    }, null, 2));
    await tar.c({ cwd: tempDir, gzip: true, file: bundlePath }, await fs.readdir(tempDir));
    return {
      filePath: bundlePath,
      fileName: `backupproof-evidence-${app.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || app.id}.tar.gz`,
      cleanup
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
