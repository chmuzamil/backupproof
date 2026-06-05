import crypto from "node:crypto";
import { Readable } from "node:stream";
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

type GoogleDriveClient = {
  files: {
    list(input: Record<string, unknown>): Promise<{ data: { files?: GoogleDriveFile[] } }>;
    create(input: Record<string, unknown>): Promise<{ data: { id?: string | null } }>;
    delete(input: { fileId: string }): Promise<unknown>;
    get(input: Record<string, unknown>, options?: Record<string, unknown>): Promise<{ data: ArrayBuffer }>;
  };
};

export interface GoogleDriveFile {
  id?: string | null;
  name?: string | null;
  size?: string | null;
  mimeType?: string | null;
}

async function loadGoogleApis() {
  try {
    const importer = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<{ google: any }>;
    return (await importer("googleapis")).google;
  } catch {
    throw new Error("Google Drive support needs the googleapis package. Run npm install and rebuild the app.");
  }
}

function cleanupExpired() {
  const cutoff = Date.now() - connectionTtlMs;
  for (const [key, value] of pendingOAuth) if (value.createdAt < cutoff) pendingOAuth.delete(key);
}

export function startGoogleDriveOAuth(input: { clientId: string; clientSecret: string; redirectUri: string }) {
  cleanupExpired();
  const state = crypto.randomBytes(24).toString("hex");
  pendingOAuth.set(state, { ...input, createdAt: Date.now() });
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope,
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function finishGoogleDriveOAuth(state: string, code: string) {
  const google = await loadGoogleApis();
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

export function peekGoogleDriveConnection(connectionId?: string) {
  if (!connectionId) return undefined;
  return connections.get(connectionId);
}

export async function googleDriveClient(credentialSecret?: string): Promise<GoogleDriveClient> {
  const google = await loadGoogleApis();
  if (!credentialSecret) throw new Error("Google Drive is not connected.");
  const credentials = decryptSecret<GoogleDriveCredentials>(credentialSecret);
  const auth = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);
  auth.setCredentials({ refresh_token: credentials.refreshToken });
  return google.drive({ version: "v3", auth });
}

function escapeQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findChild(drive: GoogleDriveClient, parentId: string, name: string, folder?: boolean) {
  const mime = folder ? " and mimeType = 'application/vnd.google-apps.folder'" : "";
  const result = await drive.files.list({
    q: `'${escapeQuery(parentId)}' in parents and name = '${escapeQuery(name)}' and trashed = false${mime}`,
    fields: "files(id,name,size)",
    spaces: "drive",
    pageSize: 10
  });
  return result.data.files?.[0];
}

export async function ensureGoogleDriveFolder(drive: GoogleDriveClient, location: string) {
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

export async function googleDrivePut(drive: GoogleDriveClient, parentId: string, name: string, data: Buffer | string, mimeType: string, skipExisting = false) {
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

export async function googleDriveGet(drive: GoogleDriveClient, parentId: string, name: string) {
  const file = await findChild(drive, parentId, name);
  if (!file?.id) throw new Error(`Google Drive file not found: ${name}`);
  const result = await drive.files.get({ fileId: file.id, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(result.data as ArrayBuffer);
}

export async function googleDriveList(drive: GoogleDriveClient, parentId: string): Promise<GoogleDriveFile[]> {
  const result = await drive.files.list({
    q: `'${escapeQuery(parentId)}' in parents and trashed = false`,
    fields: "files(id,name,size,mimeType)",
    spaces: "drive",
    pageSize: 1000
  });
  return result.data.files ?? [];
}

export async function googleDriveDelete(drive: GoogleDriveClient, parentId: string, name: string) {
  const file = await findChild(drive, parentId, name);
  if (file?.id) await drive.files.delete({ fileId: file.id });
}
