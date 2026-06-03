import { describe, expect, it } from "vitest";
import { detectExternalEngines } from "../server/engineAvailability";

describe("external engine detection", () => {
  it("returns restic and kopia availability flags", async () => {
    const status = await detectExternalEngines();
    expect(typeof status.resticAvailable).toBe("boolean");
    expect(typeof status.kopiaAvailable).toBe("boolean");
    expect(status.resticPath).toBeTruthy();
    expect(status.kopiaPath).toBeTruthy();
  });
});
