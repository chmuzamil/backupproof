import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";
import { config } from "./config";
import type { PortableExportMetadata } from "./portableExport";

function safeArchivePath(entryPath: string) {
  const normalized = entryPath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  return normalized === "backup-proof-export.json" || normalized === "data" || normalized.startsWith("data/");
}

export async function restorePortableExport(archivePath: string, targetDir?: string) {
  let invalidPath: string | undefined;
  let entryCount = 0;
  await tar.t({
    file: archivePath,
    onentry(entry) {
      entryCount += 1;
      if (entryCount > 200_000 || !safeArchivePath(entry.path)) invalidPath = entry.path;
    }
  });
  if (invalidPath) throw new Error(`Portable backup contains an unsafe or unsupported path: ${invalidPath}`);

  const workspace = await fs.mkdtemp(path.join(config.dataDir, "portable-import-"));
  try {
    await tar.x({
      file: archivePath,
      cwd: workspace,
      preservePaths: false,
      filter: safeArchivePath
    });
    const metadata = JSON.parse(await fs.readFile(path.join(workspace, "backup-proof-export.json"), "utf8")) as PortableExportMetadata;
    if (metadata.format !== "backupproof-portable-v1" || !metadata.app?.name || !metadata.snapshotId) {
      throw new Error("This is not a supported BackupProof portable backup.");
    }

    const restoreDir = path.resolve(targetDir?.trim() || path.join(config.dataDir, "portable-restores", metadata.app.id, metadata.snapshotId));
    await fs.mkdir(restoreDir, { recursive: true });
    await fs.cp(path.join(workspace, "data"), restoreDir, { recursive: true, force: true });
    return { metadata, restoreDir };
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}
