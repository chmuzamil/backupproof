import type { RepositoryType } from "./types";

export type StoragePresetId =
  | "this-computer"
  | "usb-drive"
  | "google-drive"
  | "another-server"
  | "s3-cloud"
  | "backblaze";

export interface StoragePreset {
  id: StoragePresetId;
  title: string;
  description: string;
  repoType: RepositoryType;
  defaultLocation: string;
  locationPlaceholder: string;
}

export const STORAGE_PRESETS: StoragePreset[] = [
  {
    id: "this-computer",
    title: "This computer",
    description: "Save copies on this machine, outside the folders you protect.",
    repoType: "local",
    defaultLocation: ".data/vaults/primary",
    locationPlaceholder: ".data/vaults/my-backups"
  },
  {
    id: "usb-drive",
    title: "Attached drive or USB",
    description: "Use an external drive for an extra copy close at hand.",
    repoType: "local",
    defaultLocation: "/mnt/backup",
    locationPlaceholder: "D:\\Backups or /mnt/usb/backups"
  },
  {
    id: "google-drive",
    title: "Google Drive",
    description: "Keep a cloud copy in your own Google account.",
    repoType: "google-drive",
    defaultLocation: "BackupProof/My server",
    locationPlaceholder: "BackupProof/My server"
  },
  {
    id: "another-server",
    title: "Another server",
    description: "Send copies to a different computer over SFTP.",
    repoType: "sftp",
    defaultLocation: "/backups",
    locationPlaceholder: "/backups/my-data"
  },
  {
    id: "s3-cloud",
    title: "S3 cloud storage",
    description: "Use Amazon S3 or any S3-compatible provider.",
    repoType: "s3",
    defaultLocation: "my-bucket/backups",
    locationPlaceholder: "my-bucket/backups"
  },
  {
    id: "backblaze",
    title: "Backblaze B2",
    description: "Low-cost cloud storage with an S3-compatible API.",
    repoType: "b2",
    defaultLocation: "my-bucket/backups",
    locationPlaceholder: "my-bucket/backups"
  }
];

export function friendlyStorageLabel(type: RepositoryType) {
  return {
    local: "This computer or an attached drive",
    sftp: "Another server",
    s3: "S3-compatible cloud storage",
    b2: "Backblaze B2",
    "google-drive": "Google Drive"
  }[type];
}

export function storageLocationHint(type: RepositoryType) {
  return {
    local: "Choose a folder that is not inside the data you are protecting.",
    sftp: "Folder on the other server, for example /backups/my-family-photos.",
    s3: "Bucket and optional folder, for example my-bucket/backups.",
    b2: "Bucket and optional folder in Backblaze B2.",
    "google-drive": "Folder name in Google Drive, for example BackupProof/My server."
  }[type];
}

export interface StorageFormCredentials {
  host?: string;
  port?: string;
  username?: string;
  password?: string;
  accessKey?: string;
  secretKey?: string;
  region?: string;
  endpoint?: string;
}

export interface StorageFormPayload {
  name: string;
  engine: "frd" | "restic" | "kopia";
  type: RepositoryType;
  location: string;
  password?: string;
  credentials?: Record<string, string>;
  googleConnectionId?: string;
}

export function supportsImmutableStorage(type: RepositoryType) {
  return type === "s3" || type === "b2";
}

export function buildRepositoryPayload(input: {
  name: string;
  engine: "frd" | "restic" | "kopia";
  type: RepositoryType;
  location: string;
  password?: string;
  credentials?: StorageFormCredentials;
  googleConnectionId?: string;
  objectLock?: boolean;
}): StorageFormPayload & { objectLock?: boolean } {
  const credentials = input.type === "sftp"
    ? Object.fromEntries(Object.entries({
        host: input.credentials?.host?.trim() ?? "",
        port: input.credentials?.port || "22",
        username: input.credentials?.username?.trim() ?? "",
        password: input.credentials?.password || ""
      }).filter(([, value]) => value))
    : input.type === "s3" || input.type === "b2"
      ? Object.fromEntries(Object.entries({
          accessKey: input.credentials?.accessKey?.trim() ?? "",
          secretKey: input.credentials?.secretKey?.trim() ?? "",
          region: input.credentials?.region?.trim() || "",
          endpoint: input.credentials?.endpoint?.trim() || ""
        }).filter(([, value]) => value))
      : undefined;

  return {
    name: input.name.trim(),
    engine: input.engine,
    type: input.type,
    location: input.location.trim(),
    password: input.password || undefined,
    credentials,
    googleConnectionId: input.type === "google-drive" ? input.googleConnectionId : undefined,
    objectLock: supportsImmutableStorage(input.type) ? Boolean(input.objectLock) : undefined
  };
}
