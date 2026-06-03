import fs from "node:fs/promises";
import path from "node:path";
import { decryptSecret } from "../crypto";
import { config } from "../config";
import { runCommand } from "../shell";
import type { App, Policy, Repository } from "../../shared/types";
import type { BackupEngineAdapter, EngineContext, EngineSnapshot, PruneResult } from "./types";

interface KopiaSnapshot {
  id: string;
  startTime: string;
  rootEntry: { summ: { size: number } };
}

function kopiaBinary() {
  return config.kopiaBinary;
}

function appTag(app: App) {
  return `frd-app:${app.id}`;
}

function repoPassword(ctx: EngineContext) {
  if (!ctx.passwordSecret) throw new Error("Repository password is required for Kopia vaults.");
  return decryptSecret<string>(ctx.passwordSecret);
}

async function runKopia(args: string[], onLine: (line: string) => void, password: string) {
  const result = await runCommand(kopiaBinary(), args, onLine, { ...process.env, KOPIA_PASSWORD: password });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `kopia exited with code ${result.code}`);
  }
  return result;
}

function repoPath(repository: Repository) {
  if (repository.type === "local") return repository.location;
  return path.join(config.dataDir, "kopia-cache", repository.id);
}

async function ensureRepo(repository: Repository, password: string, onLine: (line: string) => void) {
  const location = repoPath(repository);
  await fs.mkdir(location, { recursive: true });
  try {
    await runKopia(["repository", "status", "--config-file", path.join(location, "repository.config")], onLine, password);
  } catch {
    onLine(`Initializing Kopia repository at ${location}`);
    await runKopia([
      "repository", "create", "filesystem",
      "--path", location,
      "--config-file", path.join(location, "repository.config"),
      "--password", password
    ], onLine, password);
  }
}

function toSnapshot(app: App, snap: KopiaSnapshot): EngineSnapshot {
  return {
    id: snap.id,
    shortId: snap.id.slice(0, 8),
    appId: app.id,
    appName: app.name,
    createdAt: snap.startTime,
    archivePath: snap.id,
    sourcePaths: [],
    sizeBytes: snap.rootEntry?.summ?.size ?? 0
  };
}

export const kopiaEngine: BackupEngineAdapter = {
  async backup(app, repository, sourcePaths, onLine, ctx) {
    const password = repoPassword(ctx);
    await ensureRepo(repository, password, onLine);
    const location = repoPath(repository);
    const configFile = path.join(location, "repository.config");
    const tag = appTag(app);
    onLine(`Running Kopia backup for ${app.name}`);
    await runKopia([
      "snapshot", "create", ...sourcePaths,
      "--config-file", configFile,
      "--tags", tag
    ], onLine, password);
    const list = await runKopia(["snapshot", "list", "--json", "--config-file", configFile, "--tags", tag], onLine, password);
    const snapshots = JSON.parse(list.stdout || "[]") as KopiaSnapshot[];
    const latest = snapshots.sort((a, b) => b.startTime.localeCompare(a.startTime))[0];
    if (!latest) throw new Error("Kopia backup completed but no snapshot was found.");
    return toSnapshot(app, latest);
  },

  async restore(app, repository, snapshotId, targetDir, onLine, ctx) {
    const password = repoPassword(ctx);
    const location = repoPath(repository);
    const configFile = path.join(location, "repository.config");
    await fs.mkdir(targetDir, { recursive: true });
    onLine(`Restoring Kopia snapshot ${snapshotId}`);
    await runKopia([
      "snapshot", "restore", snapshotId, targetDir,
      "--config-file", configFile
    ], onLine, password);
    onLine(`Restored to ${targetDir}`);
  },

  async listSnapshots(app, repository, ctx) {
    const password = repoPassword(ctx);
    const location = repoPath(repository);
    const configFile = path.join(location, "repository.config");
    try {
      const list = await runKopia(["snapshot", "list", "--json", "--config-file", configFile, "--tags", appTag(app)], () => undefined, password);
      const snapshots = JSON.parse(list.stdout || "[]") as KopiaSnapshot[];
      return snapshots.sort((a, b) => b.startTime.localeCompare(a.startTime)).map((s) => toSnapshot(app, s));
    } catch {
      return [];
    }
  },

  async prune(app, repository, policy, onLine, ctx) {
    const password = repoPassword(ctx);
    const location = repoPath(repository);
    const configFile = path.join(location, "repository.config");
    const before = (await this.listSnapshots(app, repository, ctx)).length;
    await runKopia([
      "snapshot", "expire", "--config-file", configFile,
      "--keep-latest", String(Math.max(1, policy.retention.keepDaily + policy.retention.keepWeekly + policy.retention.keepMonthly)),
      "--tags", appTag(app)
    ], onLine, password);
    await runKopia(["maintenance", "run", "--config-file", configFile], onLine, password);
    const after = (await this.listSnapshots(app, repository, ctx)).length;
    return { kept: after, pruned: Math.max(0, before - after) };
  },

  async check(repository, onLine, ctx) {
    const password = repoPassword(ctx);
    const location = repoPath(repository);
    const configFile = path.join(location, "repository.config");
    await runKopia(["snapshot", "list", "--config-file", configFile], onLine, password);
    onLine(`Kopia repository ${repository.name} is reachable.`);
  }
};
