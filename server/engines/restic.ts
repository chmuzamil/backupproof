import fs from "node:fs/promises";
import path from "node:path";
import { decryptSecret } from "../crypto";
import { config } from "../config";
import { resticSnapshots, runRestic } from "../resticShell";
import type { App, Policy, Repository } from "../../shared/types";
import type { BackupEngineAdapter, EngineContext, EngineSnapshot, PruneResult } from "./types";

interface S3Credentials {
  accessKey?: string;
  secretKey?: string;
  region?: string;
  endpoint?: string;
}

function appTag(app: App) {
  return `frd-app:${app.id}`;
}

function repoPassword(ctx: EngineContext) {
  if (!ctx.passwordSecret) throw new Error("Repository password is required for Restic vaults.");
  return decryptSecret<string>(ctx.passwordSecret);
}

function resticEnv(password: string, repository: Repository, credentialSecret?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, RESTIC_PASSWORD: password };
  if (repository.type === "s3" || repository.type === "b2") {
    if (!credentialSecret) throw new Error("Cloud vault credentials are missing.");
    const creds = decryptSecret<S3Credentials>(credentialSecret);
    if (creds.accessKey) env.AWS_ACCESS_KEY_ID = creds.accessKey;
    if (creds.secretKey) env.AWS_SECRET_ACCESS_KEY = creds.secretKey;
    if (creds.region) env.AWS_DEFAULT_REGION = creds.region;
  }
  if (repository.objectLock) {
    env.RESTIC_REPOSITORY = repository.location;
  }
  return env;
}

export function resticRepoUrl(repository: Repository, credentialSecret?: string): string {
  if (repository.type === "local") {
    return repository.location;
  }
  if (repository.type === "sftp") {
    if (!credentialSecret) throw new Error("SFTP credentials are missing.");
    const creds = decryptSecret<{ host: string; port?: string; username: string; password?: string }>(credentialSecret);
    const port = creds.port ?? "22";
    return `sftp:${creds.username}@${creds.host}:${port}${repository.location}`;
  }
  if (repository.type === "s3") {
    if (!credentialSecret) throw new Error("S3 credentials are missing.");
    const creds = decryptSecret<S3Credentials>(credentialSecret);
    const endpoint = creds.endpoint ?? "s3.amazonaws.com";
    return `s3:${endpoint}/${repository.location}`;
  }
  if (repository.type === "b2") {
    if (!credentialSecret) throw new Error("B2 credentials are missing.");
    const creds = decryptSecret<S3Credentials>(credentialSecret);
    const endpoint = creds.endpoint ?? "s3.us-west-000.backblazeb2.com";
    return `s3:${endpoint}/${repository.location}`;
  }
  throw new Error(`Unsupported Restic repository type: ${repository.type}`);
}

async function ensureRepo(repository: Repository, password: string, ctx: EngineContext, onLine: (line: string) => void) {
  const repoUrl = resticRepoUrl(repository, ctx.credentialSecret);
  const env = resticEnv(password, repository, ctx.credentialSecret);
  try {
    await runRestic(["-r", repoUrl, "snapshots"], onLine, env);
  } catch {
    onLine(`Initializing Restic repository at ${repoUrl}`);
    await runRestic(["-r", repoUrl, "init"], onLine, env);
  }
}

function toEngineSnapshot(app: App, snap: { id: string; short_id: string; time: string; paths: string[] }, sizeBytes = 0): EngineSnapshot {
  return {
    id: snap.id,
    shortId: snap.short_id,
    appId: app.id,
    appName: app.name,
    createdAt: snap.time,
    archivePath: snap.id,
    sourcePaths: snap.paths ?? [],
    sizeBytes
  };
}

export const resticEngine: BackupEngineAdapter = {
  async backup(app, repository, sourcePaths, onLine, ctx) {
    const password = repoPassword(ctx);
    await ensureRepo(repository, password, ctx, onLine);
    const repoUrl = resticRepoUrl(repository, ctx.credentialSecret);
    const env = resticEnv(password, repository, ctx.credentialSecret);
    const tag = appTag(app);
    const args = ["-r", repoUrl, "backup", ...sourcePaths, "--tag", tag, "--json"];
    const limit = repository.bandwidthLimitKbps ?? config.defaultBandwidthLimitKbps;
    if (limit > 0) args.push("--limit-upload", String(Math.round(limit * 1024)));

    onLine(`Running Restic backup for ${app.name}`);
    const result = await runRestic(args, onLine, env);
    const summary = result.stdout.trim() ? JSON.parse(result.stdout.split("\n").filter(Boolean).pop()!) as { snapshot_id: string; total_bytes_processed: number } : null;
    const snapshots = await resticSnapshots(repoUrl, password, tag, onLine);
    const latest = snapshots[0];
    if (!latest) throw new Error("Restic backup completed but no snapshot was found.");
    return toEngineSnapshot(app, latest, summary?.total_bytes_processed ?? 0);
  },

  async restore(app, repository, snapshotId, targetDir, onLine, ctx, options) {
    const password = repoPassword(ctx);
    const repoUrl = resticRepoUrl(repository, ctx.credentialSecret);
    const env = resticEnv(password, repository, ctx.credentialSecret);
    await fs.mkdir(targetDir, { recursive: true });
    const args = ["-r", repoUrl, "restore", snapshotId, "--target", targetDir];
    if (options?.paths?.length) {
      for (const p of options.paths) args.push("--include", p);
    }
    onLine(`Restoring Restic snapshot ${snapshotId}`);
    await runRestic(args, onLine, env);
    onLine(`Restored to ${targetDir}`);
  },

  async listSnapshots(app, repository, ctx) {
    const password = repoPassword(ctx);
    const repoUrl = resticRepoUrl(repository, ctx.credentialSecret);
    const snapshots = await resticSnapshots(repoUrl, password, appTag(app), () => undefined);
    return snapshots.map((s) => toEngineSnapshot(app, s));
  },

  async prune(app, repository, policy, onLine, ctx) {
    const password = repoPassword(ctx);
    const repoUrl = resticRepoUrl(repository, ctx.credentialSecret);
    const env = resticEnv(password, repository, ctx.credentialSecret);
    const tag = appTag(app);
    const before = (await resticSnapshots(repoUrl, password, tag, onLine)).length;
    const args = [
      "-r", repoUrl, "forget", "--tag", tag,
      "--keep-daily", String(policy.retention.keepDaily),
      "--keep-weekly", String(policy.retention.keepWeekly),
      "--keep-monthly", String(policy.retention.keepMonthly),
      "--prune"
    ];
    await runRestic(args, onLine, env);
    const after = (await resticSnapshots(repoUrl, password, tag, onLine)).length;
    return { kept: after, pruned: Math.max(0, before - after) };
  },

  async check(repository, onLine, ctx) {
    const password = repoPassword(ctx);
    const repoUrl = resticRepoUrl(repository, ctx.credentialSecret);
    const env = resticEnv(password, repository, ctx.credentialSecret);
    await runRestic(["-r", repoUrl, "check"], onLine, env);
    onLine(`Restic repository ${repository.name} passed integrity check.`);
  }
};
