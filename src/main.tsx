import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArchiveRestore,
  Bell,
  CheckCircle2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Database,
  Folder,
  FolderSearch,
  HardDrive,
  LifeBuoy,
  Play,
  Scissors,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle
} from "lucide-react";
import type { Alert, AppSummary, DashboardState, DiscoveredContainer, DiscoveredDatabase, DiscoveryResult, Job, JobType, Policy } from "../shared/types";
import type { SnapshotSummary } from "../shared/types";
import { brand } from "../shared/brand";
import "./styles.css";

const api = {
  async getState(): Promise<DashboardState> {
    return fetch("/api/state").then((res) => res.json());
  },
  async getSummaries(): Promise<AppSummary[]> {
    return fetch("/api/summaries").then((res) => res.json());
  },
  async getSnapshots(appId: string): Promise<SnapshotSummary[]> {
    return fetch(`/api/apps/${appId}/snapshots`).then((res) => res.json());
  },
  async getDiscovery(): Promise<DiscoveryResult> {
    return fetch("/api/discovery").then((res) => res.json());
  },
  async post(path: string, body?: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
    return res.json();
  },
  async put(path: string, body: unknown) {
    const res = await fetch(path, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
    return res.json();
  },
  async delete(path: string) {
    const res = await fetch(path, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
    return res.json();
  }
};

function time(value?: string) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never";
}

function bytes(value?: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function BrandWordmark({ compact }: { compact?: boolean }) {
  return (
    <strong className={compact ? "brand-wordmark compact" : "brand-wordmark"}>
      <span className="brand-backup">Backup</span><span className="accent">Proof</span>
    </strong>
  );
}

function SidebarBrand() {
  return (
    <div className="brand">
      <img className="brand-logo" src="/logo-mark.svg" width={46} height={46} alt="" />
      <div className="brand-copy">
        <BrandWordmark compact />
        <p className="brand-tagline">
          <span>Every backup</span>{" "}
          <span className="accent">earns its trust.</span>
        </p>
      </div>
    </div>
  );
}

function App() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [summaries, setSummaries] = useState<AppSummary[]>([]);
  const [active, setActive] = useState<"dashboard" | "protect" | "recovery" | "schedule" | "alerts" | "settings">("dashboard");
  const [error, setError] = useState<string>();

  async function refresh() {
    try {
      const [nextState, nextSummaries] = await Promise.all([api.getState(), api.getSummaries()]);
      setState(nextState);
      setSummaries(nextSummaries);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard");
    }
  }

  useEffect(() => {
    void refresh();
    const events = new EventSource("/events");
    events.onmessage = () => void refresh();
    return () => events.close();
  }, []);

  const latestJobs = useMemo(() => state?.jobs.slice(0, 8) ?? [], [state]);

  if (!state) {
    return (
      <div className="loading">
        <img className="loading-logo" src="/logo-mark.svg" width={56} height={56} alt="" />
        <span>{brand.loadingMessage}</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <SidebarBrand />
        <button className={active === "dashboard" ? "nav active" : "nav"} onClick={() => setActive("dashboard")}><HardDrive /> Dashboard</button>
        <button className={active === "protect" ? "nav active" : "nav"} onClick={() => setActive("protect")}><ShieldCheck /> Protect data</button>
        <button className={active === "recovery" ? "nav active" : "nav"} onClick={() => setActive("recovery")}><LifeBuoy /> Recovery</button>
        <button className={active === "schedule" ? "nav active" : "nav"} onClick={() => setActive("schedule")}><CalendarClock /> Schedule</button>
        <button className={active === "alerts" ? "nav active" : "nav"} onClick={() => setActive("alerts")}><AlertTriangle /> Alerts</button>
        <button className={active === "settings" ? "nav active" : "nav"} onClick={() => setActive("settings")}><Bell /> Notifications</button>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <BrandWordmark />
            <p className="topbar-tagline">{brand.tagline}</p>
            <p className="topbar-sub">Green check = latest backup restored and verified.</p>
          </div>
          <div className="topbar-status">
            <EnvironmentPills state={state} />
            <span className={state.alerts.some((alert) => !alert.acknowledgedAt) ? "pill bad" : "pill ok"}>
              {state.alerts.filter((alert) => !alert.acknowledgedAt).length} alerts
            </span>
          </div>
        </header>
        {error && <div className="banner danger">{error}</div>}
        {state.environment.errors.length > 0 && <div className="banner warning">{state.environment.errors.join(" ")}</div>}
        {state.environment.warnings.length > 0 && <div className="banner info">{state.environment.warnings.join(" ")}</div>}

        {active === "dashboard" && <Dashboard summaries={summaries} jobs={latestJobs} refresh={refresh} />}
        {active === "protect" && <ProtectData state={state} refresh={refresh} />}
        {active === "recovery" && <Recovery summaries={summaries} />}
        {active === "schedule" && <Schedule state={state} summaries={summaries} refresh={refresh} />}
        {active === "alerts" && <Alerts state={state} summaries={summaries} refresh={refresh} />}
        {active === "settings" && <Notifications state={state} refresh={refresh} />}
      </main>
    </div>
  );
}

function EnvironmentPills({ state }: { state: DashboardState }) {
  const items = [
    ["Data", state.environment.dataDirWritable],
    ["FRD", true],
    ["Restic", state.environment.resticAvailable ?? false],
    ["Kopia", state.environment.kopiaAvailable ?? false]
  ] as const;
  return (
    <div className="pills">
      {items.map(([label, ok]) => (
        <span className={ok ? "pill ok" : "pill bad"} key={label} title={
          label === "Restic" ? state.environment.resticVersion : label === "Kopia" ? state.environment.kopiaVersion : undefined
        }>
          {ok ? <CheckCircle2 /> : <XCircle />}
          {label}
        </span>
      ))}
    </div>
  );
}

function Dashboard({ summaries, jobs, refresh }: { summaries: AppSummary[]; jobs: Job[]; refresh: () => Promise<void> }) {
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoMessage, setDemoMessage] = useState("");

  async function runDemo() {
    setDemoRunning(true);
    setDemoMessage("");
    try {
      await api.post("/api/demo/run");
      await refresh();
      setDemoMessage("Demo started. Backup runs first, then the restore proof follows automatically.");
    } catch (err) {
      setDemoMessage(err instanceof Error ? err.message : "Could not start the demo");
    } finally {
      setDemoRunning(false);
    }
  }

  return (
    <section className="grid-layout">
      <div className="apps">
        <div className="demo-strip">
          <div>
            <strong>Green check demo</strong>
            <span>See {brand.name} back up sample data, restore it, and verify the proof.</span>
          </div>
          <button onClick={runDemo} disabled={demoRunning}><Sparkles /> {demoRunning ? "Starting..." : "Run demo"}</button>
        </div>
        {demoMessage && <div className="banner info">{demoMessage}</div>}
        <div className="section-title">
          <h2>Protected Apps</h2>
          <span>{summaries.length} app{summaries.length === 1 ? "" : "s"}</span>
        </div>
        {summaries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="app-grid">
            {summaries.map((summary) => <AppCard key={summary.app.id} summary={summary} refresh={refresh} />)}
          </div>
        )}
      </div>
      <JobPanel jobs={jobs} refresh={refresh} />
    </section>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <ShieldCheck />
      <h2>No apps protected yet</h2>
      <p>Add your first backup from <strong>Protect data</strong> in the sidebar.</p>
    </div>
  );
}

