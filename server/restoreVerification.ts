import fs from "node:fs/promises";
import path from "node:path";
import { sha256File } from "./engines/frd/chunkCrypto";
import { inspectSnapshotContents } from "./snapshotInspector";
import type { App, Repository, RestoreVerification } from "../shared/types";
import type { EngineContext } from "./engines/types";

function matchesSelection(filePath: string, selectedPaths?: string[]) {
  if (!selectedPaths?.length) return true;
  return selectedPaths.some((selected) => filePath === selected || filePath.startsWith(`${selected.replace(/\/$/, "")}/`));
}

export async function verifyRestoredSnapshot(input: {
  app: App;
  repository: Repository;
  snapshotId: string;
  restoreDir: string;
  selectedPaths?: string[];
  ctx: EngineContext;
  onLine: (line: string) => void;
}): Promise<RestoreVerification> {
  const checkedAt = new Date().toISOString();
  const contents = await inspectSnapshotContents(input.app, input.repository, input.snapshotId, input.ctx);
  if (!contents.supported) {
    input.onLine("Post-restore verification skipped: snapshot manifest is not available for this engine.");
    return { supported: false, checkedAt, totalFiles: 0, passedFiles: 0, failedFiles: 0, skippedFiles: 0, results: [] };
  }

  const files = contents.files.filter((file) => matchesSelection(file.path, input.selectedPaths));
  const results = [];
  for (const file of files) {
    const restoredPath = path.join(input.restoreDir, file.path);
    try {
      await fs.access(restoredPath);
      const actual = await sha256File(restoredPath);
      const passed = actual === file.sha256;
      results.push({ path: file.path, passed, message: passed ? "Restored file matches snapshot manifest" : "Restored file checksum does not match snapshot manifest" });
      input.onLine(`${passed ? "Verified" : "Verification failed"}: ${file.path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Restored file is missing";
      results.push({ path: file.path, passed: false, message });
      input.onLine(`Verification failed: ${file.path} (${message})`);
    }
  }

  const passedFiles = results.filter((result) => result.passed).length;
  const failedFiles = results.length - passedFiles;
  const verification: RestoreVerification = {
    supported: true,
    checkedAt,
    totalFiles: files.length,
    passedFiles,
    failedFiles,
    skippedFiles: contents.files.length - files.length,
    results
  };
  input.onLine(`Post-restore verification complete: ${passedFiles}/${files.length} file${files.length === 1 ? "" : "s"} matched the snapshot manifest.`);
  return verification;
}
