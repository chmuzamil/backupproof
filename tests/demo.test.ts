import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("demo app", () => {
  it("creates a sample app, proof file, and local vault", async () => {
    process.env.FRD_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "frd-demo-"));
    const { ensureDemoApp } = await import("../server/demo");
    const { Store } = await import("../server/store");
    const store = new Store();
    await store.init();

    const app = await ensureDemoApp(store);
    const state = store.snapshot();
    const repository = state.repositories.find((repo) => repo.id === app.repositoryId);

    expect(app.name).toBe("Demo Notes Folder");
    expect(repository?.type).toBe("local");
    await expect(fs.readFile(app.healthChecks[0].target, "utf8")).resolves.toContain("backup can be restored");
  });
});
