import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { decryptSecret } from "./crypto";
import { getEngineAdapter } from "./engines";
import { frdSnapshots } from "./engines/frd/index";
import { cacheVaultDir, deleteSnapshot, localVaultDir } from "./engines/frd/vault";
import { resticRepoUrl } from "./engines/restic";
import { runRestic, resticSnapshots } from "./resticShell";
import { runCommand } from "./shell";
import type { Store } from "./store";

function resticEnv(password: string, repository: Parameters<typeof resticRepoUrl>[0], credentialSecret?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, RESTIC_PASSWORD: password };
  if (repository.type === "s3" || repository.type === "b2") {
    if (!credentialSecret) throw new Error("Cloud vault credentials are missing.");
    const creds = decryptSecret<{ accessKey?: string; secretKey?: string; region?: string }>(credentialSecret);
    if (creds.accessKey) env.AWS_ACCESS_KEY_ID = creds.accessKey;
    if (creds.secretKey) env.AWS_SECRET_ACCESS_KEY = creds.secretKey;
    if (creds.region) env.AWS_DEFAULT_REGION = creds.region;
  }
  return env;
}

async function deleteResticSnapshots(appId: string, repository: Parameters<typeof resticRepoUrl>[0], ctx: { passwordSecret?: string; credentialSecret?: string }, onLine: (line: string) => void) {
  const password = decryptSecret<string>(ctx.passwordSecret!);
  const repoUrl = resticRepoUrl(repository, ctx.credentialSecret);
  const tag = `frd-app:${appId}`;
  const env = resticEnv(password, repository, ctx.credentialSecret);
  const snapshots = await resticSnapshots(repoUrl, password, tag, onLine);
  for (const snap of snapshots) {
    await runRestic(["-r", repoUrl, "forget", snap.id, "--prune"], onLine, env);
    onLine(`Forgot Restic snapshot ${snap.short_id ?? snap.id}`);
  }
}

async function deleteKopiaSnapshots(app: { id: string; name: string }, repository: Parameters<typeof resticRepoUrl>[0], ctx: { passwordSecret?: string; credentialSecret?: string }, onLine: (line: string) => void) {
  const password = decryptSecret<string>(ctx.passwordSecret!);
  const location = repository.type === "local" ? repository.location : path.join(config.dataDir, "kopia-cache", repository.id);
  const configFile = path.join(location, "repository.config");
  const adapter = getEngineAdapter("kopia");
  const snapshots = await adapter.listSnapshots(app as never, repository, ctx);
  for (const snap of snapshots) {
    await runCommand(config.kopiaBinary, ["snapshot", "delete", snap.id, "--config-file", configFile, "--delete"], onLine, { ...process.env, KOPIA_PASSWORD: password });
    onLine(`Deleted Kopia snapshot ${snap.shortId ?? snap.id}`);
  }
  if (snapshots.length === 0) onLine(`No Kopia snapshots found for ${app.name}`);
}

export async function deleteAllSnapshots(store: Store, appId: string, onLine: (line: string) => void = () => undefined) {
  const state = store.snapshot();
  const app = state.apps.find((item) => item.id === appId);
  if (!app) throw new Error("App not found");
  const repository = state.repositories.find((item) => item.id === app.repositoryId);
  if (!repository) throw new Error("Repository not found");

  const ctx = {
    passwordSecret: store.getSecret(repository.passwordSecretId),
    credentialSecret: store.getSecret(repository.credentialSecretId)
  };

  if (repository.engine === "frd" || repository.engine === "native") {
    if (repository.type === "local") {
      await fs.rm(localVaultDir(repository, app.id), { recursive: true, force: true });
      onLine(`Removed local vault folder for ${app.name}`);
    } else {
      const snapshots = await frdSnapshots(app, repository, ctx);
      for (const snapshot of snapshots) {
        await deleteSnapshot(repository, app.id, snapshot.id, snapshot, ctx.credentialSecret);
        if (snapshot.format === "legacy-tgz") {
          await fs.rm(snapshot.archivePath, { force: true }).catch(() => undefined);
        }
      }
      await fs.rm(cacheVaultDir(repository, app.id), { recursive: true, force: true });
      onLine(`Removed ${snapshots.length} FRD snapshot(s) from ${repository.type} vault`);
    }
  } else if (repository.engine === "restic") {
    await deleteResticSnapshots(app.id, repository, ctx, onLine);
  } else if (repository.engine === "kopia") {
    await deleteKopiaSnapshots(app, repository, ctx, onLine);
  }

  await fs.rm(path.join(config.dataDir, "restore-tests", app.id), { recursive: true, force: true });
  await fs.rm(path.join(config.dataDir, "proof-reports", app.id), { recursive: true, force: true });
  await store.removeRestoreProofsForApp(appId);
  onLine("Cleared restore proofs and sandbox data");
}

export async function deleteApp(store: Store, appId: string, onLine: (line: string) => void = () => undefined) {
  await deleteAllSnapshots(store, appId, onLine);
  await store.removeApp(appId);
  await store.purgeJobHistory(appId);
  await store.removeAlertsForApp(appId);
  onLine(`Removed protected app ${appId}`);
}
