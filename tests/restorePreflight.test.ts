import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectRestorePreflight } from "../server/restorePreflight";
import type { App, RestoreProof, SnapshotSummary } from "../shared/types";

const app: App = {
  id: "app-preflight",
  name: "Preflight app",
  composePath: "",
  projectName: "",
  services: [],
  safeRestoreServices: [],
  recipeType: "compose-files",
  backupPaths: [],
  healthChecks: [],
  repositoryId: "repo",
  policyId: "policy",
  createdAt: "",
  updatedAt: ""
};

const snapshot: SnapshotSummary = {
  id: "snapshot-1",
  appId: app.id,
  appName: app.name,
  createdAt: new Date().toISOString(),
  archivePath: "",
  sourcePaths: [],
  sizeBytes: 42
};

describe("restore preflight", () => {
  it("marks a new writable destination ready", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-preflight-"));
    const result = await inspectRestorePreflight({ app, snapshot, targetDir: path.join(root, "restore") });
    expect(result.ready).toBe(true);
    expect(result.targetExists).toBe(false);
    expect(result.warnings).toContain("This snapshot has never passed a restore proof.");
  });

  it("warns about existing contents and source overlap", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-preflight-"));
    await fs.writeFile(path.join(root, "existing.txt"), "data");
    const result = await inspectRestorePreflight({ app: { ...app, backupPaths: [root] }, snapshot, targetDir: root });
    expect(result.ready).toBe(true);
    expect(result.targetEntryCount).toBe(1);
    expect(result.warnings.some((warning) => warning.includes("overlaps protected source path"))).toBe(true);
  });

  it("recognizes a current passed proof", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-preflight-"));
    const proof: RestoreProof = {
      id: "proof",
      appId: app.id,
      snapshotId: snapshot.id,
      testedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      status: "passed",
      healthResults: []
    };
    const result = await inspectRestorePreflight({ app, snapshot, proof, targetDir: path.join(root, "restore") });
    expect(result.proof?.current).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
