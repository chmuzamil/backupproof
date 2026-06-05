import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";
import { config } from "./config";
import type { App, Repository } from "../shared/types";
import type { BackupEngineAdapter, EngineContext } from "./engines";

export interface PortableExportMetadata {
  format: "backupproof-portable-v1";
  app: { id: string; name: string; recipeType: string };
  snapshotId: string;
  exportedAt: string;
  sourcePaths: string[];
  instructions: string;
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "backup";
}

export async function createPortableExport(
  app: App,
  repository: Repository,
  snapshotId: string,
  adapter: BackupEngineAdapter,
  ctx: EngineContext,
  onLine: (line: string) => void = () => undefined
) {
  const exportId = `${safeName(app.name)}-${snapshotId}`;
  const workspace = path.join(config.dataDir, "exports", exportId);
  const payloadDir = path.join(workspace, "payload");
  const dataDir = path.join(payloadDir, "data");
  const fileName = `${exportId}.tar.gz`;
  const filePath = path.join(workspace, fileName);

  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(dataDir, { recursive: true });
  onLine(`Preparing portable export for ${app.name} snapshot ${snapshotId}`);
  await adapter.restore(app, repository, snapshotId, dataDir, onLine, ctx);
  const metadata: PortableExportMetadata = {
    format: "backupproof-portable-v1",
    app: { id: app.id, name: app.name, recipeType: app.recipeType },
    snapshotId,
    exportedAt: new Date().toISOString(),
    sourcePaths: app.backupPaths,
    instructions: "Extract this archive. Restored files are inside the data directory."
  };
  await fs.writeFile(path.join(payloadDir, "backup-proof-export.json"), JSON.stringify(metadata, null, 2));
  await tar.c({ cwd: payloadDir, gzip: true, file: filePath }, ["backup-proof-export.json", "data"]);
  onLine(`Portable export ready: ${fileName}`);

  return {
    fileName,
    filePath,
    cleanup: () => fs.rm(workspace, { recursive: true, force: true })
  };
}
