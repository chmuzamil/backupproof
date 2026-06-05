import type { AppSummary, DrReportSummary, RestoreProof } from "./types";

export type AnalyticsPeriodDays = 7 | 30 | 90;

export interface ConfidenceTrendPoint {
  date: string;
  averageScore: number;
  passedChecks: number;
  totalChecks: number;
  hasData: boolean;
}

export interface AppRecoveryMetrics {
  appId: string;
  appName: string;
  confidenceScore: number;
  daysSinceLastProof: number | null;
  daysSinceLastBackup: number | null;
  lastProofAt?: string;
  lastProofStatus?: RestoreProof["status"];
  restorable: boolean;
}

export interface RecoveryAnalyticsSummary {
  protectedItems: number;
  provenItems: number;
  averageConfidence: number;
  averageDaysSinceProof: number | null;
  oldestProofDays: number | null;
  drillCount: number;
}

export interface RecoveryAnalytics {
  generatedAt: string;
  periodDays: AnalyticsPeriodDays;
  summary: RecoveryAnalyticsSummary;
  trend: ConfidenceTrendPoint[];
  apps: AppRecoveryMetrics[];
  drills: DrReportSummary[];
}

export function daysSince(value?: string, now = Date.now()): number | null {
  if (!value) return null;
  const ms = now - new Date(value).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

export function formatDaysSince(value?: string, now = Date.now()): string {
  const days = daysSince(value, now);
  if (days === null) return "Never checked";
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function buildConfidenceTrend(proofs: RestoreProof[], periodDays: AnalyticsPeriodDays, now = Date.now()): ConfidenceTrendPoint[] {
  const cutoff = now - periodDays * 86_400_000;
  const filtered = proofs.filter((proof) => new Date(proof.testedAt).getTime() >= cutoff);
  const byDay = new Map<string, RestoreProof[]>();

  for (const proof of filtered) {
    const day = proof.testedAt.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(proof);
    byDay.set(day, list);
  }

  const points: ConfidenceTrendPoint[] = [];
  for (let offset = periodDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(now - offset * 86_400_000).toISOString().slice(0, 10);
    const dayProofs = byDay.get(date) ?? [];
    if (dayProofs.length === 0) {
      points.push({ date, averageScore: 0, passedChecks: 0, totalChecks: 0, hasData: false });
      continue;
    }
    const scores = dayProofs.map((proof) => proof.confidenceScore ?? (proof.status === "passed" ? 80 : proof.status === "failed" ? 20 : 40));
    points.push({
      date,
      averageScore: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
      passedChecks: dayProofs.filter((proof) => proof.status === "passed").length,
      totalChecks: dayProofs.length,
      hasData: true
    });
  }
  return points;
}

export function buildRecoveryAnalytics(input: {
  summaries: AppSummary[];
  restoreProofs: RestoreProof[];
  drills: DrReportSummary[];
  periodDays: AnalyticsPeriodDays;
  now?: number;
}): RecoveryAnalytics {
  const now = input.now ?? Date.now();
  const periodStart = now - input.periodDays * 86_400_000;
  const apps: AppRecoveryMetrics[] = input.summaries.map((summary) => ({
    appId: summary.app.id,
    appName: summary.app.name,
    confidenceScore: summary.confidenceScore,
    daysSinceLastProof: daysSince(summary.restoreProof?.testedAt, now),
    daysSinceLastBackup: daysSince(summary.latestBackup?.finishedAt, now),
    lastProofAt: summary.restoreProof?.testedAt,
    lastProofStatus: summary.restoreProof?.status,
    restorable: summary.restorable
  }));

  const proofAges = apps.map((app) => app.daysSinceLastProof).filter((value): value is number => value !== null);
  const provenItems = apps.filter((app) => app.restorable).length;
  const averageConfidence = apps.length
    ? Math.round(apps.reduce((sum, app) => sum + app.confidenceScore, 0) / apps.length)
    : 0;

  const drills = input.drills
    .filter((drill) => new Date(drill.restoredAt).getTime() >= periodStart)
    .sort((a, b) => b.restoredAt.localeCompare(a.restoredAt));

  return {
    generatedAt: new Date(now).toISOString(),
    periodDays: input.periodDays,
    summary: {
      protectedItems: apps.length,
      provenItems,
      averageConfidence,
      averageDaysSinceProof: proofAges.length ? Math.round(proofAges.reduce((sum, days) => sum + days, 0) / proofAges.length) : null,
      oldestProofDays: proofAges.length ? Math.max(...proofAges) : null,
      drillCount: drills.length
    },
    trend: buildConfidenceTrend(input.restoreProofs, input.periodDays, now),
    apps,
    drills
  };
}

export function buildRecoveryReadinessReport(analytics: RecoveryAnalytics): string {
  const lines = [
    "# BackupProof recovery readiness report",
    "",
    `Generated: ${new Date(analytics.generatedAt).toLocaleString()}`,
    `Period: last ${analytics.periodDays} days`,
    "",
    "## Summary",
    `- Protected items: ${analytics.summary.protectedItems}`,
    `- Ready to recover: ${analytics.summary.provenItems}`,
    `- Average confidence: ${analytics.summary.averageConfidence}%`,
    `- Average days since recovery check: ${analytics.summary.averageDaysSinceProof ?? "n/a"}`,
    `- Recovery drills in period: ${analytics.summary.drillCount}`,
    "",
    "## Protected items"
  ];

  if (analytics.apps.length === 0) {
    lines.push("- No protected items yet.");
  } else {
    for (const app of analytics.apps) {
      lines.push(`- ${app.appName}: confidence ${app.confidenceScore}%, last recovery check ${formatDaysSince(app.lastProofAt)}, last backup ${app.daysSinceLastBackup === null ? "never" : `${app.daysSinceLastBackup} day(s) ago`}`);
    }
  }

  lines.push("", "## Recovery drills");
  if (analytics.drills.length === 0) {
    lines.push("- No recovery drills recorded in this period.");
  } else {
    for (const drill of analytics.drills.slice(0, 20)) {
      lines.push(`- ${drill.restoredAt}: ${drill.appName} (${drill.scenario}) — proof ${drill.proofStatus}, confidence ${drill.confidenceScore}%`);
    }
  }

  lines.push("", "— BackupProof");
  return lines.join("\n");
}
