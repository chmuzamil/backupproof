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

function sourceRelativePath(resolved: string) {
  const root = path.parse(resolved).root;
  return path.relative(root, resolved).replace(/\\/g, "/");
}

export async function buildManifest(sourcePaths: string[], onLine: (line: string) => void) {
  const entries: ManifestEntry[] = [];
  for (const source of sourcePaths) {
    const resolved = path.resolve(source);
    await fs.access(resolved);
    const stat = await fs.stat(resolved);
    if (stat.isFile()) {
      const rel = sourceRelativePath(resolved);
      const sha256 = await sha256File(resolved);
      entries.push({ path: rel, sha256, size: stat.size, mtimeMs: stat.mtimeMs, chunk: `${sha256}.enc` });
    } else {
      const base = sourceRelativePath(resolved);
      await walkDir(resolved, base, entries, (rel) => onLine(`Indexed ${rel}`));
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
    const rootRel = sourceRelativePath(resolved);
    const baseName = path.basename(resolved);

    if (stat.isFile()) {
      if (entry.path === rootRel || entry.path === baseName) return fs.readFile(resolved);
      continue;
    }

    for (const prefix of [rootRel, baseName]) {
      if (entry.path === prefix || entry.path.startsWith(`${prefix}/`)) {
        const relative = entry.path === prefix ? "" : entry.path.slice(prefix.length + 1);
        const candidate = path.join(resolved, relative);
        try {
          await fs.access(candidate);
          return fs.readFile(candidate);
        } catch {
          continue;
        }
      }
    }
  }
  throw new Error(`Source file not found for manifest entry: ${entry.path}`);
}
