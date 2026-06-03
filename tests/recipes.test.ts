import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { backupPathsForApp, databaseDumpCommand, runHealthCheck } from "../server/recipes";
import type { App } from "../shared/types";

const baseApp: App = {
  id: "app-1",
  name: "Nextcloud",
  composePath: "",
  projectName: "nextcloud",
  services: ["app", "db"],
  safeRestoreServices: ["db"],
  recipeType: "postgres",
  backupPaths: ["/srv/nextcloud/config", "/srv/nextcloud/data"],
  database: {
    service: "db",
    database: "nextcloud",
    username: "nextcloud",
    dumpPath: "/data/dumps/nextcloud.sql"
  },
  healthChecks: [],
  repositoryId: "repo-1",
  policyId: "policy-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("recipe helpers", () => {
  it("includes database dump paths in native backup inputs", () => {
    expect(backupPathsForApp(baseApp)).toEqual([
      "/srv/nextcloud/config",
      "/srv/nextcloud/data",
      "/data/dumps/nextcloud.sql"
    ]);
  });

  it("does not add dump paths for file-only recipes", () => {
    expect(backupPathsForApp({ ...baseApp, recipeType: "compose-files", database: undefined })).toEqual([
      "/srv/nextcloud/config",
      "/srv/nextcloud/data"
    ]);
  });

  it("passes v9 native restore proof when a restored file exists and contains expected text", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-proof-"));
    const restoredFile = path.join(root, "srv", "app", "config.yml");
    await fs.mkdir(path.dirname(restoredFile), { recursive: true });
    await fs.writeFile(restoredFile, "status: restorable");

    const result = await runHealthCheck(
      { id: "check-1", type: "file", target: "/srv/app/config.yml", expected: "restorable" },
      root,
      () => undefined
    );

    expect(result).toEqual({ checkId: "check-1", passed: true, message: "Restored file check passed" });
  });

  it("builds host-native PostgreSQL dump commands", () => {
    expect(databaseDumpCommand({ ...baseApp, database: { ...baseApp.database!, host: "db.local", port: 15432 } })).toEqual({
      command: "pg_dump",
      args: ["-h", "db.local", "-p", "15432", "-U", "nextcloud", "nextcloud"]
    });
  });

  it("builds host-native MySQL dump commands", () => {
    expect(databaseDumpCommand({ ...baseApp, recipeType: "mysql", database: { ...baseApp.database!, host: "db.local", port: 13306 } })).toEqual({
      command: "mysqldump",
      args: ["-h", "db.local", "-P", "13306", "-u", "nextcloud", "nextcloud"]
    });
  });
});
