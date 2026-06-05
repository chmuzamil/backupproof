import { formatDaysSince } from "./recoveryAnalytics";
import type { RecoveryAnalytics } from "./recoveryAnalytics";

export function buildWeeklySummaryEmail(analytics: RecoveryAnalytics) {
  const attention = analytics.apps.filter((app) => !app.restorable || (app.daysSinceLastProof ?? 999) > 7);
  const subject = analytics.summary.provenItems === analytics.summary.protectedItems && analytics.summary.protectedItems > 0
    ? "BackupProof weekly summary: recovery looks good"
    : "BackupProof weekly summary: items need attention";

  const lines = [
    "Your weekly recovery summary from BackupProof",
    "",
    `Protected items: ${analytics.summary.protectedItems}`,
    `Ready to recover: ${analytics.summary.provenItems}`,
    `Average confidence: ${analytics.summary.averageConfidence}%`,
    `Recovery drills this week: ${analytics.summary.drillCount}`,
    ""
  ];

  if (analytics.apps.length === 0) {
    lines.push("Nothing is protected yet. Open BackupProof and choose your first important data.");
  } else if (attention.length === 0) {
    lines.push("Everything protected has a recent recovery check. Nice work.");
  } else {
    lines.push("Items needing attention:");
    for (const app of attention) {
      lines.push(`- ${app.appName}: last recovery check ${formatDaysSince(app.lastProofAt)} (confidence ${app.confidenceScore}%)`);
    }
  }

  lines.push("", "Open BackupProof to run a recovery check or review the dashboard.", "", "— BackupProof");
  return { subject, text: lines.join("\n") };
}
