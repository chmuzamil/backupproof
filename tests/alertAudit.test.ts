import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("alert audit", () => {
  it("creates a warning when backups exist without a restore proof", async () => {
    process.env.FRD_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "frd-alerts-"));
    const { auditAlerts } = await import("../server/alertAudit");
    const { nativeBackup } = await import("../server/nativeBackup");
    const { Store } = await import("../server/store");
    const store = new Store();
    await store.init();

    const source = path.join(process.env.FRD_DATA_DIR, "source");
    const vault = path.join(process.env.FRD_DATA_DIR, "vault");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "proof.txt"), "proof");

    const repository = await store.upsertRepository({
      name: "Alert vault",
      engine: "native",
      type: "local",
      location: vault
    });
    const policy = store.snapshot().policies[0];
    const app = await store.upsertApp({
      name: "Alert demo",
      composePath: "",
      projectName: "",
      services: [],
      safeRestoreServices: [],
      recipeType: "compose-files",
      backupPaths: [source],
      healthChecks: [],
      repositoryId: repository.id,
      policyId: policy.id
    });
    await nativeBackup(app, repository, [source], () => undefined);

    await auditAlerts(store);

    expect(store.snapshot().alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          appId: app.id,
          severity: "warning",
          title: "Restore proof missing"
        })
      ])
    );

    await store.addRestoreProof({
      appId: app.id,
      snapshotId: "snap-1",
      testedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "passed",
      healthResults: []
    });

    await auditAlerts(store);

    expect(store.snapshot().alerts.find((alert) => alert.title === "Restore proof missing" && !alert.acknowledgedAt)).toBeUndefined();
  });
});
