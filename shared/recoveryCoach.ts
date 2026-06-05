import { readinessAdvice } from "./readiness";
import type { AppSummary, DashboardState } from "./types";

export type CoachRoute = "dashboard" | "protect" | "recovery" | "settings";
export type CoachTaskStatus = "done" | "todo" | "warning";

export interface CoachTask {
  id: string;
  title: string;
  description: string;
  status: CoachTaskStatus;
  route: CoachRoute;
  actionLabel: string;
}

export interface RecoveryCoach {
  score: number;
  headline: string;
  summary: string;
  tasks: CoachTask[];
  nextTask?: CoachTask;
}

function allAppsHaveBackups(summaries: AppSummary[]) {
  return summaries.length > 0 && summaries.every((summary) => summary.snapshotCount > 0);
}

function allAppsAreChecked(summaries: AppSummary[]) {
  return summaries.length > 0 && summaries.every((summary) => summary.restorable);
}

function hasOffsiteStorage(state: DashboardState) {
  return state.repositories.some((repository) => repository.type !== "local") ||
    state.apps.some((app) => (app.secondaryRepositoryIds ?? []).length > 0);
}

export function buildRecoveryCoach(state: DashboardState, summaries: AppSummary[]): RecoveryCoach {
  const hasProtectedData = summaries.length > 0;
  const hasBackups = allAppsHaveBackups(summaries);
  const hasCheckedBackups = allAppsAreChecked(summaries);
  const hasBlockedApp = summaries.some((summary) => readinessAdvice(summary).state === "blocked");
  const hasAlerts = state.notificationTargets.some((target) => target.enabled);
  const hasRestorePlace = state.restoreDestinationTemplates.length > 0;
  const hasOffsite = hasOffsiteStorage(state);

  const tasks: CoachTask[] = [
    {
      id: "protect-data",
      title: hasProtectedData ? "Important data is listed" : "Choose your first important data",
      description: hasProtectedData
        ? `${summaries.length} protected item${summaries.length === 1 ? " is" : "s are"} on the dashboard.`
        : "Start with the folders, app data, photos, or database you would miss most.",
      status: hasProtectedData ? "done" : "todo",
      route: "protect",
      actionLabel: hasProtectedData ? "Add more data" : "Protect data"
    },
    {
      id: "first-backup",
      title: hasBackups ? "Backups have been saved" : "Save the first backup",
      description: hasBackups
        ? "Every protected item has at least one backup point."
        : "A backup needs to run before anything can be recovered.",
      status: hasBackups ? "done" : hasProtectedData ? "warning" : "todo",
      route: "dashboard",
      actionLabel: hasBackups ? "View dashboard" : "Run backup"
    },
    {
      id: "recovery-check",
      title: hasCheckedBackups ? "Recovery has been checked" : "Check that recovery works",
      description: hasCheckedBackups
        ? "BackupProof has restored and checked every protected item recently."
        : "This is the green-check step: restore safely, then confirm the files or app work.",
      status: hasCheckedBackups ? "done" : hasBackups ? "warning" : "todo",
      route: "recovery",
      actionLabel: hasCheckedBackups ? "See recovery history" : "Check recovery"
    },
    {
      id: "offsite-copy",
      title: hasOffsite ? "A second place is configured" : "Add a second place for backups",
      description: hasOffsite
        ? "At least one vault is outside the local machine or mirrored elsewhere."
        : "Use SFTP, S3, B2, Google Drive, or another disk so one broken server is not the only copy.",
      status: hasOffsite ? "done" : "todo",
      route: "protect",
      actionLabel: hasOffsite ? "Review storage" : "Add storage"
    },
    {
      id: "alerts",
      title: hasAlerts ? "Alerts are turned on" : "Turn on alerts",
      description: hasAlerts
        ? "BackupProof can tell you when a backup or recovery check needs attention."
        : "Email or webhook alerts stop silent backup failures from staying hidden.",
      status: hasAlerts ? "done" : "todo",
      route: "settings",
      actionLabel: hasAlerts ? "Review alerts" : "Set alerts"
    },
    {
      id: "restore-place",
      title: hasRestorePlace ? "A restore place is saved" : "Save a safe restore place",
      description: hasRestorePlace
        ? "You have a trusted folder ready for test restores and real recovery."
        : "Saving a restore folder avoids guessing during stress, especially on a fresh server.",
      status: hasRestorePlace ? "done" : "todo",
      route: "recovery",
      actionLabel: hasRestorePlace ? "Open recovery" : "Save restore place"
    }
  ];

  const completed = tasks.filter((task) => task.status === "done").length;
  const score = Math.round((completed / tasks.length) * 100);
  const nextTask = tasks.find((task) => task.status === "warning") ?? tasks.find((task) => task.status === "todo");
  const readyCount = summaries.filter((summary) => summary.restorable).length;

  return {
    score,
    headline: score === 100
      ? "Recovery plan is complete"
      : hasBlockedApp
        ? "Fix the blocked backup first"
        : "A few steps will make recovery calmer",
    summary: summaries.length === 0
      ? "Start by protecting one thing that truly matters. BackupProof will guide the rest."
      : `${readyCount} of ${summaries.length} protected item${summaries.length === 1 ? " is" : "s are"} ready to recover.`,
    tasks,
    nextTask
  };
}
