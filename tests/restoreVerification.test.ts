import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { frdEngine } from "../server/engines";
import { verifyRestoredSnapshot } from "../server/restoreVerification";
import { inspectSnapshotContents } from "../server/snapshotInspector";
import type { App, Repository } from "../shared/types";

function fixtures(root: string) {
  const source = path.join(root, "source");
  const vault = path.join(root, "vault");
  const app: App = {
    id: "verify-app", name: "Verify", composePath: "", projectName: "", services: [], safeRestoreServices: [],
    recipeType: "compose-files", backupPaths: [source], healthChecks: [], repositoryId: "repo", policyId: "policy", createdAt: "", updatedAt: ""
  };
  const repository: Repository = {
    id: "repo", name: "Vault", engine: "frd", type: "local", location: vault, createdAt: "", updatedAt: ""
  };
  return { source, vault, app, repository };
}

describe("post-restore verification", () => {
  it("passes when restored files match the snapshot manifest", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-verify-"));
    const { source, app, repository } = fixtures(root);
    const target = path.join(root, "restore");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "ok.txt"), "verified");
    const snapshot = await frdEngine.backup(app, repository, [source], () => undefined, {});
    await frdEngine.restore(app, repository, snapshot.id, target, () => undefined, {});
    const result = await verifyRestoredSnapshot({ app, repository, snapshotId: snapshot.id, restoreDir: target, ctx: {}, onLine: () => undefined });
    expect(result.supported).toBe(true);
    expect(result.failedFiles).toBe(0);
    expect(result.passedFiles).toBe(1);
  });

  it("fails when a restored selected file is changed after restore", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-verify-fail-"));
    const { source, app, repository } = fixtures(root);
    const target = path.join(root, "restore");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "chosen.txt"), "original");
    await fs.writeFile(path.join(source, "other.txt"), "ignored");
    const snapshot = await frdEngine.backup(app, repository, [source], () => undefined, {});
    const contents = await inspectSnapshotContents(app, repository, snapshot.id, {});
    const chosen = contents.files.find((file) => file.path.endsWith("chosen.txt"))!;
    await frdEngine.restore(app, repository, snapshot.id, target, () => undefined, {}, { paths: [chosen.path] });
    await fs.writeFile(path.join(target, chosen.path), "changed");
    const result = await verifyRestoredSnapshot({ app, repository, snapshotId: snapshot.id, restoreDir: target, selectedPaths: [chosen.path], ctx: {}, onLine: () => undefined });
    expect(result.failedFiles).toBe(1);
    expect(result.skippedFiles).toBe(1);
  });
});
