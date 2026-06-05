import type { Alert, NotificationType } from "./types";

export function createTestNotificationAlert(): Pick<Alert, "severity" | "title" | "message"> {
  return {
    severity: "info",
    title: "BackupProof test alert",
    message: "This is a test message from BackupProof. If you received it, alerts are working."
  };
}

export function formatNotificationText(type: NotificationType, alert: Pick<Alert, "severity" | "title" | "message">) {
  const headline = friendlyAlertTitle(alert.title);
  const body = friendlyAlertMessage(alert.message);

  if (type === "slack" || type === "discord") {
    return `${headline}\n${body}`;
  }

  if (type === "telegram") {
    return `${headline}: ${body}`;
  }

  if (type === "email") {
    return { subject: headline, text: `${body}\n\n— BackupProof` };
  }

  return { severity: alert.severity, title: headline, message: body };
}

export function friendlyAlertTitle(title: string) {
  const map: Record<string, string> = {
    "Restore proof missing": "Recovery has not been checked yet",
    "Restore proof failed": "Recovery check failed",
    "Restore proof stale": "Recovery check is out of date",
    "Restore proof expiring soon": "Recovery check expires soon",
    "Repository missing": "Backup storage is missing",
    "Repository unreachable": "Backup storage could not be reached",
    "Secondary backup failed": "Second copy backup failed",
    "backup failed": "Backup failed",
    "check failed": "Storage check failed",
    "prune failed": "Cleanup failed",
    "restore-test failed": "Recovery check failed",
    "manual-restore failed": "File recovery failed",
    "dr-run failed": "Recovery practice failed",
    "BackupProof test alert": "BackupProof test alert"
  };
  return map[title] ?? title;
}

export function friendlyJobAlertTitle(jobType: string) {
  return friendlyAlertTitle(`${jobType} failed`);
}

export function friendlyAlertMessage(message: string) {
  return message
    .replace(/restore test/gi, "recovery check")
    .replace(/snapshot/gi, "backup point")
    .replace(/vault/gi, "backup storage");
}
