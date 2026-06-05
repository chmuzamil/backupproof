import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("store maintenance", () => {
  it("purges completed jobs while keeping running jobs", async () => {
    process.env.FRD_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "frd-store-"));
    const { Store } = await import("../server/store");
    const store = new Store();
    await store.init();
    await store.addJob({ type: "backup", appId: "app-a" });
    await store.addJob({ type: "restore-test", appId: "app-a" });
    await store.addJob({ type: "backup", appId: "app-b" });

    const jobs = store.snapshot().jobs;
    await store.updateJob(jobs[0].id, { status: "running", startedAt: new Date().toISOString() });
    await store.updateJob(jobs[1].id, { status: "failed", finishedAt: new Date().toISOString() });
    await store.updateJob(jobs[2].id, { status: "succeeded", finishedAt: new Date().toISOString() });

    await store.purgeJobHistory("app-a");

    const remaining = store.snapshot().jobs;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].appId).toBe("app-b");
    expect(remaining[0].status).toBe("running");
  });

  it("retains restore proof history for an app", async () => {
    process.env.FRD_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "frd-store-proof-"));
    const { Store } = await import("../server/store");
    const store = new Store();
    await store.init();
    const base = {
      appId: "app-proof",
      snapshotId: "snapshot",
      testedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      status: "passed" as const,
      healthResults: []
    };
    await store.addRestoreProof({ ...base, snapshotId: "snapshot-1" });
    await store.addRestoreProof({ ...base, snapshotId: "snapshot-2" });
    expect(store.snapshot().restoreProofs.filter((proof) => proof.appId === "app-proof").map((proof) => proof.snapshotId)).toEqual(["snapshot-2", "snapshot-1"]);
  });

  it("saves and deletes restore destination templates", async () => {
    process.env.FRD_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "frd-store-template-"));
    const { Store } = await import("../server/store");
    const store = new Store();
    await store.init();
    const template = await store.upsertRestoreDestinationTemplate({
      name: "Fresh server",
      path: "/tmp/restore",
      description: "Used during recovery drills",
      appId: "app-template"
    });
    expect(store.snapshot().restoreDestinationTemplates[0].name).toBe("Fresh server");
    await store.removeRestoreDestinationTemplate(template.id);
    expect(store.snapshot().restoreDestinationTemplates).toHaveLength(0);
  });
});
