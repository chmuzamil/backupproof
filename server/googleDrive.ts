import crypto from "node:crypto";
import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";
import { decryptSecret } from "./crypto";

export interface GoogleDriveCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

interface PendingOAuth {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  createdAt: number;
}

const pendingOAuth = new Map<string, PendingOAuth>();
const connections = new Map<string, GoogleDriveCredentials>();
const connectionTtlMs = 15 * 60 * 1000;
const scope = "https://www.googleapis.com/auth/drive.file";

function cleanupExpired() {
  const cutoff = Date.now() - connectionTtlMs;
  for (const [key, value] of pendingOAuth) if (value.createdAt < cutoff) pendingOAuth.delete(key);
}

export function startGoogleDriveOAuth(input: { clientId: string; clientSecret: string; redirectUri: string }) {
  cleanupExpired();
  const state = crypto.randomBytes(24).toString("hex");
  pendingOAuth.set(state, { ...input, createdAt: Date.now() });
  const client = new google.auth.OAuth2(input.clientId, input.clientSecret, input.redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope,
    state
  });
}

export async function finishGoogleDriveOAuth(state: string, code: string) {
  const pending = pendingOAuth.get(state);
  pendingOAuth.delete(state);
  if (!pending) throw new Error("Google Drive connection expired. Start the connection again.");
  const client = new google.auth.OAuth2(pending.clientId, pending.clientSecret, pending.redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Reconnect and approve offline access.");
  const connectionId = crypto.randomBytes(24).toString("hex");
  connections.set(connectionId, {
    clientId: pending.clientId,
    clientSecret: pending.clientSecret,
    refreshToken: tokens.refresh_token
  });
  return connectionId;
}

export function consumeGoogleDriveConnection(connectionId?: string) {
  if (!connectionId) return undefined;
  const credentials = connections.get(connectionId);
  connections.delete(connectionId);
  return credentials;
}

export function googleDriveClient(credentialSecret?: string) {
  if (!credentialSecret) throw new Error("Google Drive is not connected.");
  const credentials = decryptSecret<GoogleDriveCredentials>(credentialSecret);
  const auth = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);
  auth.setCredentials({ refresh_token: credentials.refreshToken });
  return google.drive({ version: "v3", auth });
}

function escapeQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findChild(drive: drive_v3.Drive, parentId: string, name: string, folder?: boolean) {
  const mime = folder ? " and mimeType = 'application/vnd.google-apps.folder'" : "";
  const result = await drive.files.list({
    q: `'${escapeQuery(parentId)}' in parents and name = '${escapeQuery(name)}' and trashed = false${mime}`,
    fields: "files(id,name,size)",
    spaces: "drive",
    pageSize: 10
  });
  return result.data.files?.[0];
}

export async function ensureGoogleDriveFolder(drive: drive_v3.Drive, location: string) {
  let parentId = "root";
  for (const segment of location.split(/[\\/]/).map((item) => item.trim()).filter(Boolean)) {
    const existing = await findChild(drive, parentId, segment, true);
    if (existing?.id) {
      parentId = existing.id;
      continue;
    }
    const created = await drive.files.create({
      requestBody: { name: segment, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
      fields: "id"
    });
    if (!created.data.id) throw new Error(`Could not create Google Drive folder ${segment}`);
    parentId = created.data.id;
  }
  return parentId;
}

export async function googleDrivePut(drive: drive_v3.Drive, parentId: string, name: string, data: Buffer | string, mimeType: string, skipExisting = false) {
  const existing = await findChild(drive, parentId, name);
  if (existing?.id && skipExisting) return existing.id;
  if (existing?.id) await drive.files.delete({ fileId: existing.id });
  const created = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType, body: Readable.from([data]) },
    fields: "id"
  });
  if (!created.data.id) throw new Error(`Could not upload ${name} to Google Drive`);
  return created.data.id;
}

export async function googleDriveGet(drive: drive_v3.Drive, parentId: string, name: string) {
  const file = await findChild(drive, parentId, name);
  if (!file?.id) throw new Error(`Google Drive file not found: ${name}`);
  const result = await drive.files.get({ fileId: file.id, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(result.data as ArrayBuffer);
}

export async function googleDriveList(drive: drive_v3.Drive, parentId: string) {
  const result = await drive.files.list({
    q: `'${escapeQuery(parentId)}' in parents and trashed = false`,
    fields: "files(id,name,size,mimeType)",
    spaces: "drive",
    pageSize: 1000
  });
  return result.data.files ?? [];
}

export async function googleDriveDelete(drive: drive_v3.Drive, parentId: string, name: string) {
  const file = await findChild(drive, parentId, name);
  if (file?.id) await drive.files.delete({ fileId: file.id });
}
