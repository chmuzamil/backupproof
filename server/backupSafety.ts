import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import type { App, BackupSafetyStatus, Repository } from "../shared/types";

const safetyCache = new Map<string, { expiresAt: number; status: BackupSafetyStatus }>();

function isInside(parent: string, child: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function directoryBytes(target: string): Promise<number> {
  const stat = await fs.stat(target);
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;

  let total = 0;
  for (const entry of await fs.readdir(target, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    total += await directoryBytes(path.join(target, entry.name));
  }
  return total;
}

async function nearestExisting(target: string) {
  let current = path.resolve(target);
  while (true) {
    try {
      await fs.access(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`No accessible parent found for ${target}`);
      current = parent;
    }
  }
}

export async function inspectBackupSafety(app: App, repositories: Repository[]): Promise<BackupSafetyStatus> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const localRepositories = repositories.filter((repository) => repository.type === "local");
  const resolvedSources = app.backupPaths.map((source) => path.resolve(source));

  for (const source of resolvedSources) {
    try {
      await fs.access(source);
    } catch {
      errors.push(`Source path is not readable: ${source}`);
    }

    for (const repository of localRepositories) {
      if (isInside(source, repository.location)) {
        errors.push(`Vault "${repository.name}" is inside backup source ${source}. Move the vault outside the protected folders.`);
      }
    }
    if (isInside(source, config.dataDir)) {
      warnings.push(`Dashboard data is inside backup source ${source}. This may create unnecessary backup growth.`);
    }
  }

  let estimatedSourceBytes = 0;
  try {
    for (const source of resolvedSources) estimatedSourceBytes += await directoryBytes(source);
  } catch (error) {
    warnings.push(error instanceof Error ? `Could not fully estimate backup size: ${error.message}` : "Could not fully estimate backup size.");
  }

  let freeBytes: number | undefined;
  if (localRepositories[0]) {
    try {
      const parent = await nearestExisting(localRepositories[0].location);
      const stat = await fs.statfs(parent);
      freeBytes = stat.bavail * stat.bsize;
      const required = Math.ceil(estimatedSourceBytes * 1.15);
      if (freeBytes < required) {
        errors.push(`Local vault may run out of space. Need about ${required} bytes, but only ${freeBytes} bytes are free.`);
      } else if (freeBytes < required * 2) {
        warnings.push("Local vault free space is less than twice the estimated backup size.");
      }
    } catch (error) {
      warnings.push(error instanceof Error ? `Could not check local vault free space: ${error.message}` : "Could not check local vault free space.");
    }
  }

  return {
    safe: errors.length === 0,
    checkedAt: new Date().toISOString(),
    estimatedSourceBytes,
    freeBytes,
    errors,
    warnings
  };
}

export async function inspectBackupSafetyCached(app: App, repositories: Repository[], maxAgeMs = 60_000) {
  const key = JSON.stringify({
    appId: app.id,
    updatedAt: app.updatedAt,
    paths: app.backupPaths,
    repositories: repositories.map((repository) => [repository.id, repository.updatedAt, repository.type, repository.location])
  });
  const cached = safetyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.status;
  const status = await inspectBackupSafety(app, repositories);
  safetyCache.set(key, { expiresAt: Date.now() + maxAgeMs, status });
  return status;
}

export async function assertBackupSafety(app: App, repositories: Repository[], onLine: (line: string) => void) {
  const status = await inspectBackupSafety(app, repositories);
  onLine(`Preflight: ${status.estimatedSourceBytes} source bytes estimated${status.freeBytes === undefined ? "" : `, ${status.freeBytes} bytes free`}.`);
  for (const warning of status.warnings) onLine(`Preflight warning: ${warning}`);
  if (!status.safe) throw new Error(`Backup safety check failed: ${status.errors.join(" ")}`);
  onLine("Preflight safety checks passed.");
  return status;
}
