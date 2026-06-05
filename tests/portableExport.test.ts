import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import { describe, expect, it } from "vitest";
import { frdEngine } from "../server/engines";
import { createPortableExport } from "../server/portableExport";
import { restorePortableExport } from "../server/portableImport";
import type { App, Repository } from "../shared/types";

describe("portable backup export", () => {
  it("packages restored data with recovery metadata", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-export-"));
    const source = path.join(root, "source");
    const vault = path.join(root, "vault");
    const extracted = path.join(root, "extracted");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "important.txt"), "portable recovery");

    const app: App = {
      id: "app-export",
      name: "Export Demo",
      composePath: "",
      projectName: "",
      services: [],
      safeRestoreServices: [],
      recipeType: "compose-files",
      backupPaths: [source],
      healthChecks: [],
      repositoryId: "repo-export",
      policyId: "policy",
      createdAt: "",
      updatedAt: ""
    };
    const repository: Repository = {
      id: "repo-export",
      name: "Export vault",
      engine: "frd",
      type: "local",
      location: vault,
      createdAt: "",
      updatedAt: ""
    };
    const snapshot = await frdEngine.backup(app, repository, [source], () => undefined, {});
    const exported = await createPortableExport(app, repository, snapshot.id, frdEngine, {});
    await fs.mkdir(extracted);
    await tar.x({ file: exported.filePath, cwd: extracted });

    const metadata = JSON.parse(await fs.readFile(path.join(extracted, "backup-proof-export.json"), "utf8"));
    expect(metadata.format).toBe("backupproof-portable-v1");
    expect(metadata.snapshotId).toBe(snapshot.id);
    const restored = path.join(extracted, "data", path.relative(path.parse(source).root, source), "important.txt");
    await expect(fs.readFile(restored, "utf8")).resolves.toBe("portable recovery");
    await exported.cleanup();
  });

  it("imports and restores a portable package without the original vault", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-import-"));
    const source = path.join(root, "source");
    const vault = path.join(root, "vault");
    const target = path.join(root, "fresh-server");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "recover-me.txt"), "fresh server recovery");

    const app: App = {
      id: "portable-app",
      name: "Portable App",
      composePath: "",
      projectName: "",
      services: [],
      safeRestoreServices: [],
      recipeType: "compose-files",
      backupPaths: [source],
      healthChecks: [],
      repositoryId: "portable-repo",
      policyId: "policy",
      createdAt: "",
      updatedAt: ""
    };
    const repository: Repository = {
      id: "portable-repo",
      name: "Vault",
      engine: "frd",
      type: "local",
      location: vault,
      createdAt: "",
      updatedAt: ""
    };
    const snapshot = await frdEngine.backup(app, repository, [source], () => undefined, {});
    const exported = await createPortableExport(app, repository, snapshot.id, frdEngine, {});
    await fs.rm(vault, { recursive: true, force: true });

    const restored = await restorePortableExport(exported.filePath, target);
    expect(restored.metadata.app.name).toBe("Portable App");
    const restoredFile = path.join(target, path.relative(path.parse(source).root, source), "recover-me.txt");
    await expect(fs.readFile(restoredFile, "utf8")).resolves.toBe("fresh server recovery");
    await exported.cleanup();
  });

  it("rejects archives containing paths outside the portable format", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-import-unsafe-"));
    await fs.writeFile(path.join(root, "unexpected.txt"), "unsafe");
    const archive = path.join(root, "unsafe.tar.gz");
    await tar.c({ cwd: root, gzip: true, file: archive }, ["unexpected.txt"]);

    await expect(restorePortableExport(archive)).rejects.toThrow("unsafe or unsupported path");
  });
});
