import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { digestPath, restoredTargetPath } from "./recipes";
import type { App, ChecksumResult, RestoreProof } from "../shared/types";

export async function runChecksumProof(app: App, restoreDir: string, onLine: (line: string) => void): Promise<ChecksumResult[]> {
  const paths = app.proofPaths?.length ? app.proofPaths : app.backupPaths.slice(0, 3);
  const results: ChecksumResult[] = [];

  for (const target of paths) {
    const restoredPath = restoredTargetPath(restoreDir, target);

    try {
      const [sourceHash, restoredHash] = await Promise.all([digestPath(path.resolve(target)), digestPath(restoredPath)]);
      const passed = sourceHash === restoredHash;
      onLine(`Checksum ${passed ? "passed" : "failed"} for ${target}`);
      results.push({ path: target, passed, message: passed ? "SHA-256 match" : "SHA-256 mismatch" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checksum failed";
      onLine(`Checksum failed for ${target}: ${message}`);
      results.push({ path: target, passed: false, message });
    }
  }

  return results;
}

export async function writeProofReport(app: App, proof: Pick<RestoreProof, "appId" | "snapshotId" | "testedAt" | "expiresAt" | "status" | "healthResults" | "checksumResults" | "confidenceScore">) {
  const reportDir = path.join(config.dataDir, "proof-reports", app.id);
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${proof.testedAt.replace(/[:.]/g, "-")}.json`);
  const report = {
    appId: app.id,
    appName: app.name,
    snapshotId: proof.snapshotId,
    testedAt: proof.testedAt,
    expiresAt: proof.expiresAt,
    status: proof.status,
    confidenceScore: proof.confidenceScore,
    healthResults: proof.healthResults,
    checksumResults: proof.checksumResults ?? []
  };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

export async function writeDrReport(report: {
  appId: string;
  appName: string;
  scenario: string;
  snapshotId: string;
  restoredAt: string;
  proofStatus: string;
  confidenceScore: number;
  steps: string[];
}) {
  const reportDir = path.join(config.dataDir, "dr-reports", report.appId);
  await fs.mkdir(reportDir, { recursive: true });
  const filename = `${Date.now()}-${report.scenario}.json`;
  const reportPath = path.join(reportDir, filename);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}
