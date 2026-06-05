import { describe, expect, it } from "vitest";
import { buildWeeklySummaryEmail } from "../shared/weeklySummaryCopy";
import { buildRecoveryAnalytics } from "../shared/recoveryAnalytics";
import type { AppSummary } from "../shared/types";

describe("weekly summary copy", () => {
  it("highlights items needing attention", () => {
    const analytics = buildRecoveryAnalytics({
      summaries: [{
        app: {
          id: "a",
          name: "Shop site",
          composePath: "",
          projectName: "",
          services: [],
          safeRestoreServices: [],
          recipeType: "compose-files",
          backupPaths: ["/var/www"],
          healthChecks: [],
          repositoryId: "r1",
          policyId: "p1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        },
        repository: undefined,
        policy: undefined,
        latestBackup: undefined,
        latestRestoreTest: undefined,
        restoreProof: {
          id: "p1",
          appId: "a",
          snapshotId: "s1",
          testedAt: "2026-05-01T00:00:00.000Z",
          expiresAt: "2026-05-08T00:00:00.000Z",
          status: "stale",
          healthResults: []
        },
        snapshotCount: 1,
        latestSnapshot: undefined,
        alerts: [],
        restorable: false,
        safety: { safe: true, errors: [], warnings: [], estimatedSourceBytes: 100 },
        snapshotHistory: [],
        confidenceScore: 42
      } satisfies AppSummary],
      restoreProofs: [],
      drills: [],
      periodDays: 7,
      now: Date.parse("2026-06-04T12:00:00.000Z")
    });
    const email = buildWeeklySummaryEmail(analytics);
    expect(email.subject).toContain("need attention");
    expect(email.text).toContain("Shop site");
  });
});
