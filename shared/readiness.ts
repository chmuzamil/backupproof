import type { AppSummary, JobType } from "./types";

export type ReadinessState = "blocked" | "unprotected" | "unproven" | "at-risk" | "proven";

export interface ReadinessAdvice {
  state: ReadinessState;
  label: string;
  message: string;
  action?: JobType;
  actionLabel?: string;
}

export function readinessAdvice(summary: AppSummary): ReadinessAdvice {
  if (!summary.safety.safe) {
    return {
      state: "blocked",
      label: "Backup blocked",
      message: summary.safety.errors[0] ?? "Resolve the backup safety warning before continuing."
    };
  }
  if (summary.snapshotCount === 0) {
    return {
      state: "unprotected",
      label: "Needs first backup",
      message: "No recovery snapshot exists yet.",
      action: "backup",
      actionLabel: "Run first backup"
    };
  }
  if (!summary.restoreProof || summary.restoreProof.status !== "passed") {
    return {
      state: "unproven",
      label: "Needs restore proof",
      message: "A backup exists, but recovery has not passed a restore test.",
      action: "restore-test",
      actionLabel: "Prove recovery"
    };
  }
  if (!summary.restorable || summary.confidenceScore < 60) {
    return {
      state: "at-risk",
      label: "Recovery at risk",
      message: summary.restorable ? "Recent failures lowered recovery confidence." : "The latest restore proof is stale.",
      action: "restore-test",
      actionLabel: "Refresh proof"
    };
  }
  return {
    state: "proven",
    label: "Recovery proven",
    message: "The latest backup restored successfully and passed its checks."
  };
}

export function readinessCounts(summaries: AppSummary[]) {
  const advice = summaries.map(readinessAdvice);
  return {
    total: summaries.length,
    proven: advice.filter((item) => item.state === "proven").length,
    attention: advice.filter((item) => item.state !== "proven").length,
    blocked: advice.filter((item) => item.state === "blocked").length
  };
}
