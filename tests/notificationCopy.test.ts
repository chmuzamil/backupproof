import { describe, expect, it } from "vitest";
import { createTestNotificationAlert, formatNotificationText, friendlyAlertTitle } from "../shared/notificationCopy";

describe("notification copy", () => {
  it("creates a friendly test alert", () => {
    expect(createTestNotificationAlert()).toMatchObject({
      title: "BackupProof test alert",
      severity: "info"
    });
  });

  it("formats email subjects in plain language", () => {
    const formatted = formatNotificationText("email", {
      severity: "warning",
      title: "Restore proof missing",
      message: "App has backups, but none have passed a restore test yet."
    });
    expect(formatted).toMatchObject({
      subject: "Recovery has not been checked yet"
    });
  });

  it("maps known alert titles", () => {
    expect(friendlyAlertTitle("Repository unreachable")).toBe("Backup storage could not be reached");
    expect(friendlyAlertTitle("restore-test failed")).toBe("Recovery check failed");
  });
});
