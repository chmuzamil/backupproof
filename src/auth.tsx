import React, { useState } from "react";
import { Lock, LogIn, ShieldCheck } from "lucide-react";
import { brand } from "../shared/brand";
import { MIN_PASSWORD_LENGTH } from "../shared/schemas";
import type { AuthStatus, UserRole } from "../shared/types";

export const TOKEN_KEY = "backupproof.token";

export function getAuthToken() {
  return window.localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setAuthToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export async function authFetch(input: RequestInfo, init?: RequestInit) {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("content-type") && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  return fetch(input, { ...init, headers });
}

export function canWrite(role?: UserRole) {
  return !role || role === "admin" || role === "operator";
}

export function isAdmin(role?: UserRole) {
  return role === "admin";
}

export function roleLabel(role: UserRole) {
  return {
    admin: "Admin",
    operator: "Operator",
    viewer: "Viewer",
    auditor: "Auditor"
  }[role];
}

export function roleDescription(role: UserRole) {
  return {
    admin: "Full access, including user management.",
    operator: "Can run backups, recovery checks, and change settings.",
    viewer: "Read-only dashboard access.",
    auditor: "Read-only access plus audit log export."
  }[role];
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await authFetch("/api/auth/status");
  return res.json();
}

export function LoginScreen({
  authStatus,
  onAuthenticated
}: {
  authStatus: AuthStatus;
  onAuthenticated: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [username, setUsername] = useState(authStatus.setupRequired ? "admin" : "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const setupMode = mode === "setup" && authStatus.setupRequired;

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Sign in failed");
      setAuthToken(body.token);
      await onAuthenticated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitBootstrap(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      setBusy(false);
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, confirmPassword })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Setup failed");
      setAuthToken(body.token);
      await onAuthenticated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithOidc() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/oidc/login");
      const body = await res.json();
      if (!res.ok || !body.redirect) throw new Error(body.error ?? "SSO is not available");
      window.location.href = body.redirect;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "SSO sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo-mark.svg" width={52} height={52} alt="" />
          <div>
            <strong className="brand-wordmark compact"><span className="brand-backup">Backup</span><span className="accent">Proof</span></strong>
            <p>{brand.tagline}</p>
          </div>
        </div>

        <h1>{setupMode ? "Create your admin account" : "Sign in to BackupProof"}</h1>
        <p className="login-lead">
          {setupMode
            ? "Choose a new username and password. This replaces the temporary default admin account."
            : "Enter your username and password to open the recovery dashboard."}
        </p>

        {authStatus.setupRequired && !setupMode && (
          <div className="banner info login-default-banner">
            Default sign-in is <strong>admin</strong> / <strong>admin</strong>. Change it after you sign in from Profile → Change password.
          </div>
        )}

        <form className="login-form" onSubmit={setupMode ? submitBootstrap : submitLogin}>
          <label>
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={setupMode ? "new-password" : "current-password"} required />
          </label>
          {setupMode && (
            <label>
              <span>Confirm password</span>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
            </label>
          )}
          {message && <div className="banner danger">{message}</div>}
          <button type="submit" className="primary" disabled={busy}>
            <LogIn /> {busy ? "Working..." : setupMode ? "Create admin account" : "Sign in"}
          </button>
        </form>

        {authStatus.setupRequired && (
          <button type="button" className="ghost-button login-sso" onClick={() => {
            setMode(setupMode ? "login" : "setup");
            setMessage("");
            setPassword("");
            setConfirmPassword("");
            if (!setupMode) setUsername("");
          }} disabled={busy}>
            {setupMode ? "Sign in with default admin instead" : "Create a new admin account instead"}
          </button>
        )}

        {!setupMode && authStatus.oidcAvailable && (
          <button type="button" className="ghost-button login-sso" onClick={() => void signInWithOidc()} disabled={busy}>
            <ShieldCheck /> Sign in with SSO
          </button>
        )}

        {setupMode && (
          <p className="login-note"><Lock /> Keep this password somewhere safe. You will use it every time you open BackupProof.</p>
        )}
      </div>
    </div>
  );
}
