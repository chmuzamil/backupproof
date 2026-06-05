import React, { useEffect, useState } from "react";
import { Lock, Trash2, User, UserPlus, Users, XCircle } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "../shared/schemas";
import type { AuthUser, UserRole, UserSummary } from "../shared/types";
import { authFetch, isAdmin, roleDescription, roleLabel } from "./auth";

function ProfileBanner({
  message,
  onDismiss,
  variant = "info"
}: {
  message: string;
  onDismiss: () => void;
  variant?: "info" | "danger";
}) {
  if (!message) return null;
  return (
    <div className={`banner flash ${variant}`} role="status">
      <span className="flash-text">{message}</span>
      <button type="button" className="flash-dismiss" onClick={onDismiss} aria-label="Dismiss">
        <XCircle size={16} />
      </button>
    </div>
  );
}

async function apiPost(path: string, body?: unknown) {
  const res = await authFetch(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error ?? "Request failed");
  return payload;
}

async function apiPatch(path: string, body: unknown) {
  const res = await authFetch(path, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error ?? "Request failed");
  return payload;
}

async function apiDelete(path: string) {
  const res = await authFetch(path, { method: "DELETE" });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error ?? "Request failed");
  return payload;
}

const ROLES: UserRole[] = ["admin", "operator", "viewer", "auditor"];

