import { describe, expect, it } from "vitest";
import { buildRecoveryCoach } from "../shared/recoveryCoach";
import type { AppSummary, DashboardState } from "../shared/types";

function state(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    apps: [],
    repositories: [],
    policies: [],
    jobs: [],
    restoreProofs: [],
    notificationTargets: [],
    restoreDestinationTemplates: [],
    alerts: [],
    users: [],
    auditLog: [],
    agents: [],
    environment: { dataDirWritable: true, checkedAt: "", errors: [], warnings: [] },
    ...overrides
  };
}

function summary(overrides: Partial<AppSummary> = {}): AppSummary {
  return {
    app: {
      id: "app-1",
      name: "Photos",
      composePath: "",
      projectName: "",
      services: [],
      safeRestoreServices: [],
      recipeType: "compose-files",
      backupPaths: ["/photos"],
      healthChecks: [],
      repositoryId: "repo-1",
      policyId: "policy-1",
      createdAt: "",
      updatedAt: ""
    },
    snapshotCount: 0,
    alerts: [],
    restorable: false,
    confidenceScore: 10,
    safety: { safe: true, checkedAt: "", estimatedSourceBytes: 100, errors: [], warnings: [] },
    snapshotHistory: [],
    ...overrides
  };
}

describe("recovery coach", () => {
  it("starts by sending an empty setup to protect data", () => {
    const coach = buildRecoveryCoach(state(), []);
    expect(coach.score).toBe(0);
    expect(coach.nextTask?.id).toBe("protect-data");
    expect(coach.nextTask?.route).toBe("protect");
  });

  it("prioritizes checking recovery after backups exist", () => {
    const coach = buildRecoveryCoach(state(), [summary({ snapshotCount: 1 })]);
    expect(coach.nextTask?.id).toBe("recovery-check");
    expect(coach.nextTask?.status).toBe("warning");
  });

  it("reaches a complete plan when data, proof, offsite, alerts, and restore place exist", () => {
    const readySummary = summary({
      snapshotCount: 2,
      restorable: true,
      confidenceScore: 96,
      restoreProof: {
        id: "proof-1",
        appId: "app-1",
        snapshotId: "snap-1",
        testedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2099-01-01T00:00:00.000Z",
        status: "passed",
        healthResults: []
      }
    });
    const coach = buildRecoveryCoach(state({
      apps: [readySummary.app],
      repositories: [{
        id: "repo-1",
        name: "Drive",
        engine: "frd",
        type: "google-drive",
        location: "BackupProof",
        createdAt: "",
        updatedAt: ""
      }],
      notificationTargets: [{
        id: "target-1",
        name: "Email",
        type: "email",
        enabled: true,
        createdAt: "",
        updatedAt: ""
      }],
      restoreDestinationTemplates: [{
        id: "dest-1",
        name: "Safe folder",
        path: "/restore",
        createdAt: "",
        updatedAt: ""
      }]
    }), [readySummary], { reportDownloaded: true });

    expect(coach.score).toBe(100);
    expect(coach.nextTask).toBeUndefined();
    expect(coach.tasks.every((task) => task.status === "done")).toBe(true);
  });
});
