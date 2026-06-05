import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { frdEngine } from "../server/engines";
import { compareSnapshots, inspectSnapshotContents } from "../server/snapshotInspector";
import { listDrReports, readDrReport, writeDrReport } from "../server/proofReport";
import type { App, Repository } from "../shared/types";

describe("snapshot inspector", () => {
  it("browses and compares built-in-engine snapshot manifests", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-inspect-"));
    const source = path.join(root, "source");
    const vault = path.join(root, "vault");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "keep.txt"), "one");
    await fs.writeFile(path.join(source, "delete.txt"), "remove me");
    const app: App = {
      id: "inspect-app", name: "Inspect", composePath: "", projectName: "", services: [], safeRestoreServices: [],
      recipeType: "compose-files", backupPaths: [source], healthChecks: [], repositoryId: "repo", policyId: "policy", createdAt: "", updatedAt: ""
    };
    const repository: Repository = {
      id: "repo", name: "Vault", engine: "frd", type: "local", location: vault, createdAt: "", updatedAt: ""
    };
    await frdEngine.backup(app, repository, [source], () => undefined, {});
    await fs.writeFile(path.join(source, "keep.txt"), "two");
    await fs.rm(path.join(source, "delete.txt"));
    await fs.writeFile(path.join(source, "added.txt"), "new");
    const latest = await frdEngine.backup(app, repository, [source], () => undefined, {});

    const contents = await inspectSnapshotContents(app, repository, latest.id, {});
    const comparison = await compareSnapshots(app, repository, latest.id, {});
    expect(contents.totalFiles).toBe(2);
    expect(contents.files.some((file) => file.path.endsWith("added.txt"))).toBe(true);
    expect(comparison.added.some((file) => file.path.endsWith("added.txt"))).toBe(true);
    expect(comparison.modified.some((file) => file.path.endsWith("keep.txt"))).toBe(true);
    expect(comparison.deleted.some((file) => file.path.endsWith("delete.txt"))).toBe(true);
  });

  it("writes guided drill reports with verification details", async () => {
    process.env.FRD_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "frd-dr-report-"));
    const reportPath = await writeDrReport({
      appId: "app",
      appName: "App",
      scenario: "lost-server",
      snapshotId: "snapshot",
      restoredAt: new Date().toISOString(),
      proofStatus: "passed",
      confidenceScore: 91,
      restoreTargetDir: "/tmp/restore",
      selectedPaths: ["file.txt"],
      restoreVerification: {
        supported: true,
        checkedAt: new Date().toISOString(),
        totalFiles: 1,
        passedFiles: 1,
        failedFiles: 0,
        skippedFiles: 0,
        results: [{ path: "file.txt", passed: true, message: "ok" }]
      },
      steps: ["Restore completed and verified"]
    });
    const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
    expect(report.restoreVerification.passedFiles).toBe(1);
    expect(report.selectedPaths).toEqual(["file.txt"]);
    const reports = await listDrReports("app");
    expect(reports[0].verification?.passedFiles).toBe(1);
    await expect(readDrReport("app", reports[0].id)).resolves.toContain("lost-server");
  });

  it("rejects unsafe drill report ids", async () => {
    await expect(readDrReport("app", "../state")).rejects.toThrow("Invalid report id");
  });

  it("restores only selected manifest paths", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-selective-"));
    const source = path.join(root, "source");
    const vault = path.join(root, "vault");
    const target = path.join(root, "restore");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "chosen.txt"), "chosen");
    await fs.writeFile(path.join(source, "other.txt"), "other");
    const app: App = {
      id: "selective-app", name: "Selective", composePath: "", projectName: "", services: [], safeRestoreServices: [],
      recipeType: "compose-files", backupPaths: [source], healthChecks: [], repositoryId: "repo", policyId: "policy", createdAt: "", updatedAt: ""
    };
    const repository: Repository = {
      id: "repo", name: "Vault", engine: "frd", type: "local", location: vault, createdAt: "", updatedAt: ""
    };
    const snapshot = await frdEngine.backup(app, repository, [source], () => undefined, {});
    const contents = await inspectSnapshotContents(app, repository, snapshot.id, {});
    const chosen = contents.files.find((file) => file.path.endsWith("chosen.txt"))!;
    await frdEngine.restore(app, repository, snapshot.id, target, () => undefined, {}, { paths: [chosen.path] });
    await expect(fs.readFile(path.join(target, chosen.path), "utf8")).resolves.toBe("chosen");
    await expect(fs.access(path.join(target, contents.files.find((file) => file.path.endsWith("other.txt"))!.path))).rejects.toThrow();
  });
});