export function Profile({
  authEnabled,
  currentUser,
  refresh
}: {
  authEnabled: boolean;
  currentUser: AuthUser | null;
  refresh: () => Promise<void>;
}) {
  const [passwordMessage, setPasswordMessage] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const adminAccess = isAdmin(currentUser?.role);

  useEffect(() => {
    if (!authEnabled || !adminAccess) return;
    let active = true;
    setLoadingUsers(true);
    void authFetch("/api/users")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not load users");
        return body as UserSummary[];
      })
      .then((items) => {
        if (active) setUsers(items);
      })
      .catch((err: unknown) => {
        if (active) {
          setUserMessage(err instanceof Error ? err.message : "Could not load users");
        }
      })
      .finally(() => {
        if (active) setLoadingUsers(false);
      });
    return () => { active = false; };
  }, [authEnabled, adminAccess]);

  async function reloadUsers() {
    const res = await authFetch("/api/users");
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Could not load users");
    setUsers(body);
    await refresh();
  }

  async function changePassword(form: FormData) {
    setPasswordMessage("");
    const currentPassword = String(form.get("currentPassword"));
    const newPassword = String(form.get("newPassword"));
    const confirmPassword = String(form.get("confirmPassword"));

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordMessage(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("New passwords do not match.");
      return;
    }

    try {
      await apiPost("/api/auth/password", { currentPassword, newPassword, confirmPassword });
      setPasswordMessage("Password updated.");
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : "Could not update password");
    }
  }

  async function createUser(form: FormData) {
    setUserMessage("");
    const username = String(form.get("username")).trim();
    const password = String(form.get("password"));
    const role = String(form.get("role")) as UserRole;

    if (username.length < 3) {
      setUserMessage("Username must be at least 3 characters.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setUserMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    try {
      await apiPost("/api/users", { username, password, role });
      await reloadUsers();
      setUserMessage(`User ${username} created.`);
    } catch (err) {
      setUserMessage(err instanceof Error ? err.message : "Could not create user");
    }
  }

  async function updateRole(userId: string, role: UserRole) {
    setUserMessage("");
    try {
      await apiPatch(`/api/users/${userId}`, { role });
      await reloadUsers();
      setUserMessage("User role updated.");
    } catch (err) {
      setUserMessage(err instanceof Error ? err.message : "Could not update role");
    }
  }

  async function removeUser(user: UserSummary) {
    if (!window.confirm(`Delete user ${user.username}?`)) return;
    setUserMessage("");
    try {
      await apiDelete(`/api/users/${user.id}`);
      await reloadUsers();
      setUserMessage(`User ${user.username} deleted.`);
    } catch (err) {
      setUserMessage(err instanceof Error ? err.message : "Could not delete user");
    }
  }

  if (!authEnabled) {
    return (
      <section className="profile-layout">
        <div className="banner info">Sign-in is disabled. Profile settings are not used in this mode.</div>
      </section>
    );
  }

  if (!currentUser) {
    return (
      <section className="profile-layout">
        <div className="banner info">Sign in to manage your profile and users.</div>
      </section>
    );
  }

  return (
    <section className="profile-layout">
      <header className="profile-header">
        <div>
          <h1><User /> Profile</h1>
          <p className="muted">Manage your sign-in password and dashboard users.</p>
        </div>
        <div className="profile-identity">
          <strong>{currentUser.username}</strong>
          <span className="pill ok">{roleLabel(currentUser.role)}</span>
        </div>
      </header>

      <form
        className="wizard compact profile-card"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          void changePassword(new FormData(form)).then(() => form.reset()).catch(() => undefined);
        }}
      >
        <section className="wizard-section">
          <h2><Lock /> Change password</h2>
          <div className="form-grid">
            <p className="muted full">Update the password you use to sign in to BackupProof.</p>
            <input name="currentPassword" type="password" placeholder="Current password" autoComplete="current-password" required />
            <input name="newPassword" type="password" placeholder={`New password (${MIN_PASSWORD_LENGTH}+ characters)`} autoComplete="new-password" required />
            <input name="confirmPassword" type="password" placeholder="Confirm new password" autoComplete="new-password" required />
            <button type="submit" className="primary">Update password</button>
          </div>
        </section>
        <ProfileBanner
          message={passwordMessage}
          variant={passwordMessage === "Password updated." ? "info" : "danger"}
          onDismiss={() => setPasswordMessage("")}
        />
      </form>

      {adminAccess && (
        <>
          <form
            className="wizard compact profile-card"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              void createUser(new FormData(form)).then(() => form.reset()).catch(() => undefined);
            }}
          >
            <section className="wizard-section">
              <h2><UserPlus /> Add user</h2>
              <div className="form-grid">
                <p className="muted full">Create accounts for teammates. Operators can run backups; viewers are read-only.</p>
                <input name="username" placeholder="Username" autoComplete="off" required />
                <input name="password" type="password" placeholder={`Password (${MIN_PASSWORD_LENGTH}+ characters)`} autoComplete="new-password" required />
                <label className="wizard-field">
                  <span className="wizard-label">Role</span>
                  <select name="role" defaultValue="operator">
                    {ROLES.map((role) => (
                      <option key={role} value={role}>{roleLabel(role)}</option>
                    ))}
                  </select>
                </label>
                <p className="muted full role-hint">{roleDescription("operator")}</p>
                <button type="submit" className="primary">Create user</button>
              </div>
            </section>
          </form>

          <section className="wizard compact profile-card">
            <section className="wizard-section">
              <h2><Users /> User accounts</h2>
              <div className="profile-user-table-wrap">
                {loadingUsers ? (
                  <p className="muted">Loading users...</p>
                ) : (
                  <table className="profile-user-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Created</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id}>
                          <td>
                            <strong>{user.username}</strong>
                            {user.id === currentUser.id && <span className="profile-you">You</span>}
                          </td>
                          <td>
                            <select
                              value={user.role}
                              onChange={(event) => void updateRole(user.id, event.target.value as UserRole)}
                              aria-label={`Role for ${user.username}`}
                            >
                              {ROLES.map((role) => (
                                <option key={role} value={role}>{roleLabel(role)}</option>
                              ))}
                            </select>
                            <span className="muted profile-role-note">{roleDescription(user.role)}</span>
                          </td>
                          <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                          <td className="profile-user-actions">
                            <button
                              type="button"
                              className="danger"
                              disabled={user.id === currentUser.id}
                              onClick={() => void removeUser(user)}
                              title={user.id === currentUser.id ? "You cannot delete your own account" : `Delete ${user.username}`}
                            >
                              <Trash2 size={16} /> Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
            <ProfileBanner
              message={userMessage}
              variant={userMessage.endsWith("created.") || userMessage.endsWith("updated.") || userMessage.endsWith("deleted.") ? "info" : "danger"}
              onDismiss={() => setUserMessage("")}
            />
          </section>
        </>
      )}

      {!adminAccess && (
        <div className="banner info">Only admins can add or manage other user accounts.</div>
      )}
    </section>
  );
}
