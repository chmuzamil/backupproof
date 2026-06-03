import fs from "node:fs/promises";
import path from "node:path";
import { sha256File } from "./chunkCrypto";

export interface ManifestEntry {
  path: string;
  sha256: string;
  size: number;
  mtimeMs: number;
  chunk: string;
}

export interface FrdSnapshotMeta {
  id: string;
  format: "frd-v1" | "legacy-tgz";
  appId: string;
  appName: string;
  createdAt: string;
  archivePath: string;
  sourcePaths: string[];
  sizeBytes: number;
  files?: ManifestEntry[];
  parentSnapshotId?: string;
  changedFiles?: number;
  totalFiles?: number;
}

async function walkDir(root: string, base: string, entries: ManifestEntry[], onFile?: (rel: string) => void) {
  let items: string[];
  try {
    items = await fs.readdir(root);
  } catch {
    return;
  }
  for (const item of items) {
    const full = path.join(root, item);
    const rel = path.join(base, item).replace(/\\/g, "/");
    const stat = await fs.stat(full);
    if (stat.isDirectory()) {
      await walkDir(full, rel, entries, onFile);
    } else if (stat.isFile()) {
      onFile?.(rel);
      const sha256 = await sha256File(full);
      entries.push({
        path: rel,
        sha256,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        chunk: `${sha256}.enc`
      });
    }
  }
}

export async function buildManifest(sourcePaths: string[], onLine: (line: string) => void) {
  const entries: ManifestEntry[] = [];
  for (const source of sourcePaths) {
    const resolved = path.resolve(source);
    await fs.access(resolved);
    const stat = await fs.stat(resolved);
    if (stat.isFile()) {
      const sha256 = await sha256File(resolved);
      const rel = path.basename(resolved);
      entries.push({ path: rel, sha256, size: stat.size, mtimeMs: stat.mtimeMs, chunk: `${sha256}.enc` });
    } else {
      await walkDir(resolved, path.basename(resolved), entries, (rel) => onLine(`Indexed ${rel}`));
    }
  }
  return entries;
}

export function diffManifest(previous: ManifestEntry[], current: ManifestEntry[]) {
  const prevMap = new Map(previous.map((e) => [e.path, e]));
  const changed: ManifestEntry[] = [];
  for (const entry of current) {
    const old = prevMap.get(entry.path);
    if (!old || old.sha256 !== entry.sha256) changed.push(entry);
  }
  return changed;
}

export async function readFileForEntry(sourcePaths: string[], entry: ManifestEntry) {
  for (const source of sourcePaths) {
    const resolved = path.resolve(source);
    const stat = await fs.stat(resolved);
    if (stat.isFile()) {
      if (entry.path === path.basename(resolved)) return fs.readFile(resolved);
      continue;
    }
    const baseName = path.basename(resolved);
    let relative = entry.path;
    if (relative.startsWith(`${baseName}/`)) relative = relative.slice(baseName.length + 1);
    else if (relative === baseName) relative = "";
    const candidate = path.join(resolved, relative);
    try {
      await fs.access(candidate);
      return fs.readFile(candidate);
    } catch {
      continue;
    }
  }
  throw new Error(`Source file not found for manifest entry: ${entry.path}`);
}
