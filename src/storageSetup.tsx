import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  HardDrive,
  Loader2,
  Server,
  ShieldCheck,
  XCircle
} from "lucide-react";
import type { DashboardState, Repository, RepositoryType } from "../shared/types";
import {
  STORAGE_PRESETS,
  buildRepositoryPayload,
  friendlyStorageLabel,
  storageLocationHint,
  supportsImmutableStorage,
  type StorageFormCredentials,
  type StoragePresetId
} from "../shared/storageSetup";
import { authFetch } from "./auth";

export interface StorageFormState {
  presetId: StoragePresetId | "";
  repoName: string;
  repoType: RepositoryType;
  repoLocation: string;
  repoPassword: string;
  objectLock: boolean;
  credentials: StorageFormCredentials;
  googleClientId: string;
  googleClientSecret: string;
  googleConnectionId: string;
  googleRedirectUri: string;
}

export function createStorageFormState(defaults?: Partial<StorageFormState>): StorageFormState {
  return {
    presetId: "",
    repoName: defaults?.repoName ?? "My backup copy",
    repoType: defaults?.repoType ?? "local",
    repoLocation: defaults?.repoLocation ?? ".data/vaults/secondary",
    repoPassword: "",
    objectLock: defaults?.objectLock ?? false,
    credentials: {},
    googleClientId: "",
    googleClientSecret: "",
    googleConnectionId: "",
    googleRedirectUri: defaults?.googleRedirectUri ?? `${window.location.origin}/api/google-drive/oauth/callback`,
    ...defaults
  };
}

export function applyStoragePreset(state: StorageFormState, presetId: StoragePresetId): StorageFormState {
  const preset = STORAGE_PRESETS.find((item) => item.id === presetId);
  if (!preset) return state;
  return {
    ...state,
    presetId,
    repoType: preset.repoType,
    repoLocation: preset.defaultLocation,
    repoName: preset.id === "google-drive" ? "Google Drive copy" : preset.id === "usb-drive" ? "Attached drive copy" : state.repoName
  };
}

function buildPayload(state: StorageFormState, engine: "frd" | "restic" | "kopia" = "frd") {
  return buildRepositoryPayload({
    name: state.repoName,
    engine,
    type: state.repoType,
    location: state.repoLocation,
    password: state.repoPassword || undefined,
    credentials: state.credentials,
    googleConnectionId: state.googleConnectionId || undefined,
    objectLock: state.objectLock
  });
}

export function StoragePresetPicker({
  selected,
  onSelect
}: {
  selected: StoragePresetId | "";
  onSelect: (presetId: StoragePresetId) => void;
}) {
  return (
    <div className="storage-preset-grid">
      {STORAGE_PRESETS.map((preset) => (
        <button
          type="button"
          key={preset.id}
          className={`storage-preset-card ${selected === preset.id ? "selected" : ""}`}
          onClick={() => onSelect(preset.id)}
        >
          <strong>{preset.title}</strong>
          <span>{preset.description}</span>
        </button>
      ))}
    </div>
  );
}

