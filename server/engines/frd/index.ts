import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";
import { config } from "../../config";
import { decryptSecret } from "../../crypto";
import type { App, Policy, Repository } from "../../../shared/types";
import type { BackupEngineAdapter, EngineContext, EngineSnapshot, PruneResult } from "../types";
import { decryptChunk, encryptChunk, sha256Buffer } from "./chunkCrypto";
import { buildManifest, diffManifest, type FrdSnapshotMeta, type ManifestEntry } from "./manifest";
import {
  appVaultPrefix,
  cacheVaultDir,
  checkVault,
  deleteSnapshot,
  listSnapshotMetas,
  localVaultDir,
  readChunk,
  readSnapshotMeta,
  withSftp,
  writeChunk,
  writeSnapshotMeta
} from "./vault";

function safeSnapshotId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function repoPassword(ctx: EngineContext, onLine?: (line: string) => void) {
  if (ctx.passwordSecret) return decryptSecret<string>(ctx.passwordSecret);
  onLine?.("Warning: no vault passphrase set — using server encryption key for this local vault.");
  return config.encryptionKey;
}

async function existingPaths(paths: string[]) {
  const found: string[] = [];
  for (const item of paths) {
    try {
      await fs.access(item);
      found.push(path.resolve(item));
    } catch {
      throw new Error(`Backup path is not readable: ${item}`);
    }
  }
  return found;
}

async function loadPreviousManifest(repository: Repository, app: App, ctx: EngineContext): Promise<ManifestEntry[]> {
  const snapshots = await listSnapshotsInternal(app, repository, ctx);
  const latest = snapshots.find((s) => s.format === "frd-v1");
  if (!latest?.files) return [];
  return latest.files;
}

async function listSnapshotsInternal(app: App, repository: Repository, ctx: EngineContext): Promise<FrdSnapshotMeta[]> {
  const ids = await listSnapshotMetas(repository, app.id, ctx.credentialSecret);
  const snapshots: FrdSnapshotMeta[] = [];
  for (const file of ids) {
    const snapshotId = file.replace(/\.json$/, "");
    try {
      const text = await readSnapshotMeta(repository, app.id, snapshotId, ctx.credentialSecret);
      snapshots.push(JSON.parse(text) as FrdSnapshotMeta);
    } catch {
      /* skip corrupt meta */
    }
  }

  if (repository.type === "local") {
    const dir = localVaultDir(repository, app.id);
    try {
      const files = await fs.readdir(dir);
      for (const file of files.filter((f) => f.endsWith(".tgz"))) {
        const id = file.replace(/\.tgz$/, "");
        if (snapshots.some((s) => s.id === id)) continue;
        const stat = await fs.stat(path.join(dir, file));
        snapshots.push({
          id,
          format: "legacy-tgz",
          appId: app.id,
          appName: app.name,
          createdAt: id.replace(/-/g, ":").slice(0, 24),
          archivePath: path.join(dir, file),
          sourcePaths: app.backupPaths,
          sizeBytes: stat.size
        });
      }
    } catch {
      /* no local dir */
    }
  }

  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function frdBackup(app: App, repository: Repository, sourcePaths: string[], onLine: (line: string) => void, ctx: EngineContext) {
  const password = repoPassword(ctx, onLine);
  const resolvedPaths = await existingPaths(sourcePaths);
  const snapshotId = safeSnapshotId();
  onLine(`Building FRD incremental manifest for ${app.name}`);

  const current = await buildManifest(resolvedPaths, onLine);
  const previous = await loadPreviousManifest(repository, app, ctx);
  const changed = previous.length ? diffManifest(previous, current) : current;
  onLine(`${changed.length} of ${current.length} files need backup (${previous.length ? "incremental" : "full"})`);

  let sizeBytes = 0;
  for (const entry of changed) {
    const { readFileForEntry } = await import("./manifest");
    const raw = await readFileForEntry(resolvedPaths, entry);
    const encrypted = encryptChunk(password, raw);
    await writeChunk(repository, app.id, entry.chunk, encrypted, ctx.credentialSecret);
    const stored = await readChunk(repository, app.id, entry.chunk, ctx.credentialSecret);
    const verified = decryptChunk(password, stored);
    if (sha256Buffer(verified) !== entry.sha256) {
      throw new Error(`Integrity verification failed for ${entry.path}`);
    }
    sizeBytes += encrypted.length;
    onLine(`Stored and verified encrypted chunk ${entry.chunk}`);
  }

  const parent = (await listSnapshotsInternal(app, repository, ctx)).find((s) => s.format === "frd-v1");
  const snapshot: FrdSnapshotMeta = {
    id: snapshotId,
    format: "frd-v1",
    appId: app.id,
    appName: app.name,
    createdAt: new Date().toISOString(),
    archivePath: `${appVaultPrefix(repository, app.id)}/${snapshotId}.json`,
    sourcePaths: resolvedPaths,
    sizeBytes,
    files: current,
    parentSnapshotId: parent?.id,
    changedFiles: changed.length,
    totalFiles: current.length
  };

  await writeSnapshotMeta(repository, app.id, snapshotId, JSON.stringify(snapshot, null, 2), ctx.credentialSecret);
  onLine(`FRD snapshot ${snapshotId} saved (${changed.length} changed files, ${current.length} total tracked)`);
  return snapshot as EngineSnapshot;
}

async function frdRestore(app: App, repository: Repository, snapshotId: string, targetDir: string, onLine: (line: string) => void, ctx: EngineContext, options?: { paths?: string[] }) {
  await fs.mkdir(targetDir, { recursive: true });
  const text = await readSnapshotMeta(repository, app.id, snapshotId, ctx.credentialSecret);
  const meta = JSON.parse(text) as FrdSnapshotMeta;

  if (meta.format === "legacy-tgz") {
    return legacyTgzRestore(app, repository, snapshotId, targetDir, onLine, ctx.credentialSecret);
  }

  const password = repoPassword(ctx, onLine);
  const files = options?.paths?.length
    ? meta.files?.filter((f) => options.paths!.some((p) => f.path === p || f.path.startsWith(`${p.replace(/\/$/, "")}/`))) ?? []
    : meta.files ?? [];

  onLine(`Restoring FRD snapshot ${snapshotId} (${files.length} files)`);
  for (const entry of files) {
    const encrypted = await readChunk(repository, app.id, entry.chunk, ctx.credentialSecret);
    const raw = decryptChunk(password, encrypted);
    const dest = path.join(targetDir, entry.path);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, raw);
  }
  onLine(`Restored to ${targetDir}`);
}

