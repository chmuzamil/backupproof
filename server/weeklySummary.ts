import { buildWeeklySummaryEmail } from "../shared/weeklySummaryCopy";
import { getRecoveryAnalytics, markWeeklySummarySent, readWeeklySummaryState } from "./recoveryAnalytics";
import { sendAlert } from "./notifications";
import type { Store } from "./store";

const WEEK_MS = 7 * 86_400_000;

export async function sendWeeklyRecoverySummaries(store: Store) {
  const state = store.snapshot();
  const emailTargets = state.notificationTargets.filter((target) => target.enabled && target.type === "email");
  if (emailTargets.length === 0) return { sent: 0, skipped: "no-email-targets" as const };

  const weeklyState = await readWeeklySummaryState();
  if (weeklyState.lastSentAt && Date.now() - new Date(weeklyState.lastSentAt).getTime() < WEEK_MS - 3_600_000) {
    return { sent: 0, skipped: "already-sent-this-week" as const };
  }

  const analytics = await getRecoveryAnalytics(store, 7);
  const email = buildWeeklySummaryEmail(analytics);
  let sent = 0;

  for (const target of emailTargets) {
    const ok = await sendAlert(target, store.getSecret(target.configSecretId), {
      id: "weekly-summary",
      appId: "system",
      severity: "info",
      title: email.subject,
      message: email.text,
      createdAt: new Date().toISOString()
    });
    if (ok) sent += 1;
  }

  if (sent > 0) await markWeeklySummarySent();
  return { sent, skipped: sent === 0 ? ("delivery-failed" as const) : undefined };
}
