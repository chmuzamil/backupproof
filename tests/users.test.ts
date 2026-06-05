import { describe, expect, it } from "vitest";
import { hashPassword } from "../server/auth";
import { Store } from "../server/store";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("user management", () => {
  it("creates, updates roles, and deletes users", async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "backupproof-users-"));
    const store = new Store(dataDir);
    await store.init();

    const operator = await store.addUser({ username: "operator", password: "operator", role: "operator" });
    expect(operator.username).toBe("operator");

    await expect(store.addUser({ username: "operator", password: "other123", role: "viewer" }))
      .rejects.toThrow("already taken");

    const updated = await store.updateUserRole(operator.id, "viewer");
    expect(updated.role).toBe("viewer");

    await store.deleteUser(operator.id);
    expect(store.snapshot().users.some((user) => user.id === operator.id)).toBe(false);
  });

  it("tracks admin count", async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "backupproof-users-"));
    const store = new Store(dataDir);
    await store.init();
    expect(store.adminCount()).toBe(1);

    const admin = await store.addUser({ username: "backup-admin", password: "secret1", role: "admin" });
    expect(store.adminCount()).toBe(2);
    expect(store.snapshot().users.find((user) => user.id === admin.id)?.passwordHash).toBe(hashPassword("secret1"));
  });
});