function AppCard({ summary, refresh }: { summary: AppSummary; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState("");

  async function run(type: JobType) {
    await api.post(`/api/apps/${summary.app.id}/jobs/${type}`);
    await refresh();
  }

  async function deleteSnapshots() {
    if (!window.confirm(`Delete ALL backup snapshots for "${summary.app.name}"? This cannot be undone.`)) return;
    setMessage("");
    try {
      await api.delete(`/api/apps/${summary.app.id}/snapshots`);
      await refresh();
      setMessage("All snapshots deleted.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not delete snapshots");
    }
  }

  async function removeApp() {
    if (!window.confirm(`Remove "${summary.app.name}" from the dashboard? All backups and job history for this app will be deleted.`)) return;
    setMessage("");
    try {
      await api.delete(`/api/apps/${summary.app.id}`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove app");
    }
  }

  return (
    <article className="app-card">
      <div className="card-head">
        <div>
          <h3>{summary.app.name}</h3>
          <p>{summary.repository?.name ?? "No repository"} · {summary.app.recipeType}</p>
        </div>
        <span className={summary.restorable ? "status good" : "status risk"}>
          {summary.restorable ? <CheckCircle2 /> : <AlertTriangle />}
          {summary.restorable ? "Restorable" : "Needs proof"}
        </span>
      </div>
      <div className="metrics">
        <div><span>Last backup</span><strong>{time(summary.latestBackup?.finishedAt)}</strong></div>
        <div><span>Restore test</span><strong>{time(summary.restoreProof?.testedAt)}</strong></div>
        <div><span>Confidence</span><strong>{summary.confidenceScore}/100</strong></div>
        <div><span>Snapshots</span><strong>{summary.snapshotCount} · {bytes(summary.latestSnapshot?.sizeBytes)}</strong></div>
      </div>
      <div className="snapshot-line">Latest snapshot: {summary.latestSnapshot?.id ?? "None yet"}</div>
      <div className="checks">
        {summary.app.healthChecks.map((check) => <span key={check.id}>{check.type}: {check.target}</span>)}
      </div>
      {summary.alerts.length > 0 && <div className="inline-alert">{summary.alerts[0].title}</div>}
      <div className="actions">
        <button onClick={() => run("backup")}><Play /> Backup</button>
        <button onClick={() => run("restore-test")}><RotateCcw /> Test restore</button>
        <button onClick={() => run("manual-restore")}><LifeBuoy /> Restore</button>
        <button onClick={() => run("prune")}><Scissors /> Prune</button>
      </div>
      <div className="danger-actions">
        <button type="button" className="danger" onClick={deleteSnapshots}><Trash2 /> Delete snapshots</button>
        <button type="button" className="danger" onClick={removeApp}><Trash2 /> Remove app</button>
      </div>
      {message && <div className="banner info">{message}</div>}
    </article>
  );
}

function JobPanel({ jobs, refresh }: { jobs: Job[]; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState("");

  async function clearLogs() {
    if (!window.confirm("Clear completed job logs from the stream? Running jobs will stay.")) return;
    setMessage("");
    try {
      await api.post("/api/jobs/clear", {});
      await refresh();
      setMessage("Job logs cleared.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not clear job logs");
    }
  }

  return (
    <aside className="job-panel">
      <div className="section-title">
        <h2>Job Stream</h2>
        <button type="button" className="ghost-button" onClick={clearLogs}><Trash2 /> Clear logs</button>
      </div>
      {message && <div className="banner info">{message}</div>}
      {jobs.length === 0 ? (
        <p className="muted">No jobs yet.</p>
      ) : jobs.map((job) => (
        <details key={job.id} className={`job ${job.status}`}>
          <summary>
            <span>{job.type}</span>
            <strong>{job.status}</strong>
          </summary>
          <div className="job-meta">{time(job.startedAt)} · exit {job.exitCode ?? "pending"}</div>
          <pre>{job.logs.map((log) => `[${new Date(log.at).toLocaleTimeString()}] ${log.line}`).join("\n") || "Waiting for output..."}</pre>
        </details>
      ))}
    </aside>
  );
}

function WizardField({ label, hint, children, full }: { label: string; hint?: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={full ? "wizard-field full" : "wizard-field"}>
      <span className="wizard-label">{label}</span>
      {hint && <span className="wizard-hint">{hint}</span>}
      {children}
    </label>
  );
}

type WizardRecipe = "compose-files" | "docker-compose" | "postgres" | "mysql";
type WizardVault = "local" | "sftp" | "s3" | "b2";
type WizardEngine = "frd" | "restic" | "kopia";

const PROTECT_STEPS = ["What to protect", "Where to store", "Restore proof", "Review"];

function ProtectData({ state, refresh }: { state: DashboardState; refresh: () => Promise<void> }) {
  const defaultPolicy = state.policies[0];
  const resticOk = state.environment.resticAvailable ?? false;
  const kopiaOk = state.environment.kopiaAvailable ?? false;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [message, setMessage] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pathMode, setPathMode] = useState<"scan" | "manual">("scan");
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [vaultPrefilled, setVaultPrefilled] = useState(false);

  const [appName, setAppName] = useState("");
  const [recipeType, setRecipeType] = useState<WizardRecipe>("compose-files");
  const [backupPaths, setBackupPaths] = useState("");
  const [composePath, setComposePath] = useState("");
  const [projectName, setProjectName] = useState("");

  const [engine, setEngine] = useState<WizardEngine>("frd");
  const [repoName, setRepoName] = useState("My safety vault");
  const [repoType, setRepoType] = useState<WizardVault>("local");
  const [repoLocation, setRepoLocation] = useState(".data/vaults/default");
  const [repoPassword, setRepoPassword] = useState("");
  const [sftpHost, setSftpHost] = useState("");
  const [sftpPort, setSftpPort] = useState("22");
  const [sftpUsername, setSftpUsername] = useState("");
  const [sftpPassword, setSftpPassword] = useState("");
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [s3Region, setS3Region] = useState("");
  const [s3Endpoint, setS3Endpoint] = useState("");

  const [healthType, setHealthType] = useState<"file" | "http">("file");
  const [healthTarget, setHealthTarget] = useState("");
  const [healthExpected, setHealthExpected] = useState("");

  const [dbHost, setDbHost] = useState("127.0.0.1");
  const [dbPort, setDbPort] = useState("");
  const [dbName, setDbName] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [dumpPath, setDumpPath] = useState("");

  const locationHint = {
    local: "Folder on this machine, e.g. D:\\Backups\\my-vault or /backups/my-vault",
    sftp: "Remote folder path, e.g. /backups/my-vault",
    s3: "Bucket and optional prefix, e.g. my-bucket/backups",
    b2: "Bucket name, e.g. my-b2-bucket/backups"
  }[repoType];

  function parsePaths(raw: string) {
    return raw.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  }

  function applySelectedPaths(paths: string[]) {
    setSelectedPaths(paths);
    setBackupPaths(paths.join("\n"));
  }

  async function scan() {
    setScanning(true);
    try {
      const result = await api.getDiscovery();
      setDiscovery(result);
      const recommended = result.paths.filter((item) => item.recommended).map((item) => item.path);
      applySelectedPaths(recommended);
      setAppName((current) => current || result.defaultAppName);
      if (!vaultPrefilled) {
        setRepoLocation(result.defaultVaultPath);
        setVaultPrefilled(true);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not scan this machine");
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    void scan();
  }, []);

  function togglePath(itemPath: string) {
    setSelectedPaths((current) => {
      const next = current.includes(itemPath) ? current.filter((item) => item !== itemPath) : [...current, itemPath];
      setBackupPaths(next.join("\n"));
      return next;
    });
  }

  function switchPathMode(mode: "scan" | "manual") {
    if (mode === "scan") {
      setSelectedPaths(parsePaths(backupPaths));
    }
    setPathMode(mode);
  }

  function mergePaths(paths: string[]) {
    const merged = new Set(parsePaths(backupPaths));
    for (const item of paths) merged.add(item);
    return [...merged].join("\n");
  }

  function applyContainer(container: DiscoveredContainer) {
    setPathMode("manual");
    setRecipeType("docker-compose");
    setAppName((current) => current || container.composeProject || container.name);
    if (container.composeFile) setComposePath(container.composeFile);
    if (container.composeProject) setProjectName(container.composeProject);
    setBackupPaths(mergePaths(container.suggestedPaths));
    setMessage(`Applied container ${container.name}. Review paths and compose file below.`);
  }

  function applyDatabase(database: DiscoveredDatabase) {
    setPathMode("manual");
    setRecipeType(database.engine === "postgres" ? "postgres" : "mysql");
    setAppName((current) => current || database.name);
    setDbHost(database.host);
    setDbPort(String(database.port));
    setDbUser(database.username ?? (database.engine === "postgres" ? "postgres" : "root"));
    if (database.database) setDbName(database.database);
    if (database.dataPath) setBackupPaths(mergePaths([database.dataPath]));
    setMessage(`Applied ${database.engine} target ${database.name}. Add the database password if required.`);
  }

  function stepError(): string | undefined {
    if (step === 0) {
      if (!appName.trim()) return "Give your backup a name.";
      if (pathMode === "scan" && selectedPaths.length === 0 && parsePaths(backupPaths).length === 0) {
        return "Select at least one folder from the scan, or switch to manual entry.";
      }
      if (parsePaths(backupPaths).length === 0) return "Add at least one folder or file to protect.";
      if (pathMode === "manual" && recipeType === "docker-compose" && !composePath.trim()) {
        return "Add the path to your docker-compose.yml file.";
      }
      if (pathMode === "manual" && (recipeType === "postgres" || recipeType === "mysql") && (!dbName.trim() || !dbUser.trim())) {
        return "Database name and user are required for database backups.";
      }
    }
    if (step === 1) {
      if (!repoName.trim()) return "Name your backup vault.";
      if (!repoLocation.trim()) return "Set where backups should be stored.";
      if ((engine === "restic" || engine === "kopia") && repoPassword.length < 8) {
        return "Restic and Kopia require a vault passphrase of at least 8 characters.";
      }
      if (repoType === "sftp" && (!sftpHost.trim() || !sftpUsername.trim())) return "SFTP host and username are required.";
      if ((repoType === "s3" || repoType === "b2") && (!s3AccessKey.trim() || !s3SecretKey.trim())) {
        return "Cloud access key and secret key are required.";
      }
    }
    if (step === 2 && !healthTarget.trim()) {
      return "Add a restore proof check so the dashboard can verify backups really work.";
    }
    return undefined;
  }

  function autoHealthTarget() {
    const first = parsePaths(backupPaths)[0];
    if (first && !healthTarget) setHealthTarget(first);
  }

  async function submit() {
    const err = stepError();
    if (err) {
      setMessage(err);
      return;
    }
    if (!defaultPolicy) {
      setMessage("No schedule policy found. Refresh the page or check server configuration.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const repo = await api.post("/api/repositories", {
        name: repoName.trim(),
        engine,
        type: repoType,
        location: repoLocation.trim(),
        password: repoPassword || undefined,
        credentials: repoType === "sftp" ? {
          host: sftpHost.trim(),
          port: sftpPort || "22",
          username: sftpUsername.trim(),
          password: sftpPassword || undefined
        } : repoType === "s3" || repoType === "b2" ? {
          accessKey: s3AccessKey.trim(),
          secretKey: s3SecretKey.trim(),
          region: s3Region.trim() || undefined,
          endpoint: s3Endpoint.trim() || undefined
        } : undefined
      });

      await api.post("/api/apps", {
        name: appName.trim(),
        composePath: composePath.trim(),
        projectName: projectName.trim(),
        services: [],
        safeRestoreServices: [],
        recipeType,
        backupPaths: parsePaths(backupPaths),
        database: recipeType === "postgres" || recipeType === "mysql" ? {
          service: recipeType,
          host: dbHost.trim() || undefined,
          port: dbPort ? Number(dbPort) : undefined,
          database: dbName.trim(),
          username: dbUser.trim(),
          password: dbPassword || undefined,
          dumpPath: dumpPath.trim() || undefined
        } : undefined,
        healthChecks: [{ type: healthType, target: healthTarget.trim(), expected: healthExpected.trim() || undefined }],
        repositoryId: repo.id,
        policyId: defaultPolicy.id
      });

      await refresh();
      setCompleted(true);
      setMessage(`Success! Go to Dashboard, run Backup, then Test restore to earn the ${brand.name} green check.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save app");
    } finally {
      setSaving(false);
    }
  }

  function nextStep() {
    const err = stepError();
    if (err) {
      setMessage(err);
      return;
    }
    setMessage("");
    if (step === 0) autoHealthTarget();
    if (step === 1 && repoType === "local" && !vaultPrefilled) {
      setRepoLocation(`.data/vaults/${appName.trim().toLowerCase().replace(/\s+/g, "-") || "default"}`);
    }
    setStep((s) => Math.min(s + 1, PROTECT_STEPS.length - 1));
  }

  function prevStep() {
    setMessage("");
    setStep((s) => Math.max(s - 1, 0));
  }

  if (!defaultPolicy) {
    return (
      <div className="empty">
        <ShieldCheck />
        <h2>No schedule policy yet</h2>
        <p>Refresh the page. A default schedule policy should load automatically.</p>
      </div>
    );
  }

  return (
    <section className={`wizard-flow ${pathMode === "scan" && step === 0 ? "wide" : ""}`}>
      <div className="wizard-intro">
        <h2>Protect data</h2>
        <p>Scan this machine or enter paths manually, then prove every backup with {brand.name}.</p>
      </div>

      <div className="wizard-steps">
        {PROTECT_STEPS.map((label, index) => (
          <div className={`wizard-step ${index === step ? "active" : ""} ${index < step ? "done" : ""}`} key={label}>
            <span className="wizard-step-num">{index < step ? "✓" : index + 1}</span>
            <span className="wizard-step-label">{label}</span>
          </div>
        ))}
      </div>

      {message && <div className={`banner ${message.startsWith("Success") ? "info" : "danger"}`}>{message}</div>}

      {step === 0 && (
        <div className="wizard-panel">
          <h3>What do you want to protect?</h3>
          <p className="wizard-lead">Start with a scan for common folders, or enter paths yourself for Docker and databases.</p>

          <WizardField label="Name" hint="Something you will recognize on the dashboard">
            <input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="e.g. Family photos, Nextcloud, Shop database" />
          </WizardField>

          <div className="wizard-field full">
            <span className="wizard-label">How to pick folders</span>
            <div className="choice-row">
              <button type="button" className={`choice-chip ${pathMode === "scan" ? "selected" : ""}`} onClick={() => switchPathMode("scan")}>
                <FolderSearch /> Scan this machine
              </button>
              <button type="button" className={`choice-chip ${pathMode === "manual" ? "selected" : ""}`} onClick={() => switchPathMode("manual")}>
                <Folder /> Enter paths manually
              </button>
            </div>
          </div>

          {pathMode === "scan" ? (
            <>
              <div className="section-title compact-title">
                <span>{scanning ? "Scanning for backup targets…" : `${selectedPaths.length} folder${selectedPaths.length === 1 ? "" : "s"} selected`}</span>
                <button type="button" onClick={scan} disabled={scanning}><Sparkles /> {scanning ? "Scanning..." : "Scan again"}</button>
              </div>
              {discovery?.warnings.map((warning) => <div className="banner warning" key={warning}>{warning}</div>)}
              {!discovery && scanning ? (
                <div className="empty compact-empty">
                  <FolderSearch />
                  <h2>Looking for likely backup targets</h2>
                  <p>Checking common folders and running services.</p>
                </div>
              ) : discovery ? (
                <>
                  <div className="discover-summary">
                    <div><span>Machine</span><strong>{discovery.host.platform}</strong></div>
                    <div><span>Home folder</span><strong>{discovery.host.homeDir}</strong></div>
                    <div><span>Found folders</span><strong>{discovery.paths.length}</strong></div>
                  </div>
                  <div className="path-picker">
                    {discovery.paths.length === 0 ? (
                      <div className="empty compact-empty">
                        <HardDrive />
                        <h2>No common folders found</h2>
                        <p>Switch to <strong>Enter paths manually</strong> and type the folders you want protected.</p>
                      </div>
                    ) : discovery.paths.map((item) => (
                      <label className={selectedPaths.includes(item.path) ? "path-row selected" : "path-row"} key={item.path}>
                        <input type="checkbox" checked={selectedPaths.includes(item.path)} onChange={() => togglePath(item.path)} />
                        <div>
                          <strong>{item.label}</strong>
                          <span>{item.reason}</span>
                          <small>{item.path}</small>
                        </div>
                      </label>
                    ))}
                  </div>
                  {discovery.services.length > 0 && (
                    <div className="wizard-subpanel">
                      <h4><Server /> Running services detected</h4>
                      {discovery.services.map((service) => (
                        <div className="service-row" key={`${service.name}-${service.displayName ?? ""}`}>
                          <strong>{service.displayName ?? service.name}</strong>
                          <span>{service.name}</span>
                          <p>{service.hint}</p>
                        </div>
                      ))}
                      <p className="muted">For Docker Compose or database backups, switch to manual entry.</p>
                    </div>
                  )}
                </>
              ) : null}
            </>
          ) : (
            <>
              <div className="wizard-subpanel infra-panel">
                <div className="section-title compact-title">
                  <h4><Server /> Detected on this machine</h4>
                  <button type="button" onClick={scan} disabled={scanning}><Sparkles /> {scanning ? "Scanning..." : "Refresh detection"}</button>
                </div>
                {discovery?.warnings.map((warning) => <div className="banner warning" key={warning}>{warning}</div>)}
                {!discovery && scanning ? (
                  <p className="muted">Scanning for Docker containers and database servers…</p>
                ) : discovery ? (
                  <>
                    <div className="discover-summary">
                      <div><span>Docker</span><strong>{discovery.dockerAvailable ? `${discovery.containers.length} running` : "Not available"}</strong></div>
                      <div><span>Database servers</span><strong>{discovery.databases.length}</strong></div>
                      <div><span>Services</span><strong>{discovery.services.length}</strong></div>
                    </div>

                    {discovery.containers.length > 0 && (
                      <div className="infra-section">
                        <span className="wizard-label">Running containers</span>
                        <div className="infra-list">
                          {discovery.containers.map((container) => (
                            <div className="infra-card" key={container.id}>
                              <div>
                                <strong>{container.name}</strong>
                                <span>{container.image} · {container.status}</span>
                                {container.composeProject && <span>Compose project: {container.composeProject}</span>}
                                {container.suggestedPaths.length > 0 ? (
                                  <small>{container.suggestedPaths.join(", ")}</small>
                                ) : (
                                  <small>No host bind mounts detected — volume-only storage.</small>
                                )}
                                {container.mounts.length > 0 && (
                                  <small>
                                    Mounts: {container.mounts.map((mount) => `${mount.source || mount.type} → ${mount.destination}`).join(" · ")}
                                  </small>
                                )}
                              </div>
                              <button type="button" className="infra-use" onClick={() => applyContainer(container)}>
                                Use container
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {discovery.databases.length > 0 && (
                      <div className="infra-section">
                        <span className="wizard-label">Database servers</span>
                        <div className="infra-list">
                          {discovery.databases.map((database) => (
                            <div className="infra-card" key={database.id}>
                              <div>
                                <strong>{database.name}</strong>
                                <span>{database.engine.toUpperCase()} · {database.source === "docker" ? "Docker" : "Host"} · {database.host}:{database.port}</span>
                                {database.databases.length > 0 && (
                                  <small>Databases: {database.databases.join(", ")}</small>
                                )}
                                {database.dataPath && <small>Data folder: {database.dataPath}</small>}
                                <small>{database.hint}</small>
                              </div>
                              <button type="button" className="infra-use" onClick={() => applyDatabase(database)}>
                                Use database
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {discovery.containers.length === 0 && discovery.databases.length === 0 && (
                      <p className="muted">
                        {discovery.dockerAvailable
                          ? "No running containers or database servers detected. Enter paths below."
                          : "Docker is not available on this machine. Enter paths below or install Docker to detect containers."}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="muted">Detection has not run yet.</p>
                )}
              </div>

              <div className="wizard-field full">
                <span className="wizard-label">Backup type</span>
                <div className="choice-grid">
                  {([
                    ["compose-files", Folder, "Files & folders", "Documents, app data, project files"],
                    ["docker-compose", Server, "Docker Compose", "Compose file + mounted folders"],
                    ["postgres", Database, "PostgreSQL", "Host-native database dump"],
                    ["mysql", Database, "MySQL / MariaDB", "Host-native database dump"]
                  ] as const).map(([value, Icon, title, desc]) => (
                    <button
                      type="button"
                      key={value}
                      className={`choice-card ${recipeType === value ? "selected" : ""}`}
                      onClick={() => setRecipeType(value)}
                    >
                      <Icon />
                      <strong>{title}</strong>
                      <span>{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <WizardField
                label="Paths to back up"
                hint="One per line or comma-separated. These must exist on this machine."
                full
              >
                <textarea
                  value={backupPaths}
                  onChange={(e) => setBackupPaths(e.target.value)}
                  placeholder={"C:\\Users\\you\\Documents\nD:\\Projects\\my-app\\data"}
                  rows={3}
                />
              </WizardField>

              {recipeType === "docker-compose" && (
                <WizardField label="Docker Compose file" hint="Full path to compose.yml">
                  <input value={composePath} onChange={(e) => setComposePath(e.target.value)} placeholder="C:\\projects\\my-app\\docker-compose.yml" />
                </WizardField>
              )}

              {(recipeType === "postgres" || recipeType === "mysql") && (
                <div className="form-grid">
                  <WizardField label="Database name"><input value={dbName} onChange={(e) => setDbName(e.target.value)} /></WizardField>
                  <WizardField label="Database user"><input value={dbUser} onChange={(e) => setDbUser(e.target.value)} /></WizardField>
                  <WizardField label="Host"><input value={dbHost} onChange={(e) => setDbHost(e.target.value)} /></WizardField>
                  <WizardField label="Port"><input value={dbPort} onChange={(e) => setDbPort(e.target.value)} placeholder={recipeType === "postgres" ? "5432" : "3306"} /></WizardField>
                  <WizardField label="Password"><input type="password" value={dbPassword} onChange={(e) => setDbPassword(e.target.value)} /></WizardField>
                  <WizardField label="Dump file path" hint="Optional"><input value={dumpPath} onChange={(e) => setDumpPath(e.target.value)} placeholder=".data/dumps/mydb.sql" /></WizardField>
                </div>
              )}

              <button type="button" className="wizard-link" onClick={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? "Hide" : "Show"} advanced options
              </button>
              {showAdvanced && (
                <div className="form-grid">
                  <WizardField label="Compose path" hint="Optional"><input value={composePath} onChange={(e) => setComposePath(e.target.value)} /></WizardField>
                  <WizardField label="Project name" hint="Optional"><input value={projectName} onChange={(e) => setProjectName(e.target.value)} /></WizardField>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="wizard-panel">
          <h3>Where should backups be stored?</h3>
          <p className="wizard-lead">Pick a storage location. The built-in {brand.engineLabel} engine needs no extra software.</p>

          <div className="wizard-field full">
            <span className="wizard-label">Backup engine</span>
            <div className="choice-grid engines">
              <button type="button" className={`choice-card ${engine === "frd" ? "selected" : ""}`} onClick={() => setEngine("frd")}>
                <ShieldCheck />
                <strong>{brand.engineLabel}</strong>
                <span>Recommended · encrypted · incremental</span>
              </button>
              {resticOk && (
                <button type="button" className={`choice-card ${engine === "restic" ? "selected" : ""}`} onClick={() => setEngine("restic")}>
                  <HardDrive />
                  <strong>Restic</strong>
                  <span>{state.environment.resticVersion ?? "Installed"}</span>
                </button>
              )}
              {kopiaOk && (
                <button type="button" className={`choice-card ${engine === "kopia" ? "selected" : ""}`} onClick={() => setEngine("kopia")}>
                  <HardDrive />
                  <strong>Kopia</strong>
                  <span>{state.environment.kopiaVersion ?? "Installed"}</span>
                </button>
              )}
            </div>
          </div>

          <WizardField label="Vault name" hint="Label shown on the dashboard">
            <input value={repoName} onChange={(e) => setRepoName(e.target.value)} />
          </WizardField>

          <div className="wizard-field full">
            <span className="wizard-label">Storage type</span>
            <div className="choice-row">
              {([
                ["local", HardDrive, "Local folder"],
                ["sftp", Server, "SFTP server"],
                ["s3", Cloud, "S3-compatible"],
                ["b2", Cloud, "Backblaze B2"]
              ] as const).map(([value, Icon, title]) => (
                <button
                  type="button"
                  key={value}
                  className={`choice-chip ${repoType === value ? "selected" : ""}`}
                  onClick={() => setRepoType(value)}
                >
                  <Icon /> {title}
                </button>
              ))}
            </div>
          </div>

          <WizardField label="Location" hint={locationHint} full>
            <input value={repoLocation} onChange={(e) => setRepoLocation(e.target.value)} />
          </WizardField>

          <WizardField
            label="Vault passphrase"
            hint={engine === "frd" ? "Recommended — encrypts your backup chunks" : "Required — minimum 8 characters"}
          >
            <input type="password" value={repoPassword} onChange={(e) => setRepoPassword(e.target.value)} placeholder="Choose a strong passphrase" />
          </WizardField>

          {repoType === "sftp" && (
            <div className="wizard-subpanel">
              <h4>SFTP connection</h4>
              <div className="form-grid">
                <WizardField label="Host"><input value={sftpHost} onChange={(e) => setSftpHost(e.target.value)} /></WizardField>
                <WizardField label="Port"><input value={sftpPort} onChange={(e) => setSftpPort(e.target.value)} /></WizardField>
                <WizardField label="Username"><input value={sftpUsername} onChange={(e) => setSftpUsername(e.target.value)} /></WizardField>
                <WizardField label="Password"><input type="password" value={sftpPassword} onChange={(e) => setSftpPassword(e.target.value)} /></WizardField>
              </div>
            </div>
          )}

          {(repoType === "s3" || repoType === "b2") && (
            <div className="wizard-subpanel">
              <h4>Cloud credentials</h4>
              <div className="form-grid">
                <WizardField label="Access key"><input value={s3AccessKey} onChange={(e) => setS3AccessKey(e.target.value)} /></WizardField>
                <WizardField label="Secret key"><input type="password" value={s3SecretKey} onChange={(e) => setS3SecretKey(e.target.value)} /></WizardField>
                <WizardField label="Region" hint="e.g. us-east-1"><input value={s3Region} onChange={(e) => setS3Region(e.target.value)} /></WizardField>
                <WizardField label="Endpoint" hint="Required for B2 / MinIO"><input value={s3Endpoint} onChange={(e) => setS3Endpoint(e.target.value)} placeholder="https://s3.us-west-000.backblazeb2.com" /></WizardField>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="wizard-panel">
          <h3>How should we verify restores?</h3>
          <p className="wizard-lead">
            After each backup, the dashboard restores to a safe sandbox and runs this check.
            When it passes, you get the green <strong>Restorable</strong> badge.
          </p>

          <div className="wizard-callout">
            <CheckCircle2 />
            <div>
              <strong>The {brand.name} difference</strong>
              <span>Most backup tools only confirm the backup ran. {brand.name} proves the data comes back — {brand.tagline.toLowerCase()}</span>
            </div>
          </div>

          <div className="choice-row">
            <button type="button" className={`choice-chip ${healthType === "file" ? "selected" : ""}`} onClick={() => setHealthType("file")}>
              <Folder /> File or folder exists after restore
            </button>
            <button type="button" className={`choice-chip ${healthType === "http" ? "selected" : ""}`} onClick={() => setHealthType("http")}>
              <Server /> HTTP endpoint responds
            </button>
          </div>

          <WizardField
            label={healthType === "file" ? "File or folder to check" : "URL to check"}
            hint={healthType === "file" ? "Path that must exist in the restore sandbox (folders like /var/www are OK)" : "Must return HTTP 200 after restore"}
            full
          >
            <input
              value={healthTarget}
              onChange={(e) => setHealthTarget(e.target.value)}
              placeholder={healthType === "file" ? parsePaths(backupPaths)[0] ?? "C:\\path\\to\\important-file.txt" : "http://localhost:8080/health"}
            />
          </WizardField>

          <WizardField label="Expected text inside file or response" hint="Optional — leave blank to only check existence">
            <input value={healthExpected} onChange={(e) => setHealthExpected(e.target.value)} placeholder="e.g. status: ok" />
          </WizardField>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-panel">
          <h3>Review and protect</h3>
          <p className="wizard-lead">Confirm everything looks right, then start protecting.</p>

          <dl className="wizard-review">
            <div><dt>App name</dt><dd>{appName || "—"}</dd></div>
            <div><dt>Selection</dt><dd>{pathMode === "scan" ? `Scan (${selectedPaths.length} folders)` : "Manual entry"}</dd></div>
            <div><dt>Backup type</dt><dd>{recipeType}</dd></div>
            <div><dt>Paths</dt><dd>{parsePaths(backupPaths).join(", ") || "—"}</dd></div>
            <div><dt>Engine</dt><dd>{engine.toUpperCase()}</dd></div>
            <div><dt>Vault</dt><dd>{repoName} ({repoType})</dd></div>
            <div><dt>Location</dt><dd>{repoLocation}</dd></div>
            <div><dt>Restore proof</dt><dd>{healthType}: {healthTarget || "—"}</dd></div>
            <div><dt>Schedule</dt><dd>{defaultPolicy.name}</dd></div>
          </dl>
        </div>
      )}

      <div className="wizard-nav">
        <button type="button" className="wizard-back" onClick={prevStep} disabled={step === 0 || saving}>
          <ChevronLeft /> Back
        </button>
        {step < PROTECT_STEPS.length - 1 ? (
          <button type="button" className="primary" onClick={nextStep}>
            Next <ChevronRight />
          </button>
        ) : (
          <button type="button" className="primary" onClick={submit} disabled={saving || completed}>
            <ShieldCheck /> {saving ? "Protecting..." : completed ? "Protected" : "Protect this app"}
          </button>
        )}
      </div>
    </section>
  );
}

function WizardSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="wizard-section">
      <h2>{icon}{title}</h2>
      <div className="form-grid">{children}</div>
    </section>
  );
}

function Recovery({ summaries }: { summaries: AppSummary[] }) {
  const [selectedAppId, setSelectedAppId] = useState("");
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [message, setMessage] = useState("");
  const [drScenario, setDrScenario] = useState("lost-server");
  const selectedApp = summaries.find((summary) => summary.app.id === selectedAppId) ?? summaries[0];

  useEffect(() => {
    if (!selectedAppId && summaries[0]) {
      setSelectedAppId(summaries[0].app.id);
    }
  }, [selectedAppId, summaries]);

  useEffect(() => {
    if (!selectedApp?.app.id) {
      setSnapshots([]);
      setSelectedSnapshotId("");
      return;
    }
    void api.getSnapshots(selectedApp.app.id).then((items) => {
      setSnapshots(items);
      setSelectedSnapshotId((current) => current || items[0]?.id || "");
    });
  }, [selectedApp?.app.id]);

  async function runDr() {
    if (!selectedApp) return;
    try {
      await api.post(`/api/apps/${selectedApp.app.id}/dr-run`, {
        scenario: drScenario,
        snapshotId: selectedSnapshotId || undefined,
        targetDir: targetDir.trim() || undefined
      });
      setMessage("DR run started. Restore, proof, and report will complete in the job stream.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start DR run");
    }
  }

  async function restoreSelected() {
    if (!selectedApp || !selectedSnapshotId) {
      setMessage("Choose an app and snapshot first.");
      return;
    }
    try {
      await api.post(`/api/apps/${selectedApp.app.id}/restore`, {
        snapshotId: selectedSnapshotId,
        targetDir: targetDir.trim() || undefined
      });
      setMessage("Restore job started. Follow progress in the job stream.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start restore");
    }
  }

  return (
    <section className="recovery">
      <h2><LifeBuoy /> Disaster Recovery</h2>
      <div className="recovery-steps">
        <div><strong>1</strong><span>Start this dashboard on the new server with the same `/data` mount or restore its config backup.</span></div>
        <div><strong>2</strong><span>Mount the target app paths or folders, then verify the dashboard data directory is writable.</span></div>
        <div><strong>3</strong><span>Choose an app below and use Restore to recover the latest native snapshot into the configured restore directory.</span></div>
      </div>
      <div className="app-grid">
        {summaries.map((summary) => (
          <article className="app-card" key={summary.app.id}>
            <h3>{summary.app.name}</h3>
            <p>Latest proven snapshot: {summary.restoreProof?.snapshotId ?? "No restore proof yet"}</p>
            <p>Repository: {summary.repository?.location}</p>
          </article>
        ))}
      </div>
      <div className="snapshot-browser">
        <div className="section-title">
          <h2><ArchiveRestore /> Snapshot Browser</h2>
          <span>{snapshots.length} snapshot{snapshots.length === 1 ? "" : "s"}</span>
        </div>
        <div className="restore-controls">
          <select value={selectedApp?.app.id ?? ""} onChange={(event) => {
            setSelectedAppId(event.target.value);
            setSelectedSnapshotId("");
          }}>
            {summaries.map((summary) => <option key={summary.app.id} value={summary.app.id}>{summary.app.name}</option>)}
          </select>
          <select value={drScenario} onChange={(e) => setDrScenario(e.target.value)}>
            <option value="lost-server">Lost server</option>
            <option value="corrupted-disk">Corrupted disk</option>
            <option value="ransomware">Ransomware</option>
          </select>
          <input value={targetDir} onChange={(event) => setTargetDir(event.target.value)} placeholder="Optional restore destination" />
          <button className="primary" onClick={restoreSelected} disabled={!selectedSnapshotId}><ArchiveRestore /> Restore snapshot</button>
          <button onClick={runDr} disabled={!selectedSnapshotId}><LifeBuoy /> Run DR wizard</button>
        </div>
        {message && <div className="banner info">{message}</div>}
        <div className="snapshot-list">
          {snapshots.length === 0 ? (
            <div className="empty compact-empty">
              <ArchiveRestore />
              <h2>No snapshots yet</h2>
              <p>Run a backup first, then come back here to inspect and restore it.</p>
            </div>
          ) : snapshots.map((snapshot) => (
            <label className={selectedSnapshotId === snapshot.id ? "snapshot-row selected" : "snapshot-row"} key={snapshot.id}>
              <input type="radio" name="snapshot" checked={selectedSnapshotId === snapshot.id} onChange={() => setSelectedSnapshotId(snapshot.id)} />
              <div>
                <strong>{snapshot.id}</strong>
                <span>{time(snapshot.createdAt)} · {bytes(snapshot.sizeBytes)}</span>
                <small>{snapshot.sourcePaths.join(", ")}</small>
              </div>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function cronToCadence(cron: string) {
  if (cron === "0 * * * *") return "hourly";
  if (cron === "0 2 * * *") return "daily";
  if (cron === "0 4 * * 0") return "weekly";
  if (cron === "0 5 1 * *") return "monthly";
  return "custom";
}

function cadenceToCron(cadence: string, fallback: string) {
  if (cadence === "hourly") return "0 * * * *";
  if (cadence === "daily") return "0 2 * * *";
  if (cadence === "weekly") return "0 4 * * 0";
  if (cadence === "monthly") return "0 5 1 * *";
  return fallback;
}

function Schedule({ state, summaries, refresh }: { state: DashboardState; summaries: AppSummary[]; refresh: () => Promise<void> }) {
  const [policyId, setPolicyId] = useState(state.policies[0]?.id ?? "");
  const policy = state.policies.find((item) => item.id === policyId) ?? state.policies[0];
  const [message, setMessage] = useState("");

  async function save(form: FormData) {
    if (!policy) return;
    const backupCadence = String(form.get("backupCadence"));
    const proofCadence = String(form.get("proofCadence"));
    const nextPolicy: Policy = {
      ...policy,
      name: String(form.get("name")),
      backupCron: cadenceToCron(backupCadence, String(form.get("backupCron"))),
      restoreTestCron: cadenceToCron(proofCadence, String(form.get("restoreTestCron"))),
      proofFreshnessHours: Number(form.get("proofFreshnessHours")),
      retention: {
        keepDaily: Number(form.get("keepDaily")),
        keepWeekly: Number(form.get("keepWeekly")),
        keepMonthly: Number(form.get("keepMonthly"))
      }
    };
    try {
      await api.put(`/api/policies/${policy.id}`, nextPolicy);
      await refresh();
      setMessage("Schedule saved. Future timers were refreshed.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save schedule");
    }
  }

  if (!policy) {
    return <div className="empty"><CalendarClock /><h2>No policy yet</h2><p>Create an app first to use schedules.</p></div>;
  }

  return (
    <section className="schedule-layout">
      <form className="wizard compact" action={(form) => void save(form)}>
        <WizardSection icon={<CalendarClock />} title="Schedule policy">
          <select value={policy.id} onChange={(event) => setPolicyId(event.target.value)}>
            {state.policies.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
          <input name="name" defaultValue={policy.name} placeholder="Policy name" required />
          <select name="backupCadence" defaultValue={cronToCadence(policy.backupCron)}>
            <option value="hourly">Backup hourly</option>
            <option value="daily">Backup daily</option>
            <option value="weekly">Backup weekly</option>
            <option value="custom">Custom backup cron</option>
          </select>
          <input name="backupCron" defaultValue={policy.backupCron} placeholder="Backup cron" required />
          <select name="proofCadence" defaultValue={cronToCadence(policy.restoreTestCron)}>
            <option value="daily">Proof daily</option>
            <option value="weekly">Proof weekly</option>
            <option value="monthly">Proof monthly</option>
            <option value="custom">Custom proof cron</option>
          </select>
          <input name="restoreTestCron" defaultValue={policy.restoreTestCron} placeholder="Restore-test cron" required />
          <input name="proofFreshnessHours" type="number" min="1" max="720" defaultValue={policy.proofFreshnessHours} placeholder="Proof freshness hours" required />
          <input name="keepDaily" type="number" min="1" defaultValue={policy.retention.keepDaily} placeholder="Daily snapshots to keep" required />
          <input name="keepWeekly" type="number" min="0" defaultValue={policy.retention.keepWeekly} placeholder="Weekly snapshots to keep" required />
          <input name="keepMonthly" type="number" min="0" defaultValue={policy.retention.keepMonthly} placeholder="Monthly snapshots to keep" required />
        </WizardSection>
        <button className="primary"><CalendarClock /> Save schedule</button>
        {message && <div className="banner info">{message}</div>}
      </form>
      <aside className="schedule-side">
        <h2>Using This Policy</h2>
        {summaries.filter((summary) => summary.policy?.id === policy.id).map((summary) => (
          <div className="schedule-app" key={summary.app.id}>
            <strong>{summary.app.name}</strong>
            <span>{summary.snapshotCount} snapshot{summary.snapshotCount === 1 ? "" : "s"} · {summary.restorable ? "restorable" : "needs proof"}</span>
          </div>
        ))}
      </aside>
    </section>
  );
}

function Alerts({ state, summaries, refresh }: { state: DashboardState; summaries: AppSummary[]; refresh: () => Promise<void> }) {
  const activeAlerts = state.alerts.filter((alert) => !alert.acknowledgedAt);
  const resolvedAlerts = state.alerts.filter((alert) => alert.acknowledgedAt).slice(0, 8);

  async function acknowledge(alert: Alert) {
    await api.post(`/api/alerts/${alert.id}/acknowledge`);
    await refresh();
  }

  async function acknowledgeAll() {
    for (const alert of activeAlerts) {
      await api.post(`/api/alerts/${alert.id}/acknowledge`);
    }
    await refresh();
  }

  function appName(alert: Alert) {
    return summaries.find((summary) => summary.app.id === alert.appId)?.app.name ?? "System";
  }

  return (
    <section className="alerts-layout">
      <div className="section-title">
        <h2>Alert Center</h2>
        <button className="primary" disabled={activeAlerts.length === 0} onClick={acknowledgeAll}><CheckCircle2 /> Acknowledge all</button>
      </div>
      <div className="alert-list">
        {activeAlerts.length === 0 ? (
          <div className="empty compact-empty">
            <CheckCircle2 />
            <h2>No active alerts</h2>
            <p>Failed jobs, failed proofs, and stale proofs will appear here.</p>
          </div>
        ) : activeAlerts.map((alert) => (
          <article className={`alert-card ${alert.severity}`} key={alert.id}>
            <div>
              <strong>{alert.title}</strong>
              <span>{appName(alert)} · {time(alert.createdAt)} · {alert.severity}</span>
              <p>{alert.message}</p>
            </div>
            <button onClick={() => acknowledge(alert)}><CheckCircle2 /> Acknowledge</button>
          </article>
        ))}
      </div>
      {resolvedAlerts.length > 0 && (
        <>
          <div className="section-title resolved-title"><h2>Recently Acknowledged</h2></div>
          <div className="alert-list">
            {resolvedAlerts.map((alert) => (
              <article className="alert-card resolved" key={alert.id}>
                <div>
                  <strong>{alert.title}</strong>
                  <span>{appName(alert)} · acknowledged {time(alert.acknowledgedAt)}</span>
                  <p>{alert.message}</p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Notifications({ state, refresh }: { state: DashboardState; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [migrateMessage, setMigrateMessage] = useState("");
  const resticOk = state.environment.resticAvailable ?? false;
  const kopiaOk = state.environment.kopiaAvailable ?? false;

  async function submit(form: FormData) {
    try {
      await api.post("/api/notifications", {
        name: String(form.get("name")),
        type: form.get("type"),
        enabled: true,
        config: form.get("type") === "webhook" || form.get("type") === "slack" || form.get("type") === "discord"
          ? { url: String(form.get("url")) }
          : form.get("type") === "telegram"
            ? { token: String(form.get("token")), chatId: String(form.get("chatId")) }
            : form.get("type") === "pagerduty"
              ? { routingKey: String(form.get("routingKey")) }
              : {
              host: String(form.get("host")),
              port: String(form.get("port")),
              from: String(form.get("from")),
              to: String(form.get("to")),
              user: String(form.get("user")),
              pass: String(form.get("pass"))
            }
      });
      await refresh();
      setMessage("Notification target saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save notification target");
    }
  }

  async function migrate(engine: "restic" | "kopia", form: FormData) {
    setMigrateMessage("");
    try {
      await api.post(`/api/migrate/${engine}`, {
        name: String(form.get("name")),
        type: form.get("type"),
        location: String(form.get("location")),
        password: String(form.get("password")),
        credentials: form.get("type") === "s3" || form.get("type") === "b2" ? {
          accessKey: String(form.get("accessKey")),
          secretKey: String(form.get("secretKey")),
          region: String(form.get("region")) || undefined,
          endpoint: String(form.get("endpoint")) || undefined
        } : undefined
      });
      await refresh();
      setMigrateMessage(`${engine === "restic" ? "Restic" : "Kopia"} repository imported. Attach it to an app in Protect data.`);
    } catch (err) {
      setMigrateMessage(err instanceof Error ? err.message : "Migration failed");
    }
  }

  return (
    <section className="schedule-layout">
      <form className="wizard compact" action={(form) => void submit(form)}>
        <WizardSection icon={<Bell />} title="Alert target">
          <input name="name" placeholder="Target name" required />
          <select name="type" defaultValue="webhook">
            <option value="webhook">Webhook</option>
            <option value="email">Email</option>
            <option value="slack">Slack</option>
            <option value="discord">Discord</option>
            <option value="telegram">Telegram</option>
            <option value="pagerduty">PagerDuty</option>
          </select>
          <input name="url" placeholder="Webhook / Slack / Discord URL" />
          <input name="token" placeholder="Telegram bot token" />
          <input name="chatId" placeholder="Telegram chat id" />
          <input name="routingKey" placeholder="PagerDuty routing key" />
          <input name="host" placeholder="SMTP host" />
          <input name="port" placeholder="SMTP port" />
          <input name="from" placeholder="From email" />
          <input name="to" placeholder="To email" />
          <input name="user" placeholder="SMTP user" />
          <input name="pass" type="password" placeholder="SMTP password" />
        </WizardSection>
        <button className="primary"><Bell /> Save alerts</button>
        {message && <div className="banner">{message}</div>}
      </form>
      <aside className="schedule-side">
        <h2>External Engines</h2>
        <div className="schedule-app">
          <strong>{brand.engineLabel}</strong>
          <span>Always available — no install required</span>
        </div>
        <div className="schedule-app">
          <strong>Restic</strong>
          <span>{resticOk ? (state.environment.resticVersion ?? "Installed") : "Not installed"}</span>
          {!resticOk && <span className="muted">Set RESTIC_BINARY or install Restic to enable</span>}
        </div>
        <div className="schedule-app">
          <strong>Kopia</strong>
          <span>{kopiaOk ? (state.environment.kopiaVersion ?? "Installed") : "Not installed"}</span>
          {!kopiaOk && <span className="muted">Set KOPIA_BINARY or install Kopia to enable</span>}
        </div>

        {(resticOk || kopiaOk) && (
          <>
            <h2>Import Existing Repository</h2>
            <p className="muted">Connect an existing Restic or Kopia repo for migration. Snapshots are read from the existing vault — no re-upload.</p>
            {resticOk && (
              <form className="wizard compact" action={(form) => void migrate("restic", form)}>
                <input name="name" placeholder="Vault display name" required />
                <select name="type" defaultValue="local">
                  <option value="local">Local path</option>
                  <option value="sftp">SFTP</option>
                  <option value="s3">S3</option>
                  <option value="b2">Backblaze B2</option>
                </select>
                <input name="location" placeholder="Repo path or bucket/prefix" required />
                <input name="password" type="password" placeholder="Existing repo password" required />
                <input name="accessKey" placeholder="S3 access key (if cloud)" />
                <input name="secretKey" type="password" placeholder="S3 secret key (if cloud)" />
                <input name="region" placeholder="S3 region" />
                <input name="endpoint" placeholder="S3 endpoint (B2/custom)" />
                <button type="submit">Import Restic repo</button>
              </form>
            )}
            {kopiaOk && (
              <form className="wizard compact" action={(form) => void migrate("kopia", form)}>
                <input name="name" placeholder="Vault display name" required />
                <select name="type" defaultValue="local">
                  <option value="local">Local path</option>
                  <option value="sftp">SFTP</option>
                  <option value="s3">S3</option>
                  <option value="b2">Backblaze B2</option>
                </select>
                <input name="location" placeholder="Repo path or bucket/prefix" required />
                <input name="password" type="password" placeholder="Existing repo password" required />
                <input name="accessKey" placeholder="S3 access key (if cloud)" />
                <input name="secretKey" type="password" placeholder="S3 secret key (if cloud)" />
                <input name="region" placeholder="S3 region" />
                <input name="endpoint" placeholder="S3 endpoint (B2/custom)" />
                <button type="submit">Import Kopia repo</button>
              </form>
            )}
            {migrateMessage && <div className="banner info">{migrateMessage}</div>}
          </>
        )}

        {state.agents.length > 0 && (
          <>
            <h2>Fleet Agents</h2>
            {state.agents.map((agent) => (
              <div className="schedule-app" key={agent.id}>
                <strong>{agent.name}</strong>
                <span>{agent.hostname} · {agent.platform}</span>
                <span>Last seen: {agent.lastSeenAt ? time(agent.lastSeenAt) : "never"}</span>
              </div>
            ))}
          </>
        )}
        <h2>Delivery Targets</h2>
        {state.notificationTargets.length === 0 ? (
          <p className="muted">No notification targets yet.</p>
        ) : state.notificationTargets.map((target) => (
          <div className="schedule-app" key={target.id}>
            <strong>{target.name}</strong>
            <span>{target.type} · {target.enabled ? "enabled" : "disabled"}</span>
            <span>Last delivery: {target.lastDeliveryAt ? `${target.lastDeliveryStatus ?? "unknown"} at ${time(target.lastDeliveryAt)}` : "never"}</span>
          </div>
        ))}
      </aside>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