export function StorageLocationForm({
  state,
  setState,
  engine = "frd",
  showPresets = true,
  showPassword = true,
  onMessage
}: {
  state: StorageFormState;
  setState: React.Dispatch<React.SetStateAction<StorageFormState>>;
  engine?: "frd" | "restic" | "kopia";
  showPresets?: boolean;
  showPassword?: boolean;
  onMessage?: (message: string) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const selectedPreset = STORAGE_PRESETS.find((item) => item.id === state.presetId);

  useEffect(() => {
    function receiveGoogleConnection(event: MessageEvent) {
      if (event.data?.type !== "backupproof-google-drive" || typeof event.data.connectionId !== "string") return;
      setState((current) => ({ ...current, googleConnectionId: event.data.connectionId }));
      setGoogleConnecting(false);
      onMessage?.("Google Drive connected.");
    }
    window.addEventListener("message", receiveGoogleConnection);
    return () => window.removeEventListener("message", receiveGoogleConnection);
  }, [onMessage, setState]);

  async function connectGoogleDrive() {
    if (!state.googleClientId.trim() || !state.googleClientSecret.trim()) {
      onMessage?.("Add the Google OAuth client ID and secret first.");
      return;
    }
    setGoogleConnecting(true);
    try {
      const res = await fetch("/api/google-drive/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: state.googleClientId.trim(),
          clientSecret: state.googleClientSecret.trim()
        })
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      const result = await res.json();
      setState((current) => ({ ...current, googleRedirectUri: result.redirectUri }));
      const popup = window.open(result.authorizationUrl, "backupproof-google-drive", "popup,width=560,height=720");
      if (!popup) throw new Error("Allow popups to connect Google Drive.");
    } catch (err) {
      setGoogleConnecting(false);
      onMessage?.(err instanceof Error ? err.message : "Could not connect Google Drive");
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await authFetch("/api/repositories/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildPayload(state, engine))
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Storage test failed");
      setTestResult({ ok: true, message: body.message ?? "Storage connection looks good." });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Storage test failed" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="storage-form">
      {showPresets && (
        <div className="wizard-field full">
          <span className="wizard-label">Choose a storage type</span>
          <StoragePresetPicker
            selected={state.presetId}
            onSelect={(presetId) => {
              setState((current) => applyStoragePreset(current, presetId));
              setTestResult(null);
            }}
          />
        </div>
      )}

      <label className="wizard-field full">
        <span className="wizard-label">Storage name</span>
        <input value={state.repoName} onChange={(e) => setState((current) => ({ ...current, repoName: e.target.value }))} />
      </label>

      <div className="wizard-field full">
        <span className="wizard-label">Storage type</span>
        <div className="choice-row">
          {([
            ["local", HardDrive, "This computer / drive"],
            ["sftp", Server, "Another server"],
            ["s3", Cloud, "S3 cloud"],
            ["b2", Cloud, "Backblaze B2"],
            ["google-drive", Cloud, "Google Drive"]
          ] as const).map(([value, Icon, title]) => (
            <button
              type="button"
              key={value}
              className={`choice-chip ${state.repoType === value ? "selected" : ""}`}
              onClick={() => {
                setState((current) => ({ ...current, repoType: value, presetId: "" }));
                setTestResult(null);
              }}
            >
              <Icon /> {title}
            </button>
          ))}
        </div>
        <p className="muted storage-type-note">{friendlyStorageLabel(state.repoType)}</p>
      </div>

      <label className="wizard-field full">
        <span className="wizard-label">Folder or location</span>
        <span className="wizard-hint">{selectedPreset?.locationPlaceholder ?? storageLocationHint(state.repoType)}</span>
        <input value={state.repoLocation} onChange={(e) => setState((current) => ({ ...current, repoLocation: e.target.value }))} />
      </label>

      {showPassword && (
        <label className="wizard-field full">
          <span className="wizard-label">Backup password</span>
          <span className="wizard-hint">Recommended. It encrypts your backup copies.</span>
          <input type="password" value={state.repoPassword} onChange={(e) => setState((current) => ({ ...current, repoPassword: e.target.value }))} placeholder="Choose a strong passphrase" />
        </label>
      )}

      {state.repoType === "sftp" && (
        <div className="wizard-subpanel">
          <h4>Other server connection</h4>
          <div className="form-grid">
            <label><span>Host</span><input value={state.credentials.host ?? ""} onChange={(e) => setState((current) => ({ ...current, credentials: { ...current.credentials, host: e.target.value } }))} /></label>
            <label><span>Port</span><input value={state.credentials.port ?? "22"} onChange={(e) => setState((current) => ({ ...current, credentials: { ...current.credentials, port: e.target.value } }))} /></label>
            <label><span>Username</span><input value={state.credentials.username ?? ""} onChange={(e) => setState((current) => ({ ...current, credentials: { ...current.credentials, username: e.target.value } }))} /></label>
            <label><span>Password</span><input type="password" value={state.credentials.password ?? ""} onChange={(e) => setState((current) => ({ ...current, credentials: { ...current.credentials, password: e.target.value } }))} /></label>
          </div>
        </div>
      )}

      {(state.repoType === "s3" || state.repoType === "b2") && (
        <div className="wizard-subpanel">
          <h4>Cloud sign-in details</h4>
          <div className="form-grid">
            <label><span>Access key</span><input value={state.credentials.accessKey ?? ""} onChange={(e) => setState((current) => ({ ...current, credentials: { ...current.credentials, accessKey: e.target.value } }))} /></label>
            <label><span>Secret key</span><input type="password" value={state.credentials.secretKey ?? ""} onChange={(e) => setState((current) => ({ ...current, credentials: { ...current.credentials, secretKey: e.target.value } }))} /></label>
            <label><span>Region</span><input value={state.credentials.region ?? ""} onChange={(e) => setState((current) => ({ ...current, credentials: { ...current.credentials, region: e.target.value } }))} placeholder="us-east-1" /></label>
            <label><span>Endpoint</span><input value={state.credentials.endpoint ?? ""} onChange={(e) => setState((current) => ({ ...current, credentials: { ...current.credentials, endpoint: e.target.value } }))} placeholder="Required for B2 / MinIO" /></label>
          </div>
        </div>
      )}

      {supportsImmutableStorage(state.repoType) && (
        <div className="immutable-storage-panel">
          <label className="immutable-toggle">
            <input
              type="checkbox"
              checked={state.objectLock}
              onChange={(e) => setState((current) => ({ ...current, objectLock: e.target.checked }))}
            />
            <div>
              <strong>Protect backups from deletion (immutable storage)</strong>
              <span>Use S3 Object Lock or B2 bucket immutability so ransomware or mistakes cannot erase recent backup copies.</span>
            </div>
          </label>
          {!state.objectLock && (
            <p className="immutable-warning">This cloud bucket will stay mutable. That is fine for testing, but less safe for long-term recovery copies.</p>
          )}
          {state.objectLock && (
            <p className="immutable-note">Your bucket must have Object Lock or immutability enabled. BackupProof stores this preference and uses it with Restic-backed vaults.</p>
          )}
        </div>
      )}

      {state.repoType === "google-drive" && (
        <div className="wizard-subpanel">
          <h4>Google Drive connection</h4>
          <div className="form-grid">
            <label><span>OAuth client ID</span><input value={state.googleClientId} onChange={(e) => setState((current) => ({ ...current, googleClientId: e.target.value }))} /></label>
            <label><span>OAuth client secret</span><input type="password" value={state.googleClientSecret} onChange={(e) => setState((current) => ({ ...current, googleClientSecret: e.target.value }))} /></label>
          </div>
          {state.googleRedirectUri && <div className="oauth-redirect"><span>Authorized redirect URL</span><code>{state.googleRedirectUri}</code></div>}
          <button type="button" className={state.googleConnectionId ? "google-connect connected" : "google-connect"} onClick={connectGoogleDrive} disabled={googleConnecting}>
            <Cloud /> {state.googleConnectionId ? "Google Drive connected" : googleConnecting ? "Waiting for Google..." : "Connect Google Drive"}
          </button>
        </div>
      )}

      <div className="storage-test-row">
        <button type="button" onClick={testConnection} disabled={testing}>
          {testing ? <Loader2 className="spin" /> : <ShieldCheck />}
          {testing ? "Testing storage..." : "Test this storage"}
        </button>
        {testResult && (
          <div className={`storage-test-result ${testResult.ok ? "ok" : "bad"}`}>
            {testResult.ok ? <CheckCircle2 /> : <XCircle />}
            <span>{testResult.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SecondStorageModal({
  state,
  appId,
  onClose,
  refresh
}: {
  state: DashboardState;
  appId: string;
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const app = state.apps.find((item) => item.id === appId);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existingRepositoryId, setExistingRepositoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(() => createStorageFormState({
    repoName: app ? `${app.name} second copy` : "Second copy",
    repoLocation: ".data/vaults/secondary"
  }));

  const availableRepositories = state.repositories.filter((repository) => repository.id !== app?.repositoryId);

  async function save() {
    if (!app) return;
    setSaving(true);
    setMessage("");
    try {
      await authFetch(`/api/apps/${app.id}/secondary-storage`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "existing"
          ? { existingRepositoryId }
          : { repository: buildPayload(form) })
      }).then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Could not save second copy");
        return res.json();
      });
      await refresh();
      onClose();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save second copy");
    } finally {
      setSaving(false);
    }
  }

  if (!app) return null;

  const secondaryNames = (app.secondaryRepositoryIds ?? [])
    .map((id) => state.repositories.find((repository) => repository.id === id))
    .filter((repository): repository is Repository => Boolean(repository));

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card storage-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow"><HardDrive /> Second copy</span>
            <h2>Add a second place for {app.name}</h2>
            <p>If this server fails, your data should still live somewhere else.</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>Close</button>
        </div>

        {secondaryNames.length > 0 && (
          <div className="banner info">
            Already copying to: {secondaryNames.map((repository) => repository.name).join(", ")}
          </div>
        )}

        {message && <div className="banner danger">{message}</div>}

        <div className="choice-row">
          <button type="button" className={`choice-chip ${mode === "new" ? "selected" : ""}`} onClick={() => setMode("new")}>Create new storage</button>
          <button type="button" className={`choice-chip ${mode === "existing" ? "selected" : ""}`} onClick={() => setMode("existing")} disabled={availableRepositories.length === 0}>Use existing storage</button>
        </div>

        {mode === "existing" ? (
          <label className="wizard-field full">
            <span className="wizard-label">Choose storage</span>
            <select value={existingRepositoryId} onChange={(e) => setExistingRepositoryId(e.target.value)}>
              <option value="">Select...</option>
              {availableRepositories.map((repository) => (
                <option key={repository.id} value={repository.id}>{repository.name} · {friendlyStorageLabel(repository.type)}</option>
              ))}
            </select>
          </label>
        ) : (
          <StorageLocationForm state={form} setState={setForm} onMessage={setMessage} />
        )}

        <div className="modal-actions">
          <button type="button" className="primary" onClick={save} disabled={saving || (mode === "existing" && !existingRepositoryId)}>
            <ShieldCheck /> {saving ? "Saving..." : "Save second copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function buildStoragePayload(state: StorageFormState, engine: "frd" | "restic" | "kopia" = "frd") {
  return buildPayload(state, engine);
}
