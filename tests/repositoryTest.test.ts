import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("repository test", () => {
  it("checks a local storage location without saving it", async () => {
    process.env.FRD_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "frd-repo-test-"));
    const vault = path.join(process.env.FRD_DATA_DIR, "vault-test");
    const { testRepositoryConnection } = await import("../server/repositoryTest");

    const result = await testRepositoryConnection({
      name: "Test vault",
      engine: "frd",
      type: "local",
      location: vault,
      objectLock: false,
      bandwidthLimitKbps: 0
    });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("reachable");
  });
});
