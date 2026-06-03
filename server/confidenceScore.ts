import type { App, AppSummary, Job, Policy, Repository, RestoreProof } from "../shared/types";

export function computeConfidenceScore(input: {
  app: App;
  proof?: RestoreProof;
  latestBackup?: Job;
  latestRestoreTest?: Job;
  repository?: Repository;
  snapshotCount: number;
  policy?: Policy;
  recentFailures: number;
}): number {
  let score = 100;
  const now = Date.now();

  if (!input.latestBackup?.finishedAt) score -= 40;
  else {
    const backupAgeHours = (now - new Date(input.latestBackup.finishedAt).getTime()) / 3_600_000;
    if (backupAgeHours > 48) score -= 20;
    else if (backupAgeHours > 24) score -= 10;
  }

  if (!input.proof) score -= 30;
  else {
    if (input.proof.status === "failed") score -= 50;
    if (input.proof.status === "passed") {
      const expires = new Date(input.proof.expiresAt).getTime();
      if (expires <= now) score -= 25;
      else if (expires - now < 24 * 3_600_000) score -= 10;
    }
    if (input.proof.checksumResults?.some((r) => !r.passed)) score -= 15;
  }

  if (!input.repository) score -= 20;
  if (input.snapshotCount === 0) score -= 15;

  const minSnapshots = (input.policy?.retention.keepDaily ?? 1);
  if (input.snapshotCount < minSnapshots) score -= 10;

  score -= Math.min(20, input.recentFailures * 5);

  return Math.max(0, Math.min(100, score));
}

export function scoreLabel(score: number) {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "at-risk";
  return "critical";
}

export function enrichSummary(summary: Omit<AppSummary, "confidenceScore">, recentFailures: number): AppSummary {
  const confidenceScore = computeConfidenceScore({
    app: summary.app,
    proof: summary.restoreProof,
    latestBackup: summary.latestBackup,
    latestRestoreTest: summary.latestRestoreTest,
    repository: summary.repository,
    snapshotCount: summary.snapshotCount,
    policy: summary.policy,
    recentFailures
  });
  return { ...summary, confidenceScore };
}
