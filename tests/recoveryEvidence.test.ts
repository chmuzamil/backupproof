import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import { describe, expect, it } from "vitest";
import { buildRecoveryRunbook, createEvidenceBundle } from "../server/recoveryEvidence";
import { writeDrReport, writeProofReport } from "../server/proofReport";
import type { App, DashboardState } from "../shared/types";

const app: App = {
  id: "evidence-app",
  name: "Evidence App",
  composePath: "",
  projectName: "",
  services: [],
  safeRestoreServices: [],
  recipeType: "compose-files",
  backupPaths: ["/srv/app"],
  healthChecks: [{ id: "check", type: "file", target: "/srv/app/config.yml" }],
  repositoryId: "repo",
  policyId: "policy",
  createdAt: "",
  updatedAt: ""
};

function state(): DashboardState {
  return {
    apps: [app],
    repositories: [{ id: "repo", name: "Vault", engine: "frd", type: "local", location: "/vault", createdAt: "", updatedAt: "" }],
    policies: [{
      id: "policy",
      name: "Daily",
      backupCron: "0 2 * * *",
      restoreTestCron: "0 4 * * 0",
      proofFreshnessHours: 168,
      retention: { keepDaily: 7, keepWeekly: 4, keepMonthly: 6 },
      createdAt: "",
      updatedAt: ""
    }],
    jobs: [],
    restoreProofs: [{
      id: "proof",
      appId: app.id,
      snapshotId: "snapshot-1",
      testedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      status: "passed",
      healthResults: [],
      confidenceScore: 92
    }],
    notificationTargets: [],
    restoreDestinationTemplates: [{ id: "template", name: "Fresh server", path: "/restore", createdAt: "", updatedAt: "" }],
    alerts: [],
    users: [],
    auditLog: [],
    agents: [],
    environment: { dataDirWritable: true, checkedAt: "", errors: [], warnings: [] }
  };
}

describe("recovery evidence", () => {
  it("builds a human-readable recovery runbook", async () => {
    const runbook = await buildRecoveryRunbook(state(), app);
    expect(runbook).toContain("# Evidence App Recovery Runbook");
    expect(runbook).toContain("Latest proven snapshot: snapshot-1");
    expect(runbook).toContain("Fresh server: /restore");
  });

  it("packages runbook, drill reports, and proof report into an evidence bundle", async () => {
    process.env.FRD_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "frd-evidence-"));
    const proofPath = await writeProofReport(app, {
      appId: app.id,
      snapshotId: "snapshot-1",
      testedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      status: "passed",
      healthResults: [],
      checksumResults: [],
      confidenceScore: 92
    });
    await writeDrReport({
      appId: app.id,
      appName: app.name,
      scenario: "lost-server",
      snapshotId: "snapshot-1",
      restoredAt: new Date().toISOString(),
      proofStatus: "passed",
      confidenceScore: 92,
      steps: ["Restore completed"]
    });
    const bundle = await createEvidenceBundle({ ...state(), restoreProofs: [{ ...state().restoreProofs[0], reportPath: proofPath }] }, app);
    const extracted = path.join(process.env.FRD_DATA_DIR, "extracted");
    await fs.mkdir(extracted);
    await tar.x({ file: bundle.filePath, cwd: extracted });
    await expect(fs.readFile(path.join(extracted, "recovery-runbook.md"), "utf8")).resolves.toContain("Evidence App Recovery Runbook");
    await expect(fs.readFile(path.join(extracted, "manifest.json"), "utf8")).resolves.toContain("backupproof-evidence-bundle-v1");
    expect((await fs.readdir(path.join(extracted, "drill-reports"))).length).toBeGreaterThanOrEqual(1);
    await expect(fs.readFile(path.join(extracted, "restore-proof", "latest-proof.json"), "utf8")).resolves.toContain("snapshot-1");
    await bundle.cleanup();
  });
});
