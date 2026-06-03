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
});
