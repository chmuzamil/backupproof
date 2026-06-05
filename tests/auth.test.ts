import { describe, expect, it } from "vitest";
import { hashPassword, isDefaultAdminSetup, legacyHashPassword, verifyPassword } from "../server/auth";
import type { User } from "../shared/types";

describe("auth helpers", () => {
  it("detects the default admin bootstrap state", () => {
    const users: User[] = [{
      id: "1",
      username: "admin",
      passwordHash: hashPassword("admin"),
      role: "admin",
      createdAt: "2026-01-01T00:00:00.000Z"
    }];
    expect(isDefaultAdminSetup(users)).toBe(true);
    expect(verifyPassword("admin", users[0]!.passwordHash)).toBe(true);
  });

  it("accepts legacy admin passwords hashed with the dev encryption key", () => {
    const legacyHash = legacyHashPassword("admin", "dev-only-change-this-secret-value");
    expect(verifyPassword("admin", legacyHash)).toBe(true);
    expect(isDefaultAdminSetup([{
      id: "1",
      username: "admin",
      passwordHash: legacyHash,
      role: "admin",
      createdAt: "2026-01-01T00:00:00.000Z"
    }])).toBe(true);
  });

  it("returns false after admin credentials were customized", () => {
    const users: User[] = [{
      id: "1",
      username: "alex",
      passwordHash: hashPassword("strong-password"),
      role: "admin",
      createdAt: "2026-01-01T00:00:00.000Z"
    }];
    expect(isDefaultAdminSetup(users)).toBe(false);
  });
});
