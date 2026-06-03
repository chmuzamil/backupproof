import { describe, expect, it } from "vitest";
import { getEngineAdapter } from "../server/engines";
import { computeConfidenceScore } from "../server/confidenceScore";

describe("engine router", () => {
  it("returns frd as the default built-in adapter", () => {
    expect(getEngineAdapter("frd")).toBeDefined();
    expect(getEngineAdapter("native")).toBe(getEngineAdapter("frd"));
  });
});

describe("confidence score", () => {
  it("returns lower score when proof is missing", () => {
    const score = computeConfidenceScore({
      app: {
        id: "a", name: "Test", composePath: "", projectName: "", services: [], safeRestoreServices: [],
        recipeType: "compose-files", backupPaths: ["/tmp"], healthChecks: [], repositoryId: "r", policyId: "p",
        createdAt: "", updatedAt: ""
      },
      snapshotCount: 1,
      recentFailures: 0
    });
    expect(score).toBeLessThan(80);
  });
});
