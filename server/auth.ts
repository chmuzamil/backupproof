import crypto from "node:crypto";
import { config } from "./config";
import type { User, UserRole } from "../shared/types";

const sessions = new Map<string, { userId: string; role: UserRole; expiresAt: number }>();

const LEGACY_DEV_ENCRYPTION_KEY = "dev-only-change-this-secret-value";

export function hashPassword(password: string) {
  return crypto.createHash("sha256").update(`backupproof-auth-v1:${password}`).digest("hex");
}

export function legacyHashPassword(password: string, encryptionKey: string) {
  return crypto.createHash("sha256").update(`${encryptionKey}:${password}`).digest("hex");
}

export function verifyPassword(password: string, hash: string) {
  if (hashPassword(password) === hash) return true;
  if (legacyHashPassword(password, config.encryptionKey) === hash) return true;
  if (legacyHashPassword(password, LEGACY_DEV_ENCRYPTION_KEY) === hash) return true;
  return false;
}

export function usesLegacyPasswordHash(password: string, hash: string) {
  return hashPassword(password) !== hash
    && (legacyHashPassword(password, config.encryptionKey) === hash
      || legacyHashPassword(password, LEGACY_DEV_ENCRYPTION_KEY) === hash);
}

export function createSession(user: User) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    userId: user.id,
    role: user.role,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  });
  return token;
}

export function getSession(token?: string) {
  if (!token) return undefined;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token ?? "");
    return undefined;
  }
  return session;
}

export function destroySession(token: string) {
  sessions.delete(token);
}

export function canPerform(role: UserRole, action: "read" | "write" | "admin" | "audit") {
  if (role === "admin") return true;
  if (action === "read") return true;
  if (action === "audit") return role === "auditor";
  if (action === "write") return role === "operator";
  return false;
}

export function authMiddleware(getUsers: () => User[]) {
  return (req: { headers: { authorization?: string; "x-api-key"?: string } }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (!config.authEnabled) return next();

    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const apiKey = req.headers["x-api-key"];
    const token = bearer ?? apiKey;
    const session = getSession(token);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = getUsers().find((u) => u.id === session.userId);
    if (!user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    (req as { user?: User }).user = user;
    next();
  };
}

export function resolveUserFromToken(getUsers: () => User[], token?: string) {
  const session = getSession(token);
  if (!session) return undefined;
  return getUsers().find((user) => user.id === session.userId);
}

export function isDefaultAdminSetup(users: User[]) {
  const user = users.length === 1 ? users[0] : undefined;
  return Boolean(user?.username === "admin" && verifyPassword("admin", user.passwordHash));
}

export function requireRole(role: UserRole, action: "read" | "write" | "admin" | "audit") {
  if (!canPerform(role, action)) {
    throw new Error("Insufficient permissions");
  }
}
