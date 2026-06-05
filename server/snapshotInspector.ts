import type { App, Repository, SnapshotComparison, SnapshotContents, SnapshotFile } from "../shared/types";
import type { EngineContext } from "./engines/types";
import { readSnapshotMeta } from "./engines/frd/vault";
import type { FrdSnapshotMeta, ManifestEntry } from "./engines/frd/manifest";

function toFile(entry: ManifestEntry): SnapshotFile {
  return {
    path: entry.path,
    size: entry.size,
    modifiedAt: new Date(entry.mtimeMs).toISOString(),
    sha256: entry.sha256
  };
}

async function readFrdMeta(app: App, repository: Repository, snapshotId: string, ctx: EngineContext) {
  const raw = await readSnapshotMeta(repository, app.id, snapshotId, ctx.credentialSecret);
  return JSON.parse(raw) as FrdSnapshotMeta;
}

export async function inspectSnapshotContents(app: App, repository: Repository, snapshotId: string, ctx: EngineContext): Promise<SnapshotContents> {
  if (repository.engine !== "frd") {
    return { snapshotId, supported: false, files: [], totalFiles: 0, totalBytes: 0 };
  }
  const meta = await readFrdMeta(app, repository, snapshotId, ctx);
  const files = (meta.files ?? []).map(toFile).sort((a, b) => a.path.localeCompare(b.path));
  return {
    snapshotId,
    supported: meta.format === "frd-v1",
    files,
    totalFiles: files.length,
    totalBytes: files.reduce((total, file) => total + file.size, 0)
  };
}

export async function compareSnapshots(app: App, repository: Repository, snapshotId: string, ctx: EngineContext): Promise<SnapshotComparison> {
  if (repository.engine !== "frd") {
    return { snapshotId, supported: false, added: [], modified: [], deleted: [] };
  }
  const current = await readFrdMeta(app, repository, snapshotId, ctx);
  if (current.format !== "frd-v1") return { snapshotId, supported: false, added: [], modified: [], deleted: [] };
  const previous = current.parentSnapshotId ? await readFrdMeta(app, repository, current.parentSnapshotId, ctx).catch(() => undefined) : undefined;
  const currentMap = new Map((current.files ?? []).map((entry) => [entry.path, entry]));
  const previousMap = new Map((previous?.files ?? []).map((entry) => [entry.path, entry]));
  const added = [...currentMap.values()].filter((entry) => !previousMap.has(entry.path)).map(toFile);
  const modified = [...currentMap.values()].filter((entry) => {
    const old = previousMap.get(entry.path);
    return old && old.sha256 !== entry.sha256;
  }).map(toFile);
  const deleted = [...previousMap.values()].filter((entry) => !currentMap.has(entry.path)).map(toFile);
  return {
    snapshotId,
    previousSnapshotId: previous?.id,
    supported: true,
    added,
    modified,
    deleted
  };
}
