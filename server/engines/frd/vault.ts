import { config } from "../../config";
import fs from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import SftpClient from "ssh2-sftp-client";
import { decryptSecret } from "../../crypto";
import type { Repository } from "../../../shared/types";

export interface S3Credentials {
  accessKey: string;
  secretKey: string;
  region?: string;
  endpoint?: string;
}

interface SftpCredentials {
  host: string;
  port?: string | number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export function appVaultPrefix(repository: Repository, appId: string) {
  const base = repository.location.replace(/\\/g, "/").replace(/\/$/, "");
  return `${base}/${appId}`;
}

export function localVaultDir(repository: Repository, appId: string) {
  return path.resolve(appVaultPrefix(repository, appId));
}

export function cacheVaultDir(repository: Repository, appId: string) {
  return path.join(config.dataDir, "vault-cache", repository.id, appId);
}

function repositoryParts(location: string) {
  return location.replace(/\\/g, "/").replace(/^\//, "").split("/").filter(Boolean);
}

function sftpConfig(credentialSecret?: string) {
  if (!credentialSecret) throw new Error("SFTP vault credentials are missing.");
  const credentials = decryptSecret<SftpCredentials>(credentialSecret);
  return {
    host: credentials.host,
    port: Number(credentials.port ?? 22),
    username: credentials.username,
    password: credentials.password,
    privateKey: credentials.privateKey,
    passphrase: credentials.passphrase
  };
}

export function parseS3Location(location: string) {
  const parts = repositoryParts(location);
  if (parts.length === 0) throw new Error("S3 location must include bucket name");
  return { bucket: parts[0], prefix: parts.slice(1).join("/") };
}

function s3Key(repository: Repository, appId: string, ...parts: string[]) {
  const { bucket, prefix } = parseS3Location(repository.location);
  const keyParts = [prefix, appId, ...parts].filter(Boolean).join("/");
  return { bucket, key: keyParts };
}

export async function withSftp<T>(credentialSecret: string | undefined, fn: (client: SftpClient) => Promise<T>) {
  const client = new SftpClient();
  try {
    await client.connect(sftpConfig(credentialSecret));
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function ensureSftpDir(client: SftpClient, dir: string) {
  const parts = dir.replace(/\\/g, "/").split("/").filter(Boolean);
  let current = dir.startsWith("/") ? "/" : "";
  for (const part of parts) {
    current = current === "/" ? `/${part}` : current ? `${current}/${part}` : part;
    if (!(await client.exists(current))) await client.mkdir(current);
  }
}

export async function writeSnapshotMeta(repository: Repository, appId: string, snapshotId: string, json: string, credentialSecret?: string) {
  if (repository.type === "local") {
    const dir = localVaultDir(repository, appId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${snapshotId}.json`), json);
    return;
  }
  if (repository.type === "sftp") {
    const cache = cacheVaultDir(repository, appId);
    await fs.mkdir(cache, { recursive: true });
    await fs.writeFile(path.join(cache, `${snapshotId}.json`), json);
    const remoteDir = appVaultPrefix(repository, appId);
    await withSftp(credentialSecret, async (client) => {
      await ensureSftpDir(client, remoteDir);
      await client.put(Buffer.from(json), `${remoteDir}/${snapshotId}.json`);
    });
    return;
  }
  if (repository.type === "s3" || repository.type === "b2") {
    const creds = decryptSecret<S3Credentials>(credentialSecret!);
    const { bucket, key } = s3Key(repository, appId, `${snapshotId}.json`);
    const client = new S3Client({
      region: creds.region ?? "us-east-1",
      endpoint: creds.endpoint || undefined,
      forcePathStyle: Boolean(creds.endpoint),
      credentials: { accessKeyId: creds.accessKey, secretAccessKey: creds.secretKey }
    });
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: json, ContentType: "application/json" }));
  }
}

export async function writeChunk(repository: Repository, appId: string, chunkName: string, data: Buffer, credentialSecret?: string) {
  if (repository.type === "local") {
    const dir = path.join(localVaultDir(repository, appId), "chunks");
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, chunkName);
    if (await fs.stat(target).catch(() => false)) return;
    await fs.writeFile(target, data);
    return;
  }
  if (repository.type === "sftp") {
    const cache = path.join(cacheVaultDir(repository, appId), "chunks");
    await fs.mkdir(cache, { recursive: true });
    await fs.writeFile(path.join(cache, chunkName), data);
    const remoteDir = `${appVaultPrefix(repository, appId)}/chunks`;
    await withSftp(credentialSecret, async (client) => {
      await ensureSftpDir(client, remoteDir);
      const remote = `${remoteDir}/${chunkName}`;
      if (await client.exists(remote)) return;
      await client.put(data, remote);
    });
    return;
  }
  if (repository.type === "s3" || repository.type === "b2") {
    const creds = decryptSecret<S3Credentials>(credentialSecret!);
    const { bucket, key } = s3Key(repository, appId, "chunks", chunkName);
    const client = new S3Client({
      region: creds.region ?? "us-east-1",
      endpoint: creds.endpoint || undefined,
      forcePathStyle: Boolean(creds.endpoint),
      credentials: { accessKeyId: creds.accessKey, secretAccessKey: creds.secretKey }
    });
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      /* bucket must exist */
    }
    const upload = new Upload({
      client,
      params: { Bucket: bucket, Key: key, Body: data, ContentType: "application/octet-stream" }
    });
    await upload.done();
  }
}

export async function readChunk(repository: Repository, appId: string, chunkName: string, credentialSecret?: string) {
  if (repository.type === "local") {
    return fs.readFile(path.join(localVaultDir(repository, appId), "chunks", chunkName));
  }
  if (repository.type === "sftp") {
    const cache = path.join(cacheVaultDir(repository, appId), "chunks", chunkName);
    try {
      return fs.readFile(cache);
    } catch {
      const remote = `${appVaultPrefix(repository, appId)}/chunks/${chunkName}`;
      await fs.mkdir(path.dirname(cache), { recursive: true });
      await withSftp(credentialSecret, async (client) => {
        await client.fastGet(remote, cache);
      });
      return fs.readFile(cache);
    }
  }
  if (repository.type === "s3" || repository.type === "b2") {
    const creds = decryptSecret<S3Credentials>(credentialSecret!);
    const { bucket, key } = s3Key(repository, appId, "chunks", chunkName);
    const client = new S3Client({
      region: creds.region ?? "us-east-1",
      endpoint: creds.endpoint || undefined,
      forcePathStyle: Boolean(creds.endpoint),
      credentials: { accessKeyId: creds.accessKey, secretAccessKey: creds.secretKey }
    });
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await result.Body!.transformToByteArray());
  }
  throw new Error(`Unsupported vault type: ${repository.type}`);
}

export async function listSnapshotMetas(repository: Repository, appId: string, credentialSecret?: string) {
  if (repository.type === "local") {
    const dir = localVaultDir(repository, appId);
    try {
      const files = await fs.readdir(dir);
      return files.filter((f) => f.endsWith(".json") && !f.includes("latest"));
    } catch {
      return [];
    }
  }
  if (repository.type === "sftp") {
    return withSftp(credentialSecret, async (client) => {
      const remoteDir = appVaultPrefix(repository, appId);
      if (!(await client.exists(remoteDir))) return [];
      const files = await client.list(remoteDir);
      return files.filter((f) => f.name.endsWith(".json")).map((f) => f.name);
    });
  }
  if (repository.type === "s3" || repository.type === "b2") {
    const creds = decryptSecret<S3Credentials>(credentialSecret!);
    const { bucket, prefix } = parseS3Location(repository.location);
    const fullPrefix = [prefix, appId].filter(Boolean).join("/");
    const client = new S3Client({
      region: creds.region ?? "us-east-1",
      endpoint: creds.endpoint || undefined,
      forcePathStyle: Boolean(creds.endpoint),
      credentials: { accessKeyId: creds.accessKey, secretAccessKey: creds.secretKey }
    });
    const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: fullPrefix ? `${fullPrefix}/` : "" }));
    return (result.Contents ?? [])
      .map((o) => o.Key?.split("/").pop() ?? "")
      .filter((name) => name.endsWith(".json"));
  }
  return [];
}

export async function readSnapshotMeta(repository: Repository, appId: string, snapshotId: string, credentialSecret?: string) {
  if (repository.type === "local") {
    return fs.readFile(path.join(localVaultDir(repository, appId), `${snapshotId}.json`), "utf8");
  }
  if (repository.type === "sftp") {
    const cache = path.join(cacheVaultDir(repository, appId), `${snapshotId}.json`);
    try {
      return fs.readFile(cache, "utf8");
    } catch {
      const remote = `${appVaultPrefix(repository, appId)}/${snapshotId}.json`;
      await fs.mkdir(path.dirname(cache), { recursive: true });
      await withSftp(credentialSecret, async (client) => {
        await client.fastGet(remote, cache);
      });
      return fs.readFile(cache, "utf8");
    }
  }
  if (repository.type === "s3" || repository.type === "b2") {
    const creds = decryptSecret<S3Credentials>(credentialSecret!);
    const { bucket, key } = s3Key(repository, appId, `${snapshotId}.json`);
    const client = new S3Client({
      region: creds.region ?? "us-east-1",
      endpoint: creds.endpoint || undefined,
      forcePathStyle: Boolean(creds.endpoint),
      credentials: { accessKeyId: creds.accessKey, secretAccessKey: creds.secretKey }
    });
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await result.Body!.transformToByteArray()).toString("utf8");
  }
  throw new Error(`Unsupported vault type: ${repository.type}`);
}

export async function deleteSnapshot(repository: Repository, appId: string, snapshotId: string, meta: { files?: { chunk: string }[] }, credentialSecret?: string) {
  if (repository.type === "local") {
    await fs.rm(path.join(localVaultDir(repository, appId), `${snapshotId}.json`), { force: true });
    return;
  }
  if (repository.type === "sftp") {
    const remoteDir = appVaultPrefix(repository, appId);
    await withSftp(credentialSecret, async (client) => {
      await client.delete(`${remoteDir}/${snapshotId}.json`).catch(() => undefined);
    });
    await fs.rm(path.join(cacheVaultDir(repository, appId), `${snapshotId}.json`), { force: true });
  }
  if (repository.type === "s3" || repository.type === "b2") {
    const creds = decryptSecret<S3Credentials>(credentialSecret!);
    const { bucket, key } = s3Key(repository, appId, `${snapshotId}.json`);
    const client = new S3Client({
      region: creds.region ?? "us-east-1",
      endpoint: creds.endpoint || undefined,
      forcePathStyle: Boolean(creds.endpoint),
      credentials: { accessKeyId: creds.accessKey, secretAccessKey: creds.secretKey }
    });
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}

export async function checkVault(repository: Repository, credentialSecret?: string) {
  if (repository.type === "local") {
    await fs.mkdir(repository.location, { recursive: true });
    await fs.access(repository.location);
    return;
  }
  if (repository.type === "sftp") {
    await withSftp(credentialSecret, async (client) => {
      await client.list(repository.location);
    });
    return;
  }
  if (repository.type === "s3" || repository.type === "b2") {
    const creds = decryptSecret<S3Credentials>(credentialSecret!);
    const { bucket } = parseS3Location(repository.location);
    const client = new S3Client({
      region: creds.region ?? "us-east-1",
      endpoint: creds.endpoint || undefined,
      forcePathStyle: Boolean(creds.endpoint),
      credentials: { accessKeyId: creds.accessKey, secretAccessKey: creds.secretKey }
    });
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  }
}
