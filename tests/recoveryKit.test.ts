import { describe, expect, it } from "vitest";
import { createRecoveryKit, openRecoveryKit } from "../server/recoveryKit";
import type { RecoveryStatePayload } from "../server/store";

function payload(): RecoveryStatePayload {
  return {
    format: "backupproof-recovery-state-v1",
    exportedAt: "2026-06-04T00:00:00.000Z",
    apps: [],
    repositories: [],
    policies: [],
    restoreProofs: [],
    notificationTargets: [],
    secrets: {
      "secret-1": { accessKey: "private-value" }
    }
  };
}

describe("BackupProof recovery kit", () => {
  it("encrypts and opens control-plane state", () => {
    const kit = createRecoveryKit(payload(), "long-recovery-passphrase");
    expect(kit.toString("utf8")).not.toContain("private-value");
    expect(openRecoveryKit(kit, "long-recovery-passphrase")).toEqual(payload());
  });

  it("rejects the wrong passphrase", () => {
    const kit = createRecoveryKit(payload(), "correct-recovery-passphrase");
    expect(() => openRecoveryKit(kit, "incorrect-passphrase")).toThrow("incorrect or the kit is damaged");
  });

  it("requires a strong recovery passphrase", () => {
    expect(() => createRecoveryKit(payload(), "too-short")).toThrow("at least 12 characters");
  });
});
