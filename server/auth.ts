import crypto from "node:crypto";
import { config } from "./config";
import type { User, UserRole } from "../shared/types";

const sessions = new Map<string, { userId: string; role: UserRole; expiresAt: number }>();

export function hashPassword(password: string) {
  return crypto.createHash("sha256").update(`${config.encryptionKey}:${password}`).digest("hex");
}

export function verifyPassword(password: string, hash: string) {
  return hashPassword(password) === hash;
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

export function authMiddleware(users: User[]) {
  return (req: { headers: { authorization?: string; "x-api-key"?: string } }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (!config.authEnabled) return next();

    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const apiKey = req.headers["x-api-key"];
    const token = bearer ?? apiKey;
    const session = getSession(token);

    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = users.find((u) => u.id === session.userId);
    if (!user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    (req as { user?: User }).user = user;
    next();
  };
}

export function requireRole(role: UserRole, action: "read" | "write" | "admin" | "audit") {
  if (!canPerform(role, action)) {
    throw new Error("Insufficient permissions");
  }
}
