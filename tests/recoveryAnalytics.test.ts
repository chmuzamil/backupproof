import { describe, expect, it } from "vitest";
import { buildConfidenceTrend, buildRecoveryAnalytics, buildRecoveryReadinessReport, daysSince, formatDaysSince } from "../shared/recoveryAnalytics";
import type { AppSummary, DrReportSummary, RestoreProof } from "../shared/types";

const now = Date.parse("2026-06-04T12:00:00.000Z");

function summary(appId: string, name: string, overrides: Partial<AppSummary> = {}): AppSummary {
  return {
    app: {
      id: appId,
      name,
      composePath: "",
      projectName: "",
      services: [],
      safeRestoreServices: [],
      recipeType: "compose-files",
      backupPaths: ["/data"],
      healthChecks: [],
      repositoryId: "repo-1",
      policyId: "policy-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    repository: undefined,
    policy: undefined,
    latestBackup: { id: "job-1", appId, type: "backup", status: "succeeded", createdAt: "2026-06-03T00:00:00.000Z", finishedAt: "2026-06-03T01:00:00.000Z", logs: [] },
    latestRestoreTest: undefined,
    restoreProof: {
      id: "proof-1",
      appId,
      snapshotId: "snap-1",
      testedAt: "2026-06-01T00:00:00.000Z",
      expiresAt: "2026-06-15T00:00:00.000Z",
      status: "passed",
      healthResults: [],
      confidenceScore: 88
    },
    snapshotCount: 2,
    latestSnapshot: { id: "snap-1", createdAt: "2026-06-03T00:00:00.000Z", sizeBytes: 1000 },
    alerts: [],
    restorable: true,
    safety: { safe: true, errors: [], warnings: [], estimatedSourceBytes: 1000 },
    snapshotHistory: [],
    confidenceScore: 88,
    ...overrides
  };
}

describe("recovery analytics", () => {
  it("calculates days since timestamps", () => {
    expect(daysSince("2026-06-03T12:00:00.000Z", now)).toBe(1);
    expect(formatDaysSince("2026-06-04T10:00:00.000Z", now)).toBe("Today");
    expect(formatDaysSince(undefined)).toBe("Never checked");
  });

  it("builds confidence trend buckets by day", () => {
    const proofs: RestoreProof[] = [
      { id: "1", appId: "a", snapshotId: "s", testedAt: "2026-06-03T10:00:00.000Z", expiresAt: "2026-06-10T00:00:00.000Z", status: "passed", healthResults: [], confidenceScore: 90 },
      { id: "2", appId: "b", snapshotId: "s", testedAt: "2026-06-03T18:00:00.000Z", expiresAt: "2026-06-10T00:00:00.000Z", status: "failed", healthResults: [], confidenceScore: 40 }
    ];
    const trend = buildConfidenceTrend(proofs, 7, now);
    const busyDay = trend.find((point) => point.date === "2026-06-03");
    expect(busyDay?.hasData).toBe(true);
    expect(busyDay?.averageScore).toBe(65);
    expect(busyDay?.totalChecks).toBe(2);
  });

  it("builds analytics summary and markdown report", () => {
    const drills: DrReportSummary[] = [{
      id: "dr-1",
      appId: "photos",
      appName: "Family photos",
      scenario: "lost-server",
      snapshotId: "snap-1",
      restoredAt: "2026-06-02T00:00:00.000Z",
      proofStatus: "passed",
      confidenceScore: 91
    }];
    const analytics = buildRecoveryAnalytics({
      summaries: [summary("photos", "Family photos")],
      restoreProofs: [],
      drills,
      periodDays: 30,
      now
    });
    expect(analytics.summary.protectedItems).toBe(1);
    expect(analytics.summary.provenItems).toBe(1);
    expect(analytics.summary.drillCount).toBe(1);
    expect(analytics.apps[0]?.daysSinceLastProof).toBe(3);
    const report = buildRecoveryReadinessReport(analytics);
    expect(report).toContain("Family photos");
    expect(report).toContain("lost-server");
  });
});
