import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectBackupSafety } from "../server/backupSafety";
import type { App, Repository } from "../shared/types";

function app(backupPaths: string[]): App {
  return {
    id: "app-1",
    name: "Important files",
    composePath: "",
    projectName: "",
    services: [],
    safeRestoreServices: [],
    recipeType: "compose-files",
    backupPaths,
    healthChecks: [],
    repositoryId: "repo-1",
    policyId: "policy-1",
    createdAt: "",
    updatedAt: ""
  };
}

function repository(location: string): Repository {
  return {
    id: "repo-1",
    name: "Local vault",
    engine: "frd",
    type: "local",
    location,
    createdAt: "",
    updatedAt: ""
  };
}

describe("backup safety", () => {
  it("blocks a local vault placed inside its backup source", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-safety-"));
    const vault = path.join(root, "vault");
    await fs.mkdir(vault);

    const status = await inspectBackupSafety(app([root]), [repository(vault)]);

    expect(status.safe).toBe(false);
    expect(status.errors.join(" ")).toContain("inside backup source");
  });

  it("estimates selected source bytes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-size-"));
    const source = path.join(root, "source");
    const vault = path.join(root, "vault");
    await fs.mkdir(source);
    await fs.mkdir(vault);
    await fs.writeFile(path.join(source, "file.txt"), "1234567890");

    const status = await inspectBackupSafety(app([source]), [repository(vault)]);

    expect(status.safe).toBe(true);
    expect(status.estimatedSourceBytes).toBe(10);
    expect(status.freeBytes).toBeGreaterThan(0);
  });
});
