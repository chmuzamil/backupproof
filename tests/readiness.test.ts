import { describe, expect, it } from "vitest";
import { readinessAdvice, readinessCounts } from "../shared/readiness";
import type { AppSummary } from "../shared/types";

function summary(overrides: Partial<AppSummary> = {}): AppSummary {
  return {
    app: {
      id: "app-1",
      name: "Demo",
      composePath: "",
      projectName: "",
      services: [],
      safeRestoreServices: [],
      recipeType: "compose-files",
      backupPaths: ["/data"],
      healthChecks: [],
      repositoryId: "repo-1",
      policyId: "policy-1",
      createdAt: "",
      updatedAt: ""
    },
    snapshotCount: 0,
    alerts: [],
    restorable: false,
    confidenceScore: 20,
    safety: { safe: true, checkedAt: "", estimatedSourceBytes: 10, errors: [], warnings: [] },
    snapshotHistory: [],
    ...overrides
  };
}

describe("recovery readiness", () => {
  it("recommends the first backup before a restore proof", () => {
    expect(readinessAdvice(summary()).action).toBe("backup");
  });

  it("prioritizes safety blockers", () => {
    const advice = readinessAdvice(summary({
      safety: { safe: false, checkedAt: "", estimatedSourceBytes: 10, errors: ["Vault is inside source"], warnings: [] }
    }));
    expect(advice.state).toBe("blocked");
    expect(advice.action).toBeUndefined();
  });

  it("counts proven and attention items", () => {
    const proven = summary({
      snapshotCount: 1,
      restorable: true,
      confidenceScore: 90,
      restoreProof: {
        id: "proof",
        appId: "app-1",
        snapshotId: "snapshot",
        testedAt: "",
        expiresAt: "2099-01-01T00:00:00.000Z",
        status: "passed",
        healthResults: []
      }
    });
    expect(readinessCounts([summary(), proven])).toEqual({ total: 2, proven: 1, attention: 1, blocked: 0 });
  });
});