async function legacyTgzRestore(app: App, repository: Repository, snapshotId: string, targetDir: string, onLine: (line: string) => void, credentialSecret?: string) {
  const vaultDir = repository.type === "local" ? localVaultDir(repository, app.id) : cacheVaultDir(repository, app.id);
  const archivePath = path.join(vaultDir, `${snapshotId}.tgz`);
  await fs.mkdir(vaultDir, { recursive: true });
  if (repository.type === "sftp") {
    const remoteArchivePath = `${appVaultPrefix(repository, app.id)}/${snapshotId}.tgz`;
    onLine(`Downloading legacy backup bundle ${snapshotId}`);
    await withSftp(credentialSecret, async (client) => {
      await client.fastGet(remoteArchivePath, archivePath);
    });
  }
  onLine(`Restoring legacy tar bundle ${snapshotId}`);
  await tar.x({ file: archivePath, cwd: targetDir, preservePaths: false });
  onLine(`Bundle restored to ${targetDir}`);
}

async function frdPrune(app: App, repository: Repository, policy: Policy, onLine: (line: string) => void, ctx: EngineContext): Promise<PruneResult> {
  const keepCount = Math.max(1, policy.retention.keepDaily + policy.retention.keepWeekly + policy.retention.keepMonthly);
  const snapshots = await listSnapshotsInternal(app, repository, ctx);
  const doomed = snapshots.slice(keepCount);
  for (const snapshot of doomed) {
    await deleteSnapshot(repository, app.id, snapshot.id, snapshot, ctx.credentialSecret);
    if (snapshot.format === "legacy-tgz" && repository.type === "local") {
      await fs.rm(snapshot.archivePath, { force: true });
    }
    onLine(`Pruned snapshot ${snapshot.id}`);
  }
  return { kept: Math.min(snapshots.length, keepCount), pruned: doomed.length };
}

export const frdEngine: BackupEngineAdapter = {
  backup(app, repository, sourcePaths, onLine, ctx) {
    if (!["local", "sftp", "s3", "b2", "google-drive"].includes(repository.type)) {
      throw new Error(`FRD engine supports local, sftp, s3, b2, and Google Drive vaults. Got: ${repository.type}`);
    }
    return frdBackup(app, repository, sourcePaths, onLine, ctx);
  },
  restore(app, repository, snapshotId, targetDir, onLine, ctx, options) {
    return frdRestore(app, repository, snapshotId, targetDir, onLine, ctx, options);
  },
  async listSnapshots(app, repository, ctx) {
    return listSnapshotsInternal(app, repository, ctx) as Promise<EngineSnapshot[]>;
  },
  prune(app, repository, policy, onLine, ctx) {
    return frdPrune(app, repository, policy, onLine, ctx);
  },
  async check(repository, onLine, ctx) {
    await checkVault(repository, ctx.credentialSecret);
    onLine(`FRD vault ${repository.name} is reachable.`);
  }
};

export { frdBackup, frdRestore, listSnapshotsInternal as frdSnapshots };
