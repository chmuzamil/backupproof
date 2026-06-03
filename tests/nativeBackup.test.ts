import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nativeBackup, nativePrune, nativeRestore, nativeSnapshots } from "../server/nativeBackup";
import type { App, Repository } from "../shared/types";

function app(): App {
  return {
    id: "app-1",
    name: "Demo",
    composePath: "",
    projectName: "demo",
    services: [],
    safeRestoreServices: [],
    recipeType: "compose-files",
    backupPaths: [],
    healthChecks: [],
    repositoryId: "repo-1",
    policyId: "policy-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function repository(location: string): Repository {
  return {
    id: "repo-1",
    name: "Local vault",
    engine: "frd",
    type: "local",
    location,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

describe("native backup engine", () => {
  it("creates, lists, and restores backup bundles", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-native-"));
    const source = path.join(root, "source");
    const vault = path.join(root, "vault");
    const restore = path.join(root, "restore");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "hello.txt"), "hello native backup");

    const snapshot = await nativeBackup(app(), repository(vault), [source], () => undefined);
    const snapshots = await nativeSnapshots(app(), repository(vault));
    await nativeRestore(app(), repository(vault), snapshot.id, restore, () => undefined);

    expect(snapshots[0].id).toBe(snapshot.id);
    expect(snapshots[0].sizeBytes).toBeGreaterThan(0);
    await expect(fs.readFile(path.join(restore, "source", "hello.txt"), "utf8")).resolves.toBe("hello native backup");
  });

  it("prunes older native backup bundles by keep count", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-prune-"));
    const source = path.join(root, "source");
    const vault = path.join(root, "vault");
    await fs.mkdir(source);

    await fs.writeFile(path.join(source, "hello.txt"), "one");
    await nativeBackup(app(), repository(vault), [source], () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await fs.writeFile(path.join(source, "hello.txt"), "two");
    await nativeBackup(app(), repository(vault), [source], () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await fs.writeFile(path.join(source, "hello.txt"), "three");
    await nativeBackup(app(), repository(vault), [source], () => undefined);

    const result = await nativePrune(app(), repository(vault), 2, () => undefined);
    const snapshots = await nativeSnapshots(app(), repository(vault));

    expect(result).toEqual({ kept: 2, pruned: 1 });
    expect(snapshots).toHaveLength(2);
  });
});
