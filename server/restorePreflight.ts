import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { config } from "./config";
import type { App, RestorePreflight, RestoreProof, SnapshotSummary } from "../shared/types";

function contains(parent: string, child: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function nearestExistingParent(targetDir: string) {
  let candidate = path.resolve(targetDir);
  while (candidate !== path.dirname(candidate)) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      candidate = path.dirname(candidate);
    }
  }
  return candidate;
}

export async function inspectRestorePreflight(input: {
  app: App;
  snapshot?: SnapshotSummary;
  proof?: RestoreProof;
  targetDir?: string;
}): Promise<RestorePreflight> {
  const { app, snapshot, proof } = input;
  const snapshotId = snapshot?.id ?? "";
  const targetDir = path.resolve(input.targetDir?.trim() || path.join(config.dataDir, "manual-restores", app.id, snapshotId || "latest"));
  const errors: string[] = [];
  const warnings: string[] = [];
  let targetExists = false;
  let targetEntryCount = 0;

  if (!snapshot) errors.push("The selected snapshot is no longer available.");

  try {
    const stat = await fs.stat(targetDir);
    targetExists = true;
    if (!stat.isDirectory()) errors.push("The restore destination exists but is not a folder.");
    else {
      targetEntryCount = (await fs.readdir(targetDir)).length;
      if (targetEntryCount > 0) warnings.push(`The restore destination already contains ${targetEntryCount} item${targetEntryCount === 1 ? "" : "s"}.`);
    }
  } catch {
    const parent = await nearestExistingParent(targetDir);
    try {
      await fs.access(parent, constants.W_OK);
    } catch {
      errors.push(`The restore destination cannot be created because ${parent} is not writable.`);
    }
  }

  for (const source of app.backupPaths) {
    if (contains(source, targetDir) || contains(targetDir, source)) {
      warnings.push(`The restore destination overlaps protected source path ${source}. Choose an isolated folder unless an in-place recovery is intentional.`);
      break;
    }
  }

  const proofCurrent = Boolean(proof?.status === "passed" && new Date(proof.expiresAt).getTime() > Date.now());
  if (!proof) warnings.push("This snapshot has never passed a restore proof.");
  else if (proof.status !== "passed") warnings.push("The latest restore proof for this snapshot failed.");
  else if (!proofCurrent) warnings.push("The restore proof for this snapshot is stale.");

  return {
    ready: errors.length === 0,
    appId: app.id,
    snapshotId,
    targetDir,
    snapshotCreatedAt: snapshot?.createdAt ?? "",
    snapshotSizeBytes: snapshot?.sizeBytes ?? 0,
    proof: proof ? { status: proof.status, testedAt: proof.testedAt, expiresAt: proof.expiresAt, current: proofCurrent } : undefined,
    targetExists,
    targetEntryCount,
    errors,
    warnings
  };
}
