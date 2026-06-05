import { describe, expect, it } from "vitest";
import { changePasswordInputSchema } from "../shared/schemas";
import { formatZodError } from "../shared/validation";

describe("formatZodError", () => {
  it("turns password validation failures into readable messages", () => {
    const result = changePasswordInputSchema.safeParse({
      currentPassword: "admin",
      newPassword: "abc",
      confirmPassword: "abc"
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error)).toContain("New password must be at least 5 characters.");
    }
  });

  it("reports mismatched confirmation", () => {
    const result = changePasswordInputSchema.safeParse({
      currentPassword: "admin",
      newPassword: "long-enough",
      confirmPassword: "different"
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error)).toBe("Passwords do not match");
    }
  });
});
