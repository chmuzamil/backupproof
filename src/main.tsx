import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Activity,
  ArchiveRestore,
  Bell,
  CheckCircle2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Database,
  Download,
  Folder,
  FolderSearch,
  FileText,
  GitCompare,
  HardDrive,
  LifeBuoy,
  Play,
  Scissors,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  XCircle
} from "lucide-react";
import type { Alert, AppSummary, DashboardState, DiscoveredCmsApp, DiscoveredContainer, DiscoveredDatabase, DiscoveryResult, DrReportSummary, Job, JobType, Policy, RestoreDestinationTemplate, RestorePreflight, RestoreProof, SnapshotComparison, SnapshotContents, SnapshotSummary } from "../shared/types";
import { brand } from "../shared/brand";
import { readinessAdvice, readinessCounts, type ReadinessState } from "../shared/readiness";
import { buildRecoveryCoach, type CoachRoute, type RecoveryCoach } from "../shared/recoveryCoach";
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
  async getProofHistory(appId: string): Promise<RestoreProof[]> {
    return fetch(`/api/apps/${appId}/proof-history`).then((res) => res.json());
  },
  async getSnapshotContents(appId: string, snapshotId: string): Promise<SnapshotContents> {
    return fetch(`/api/apps/${appId}/snapshots/${snapshotId}/contents`).then((res) => res.json());
  },
  async compareSnapshot(appId: string, snapshotId: string): Promise<SnapshotComparison> {
    return fetch(`/api/apps/${appId}/snapshots/${snapshotId}/compare`).then((res) => res.json());
  },
  async getDrReports(appId: string): Promise<DrReportSummary[]> {
    return fetch(`/api/apps/${appId}/dr-reports`).then((res) => res.json());
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
  },
  async download(path: string) {
    const res = await fetch(path);
    if (!res.ok) throw new Error((await res.json()).error ?? "Download failed");
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") ?? "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const fileName = match?.[1] ?? "backupproof-export.tar.gz";
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async importPortable(file: File, targetDir?: string) {
    const res = await fetch("/api/portable/import", {
      method: "POST",
      headers: {
        "content-type": "application/gzip",
        ...(targetDir ? { "x-restore-target": targetDir } : {})
      },
      body: file
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Portable backup import failed");
    return res.json();
  },
  async downloadPost(path: string, body: unknown, fallbackName: string) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Download failed");
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") ?? "";
    const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? fallbackName;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async importRecoveryKit(file: File, passphrase: string) {
    const res = await fetch("/api/recovery-kit/import", {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-recovery-passphrase": passphrase },
      body: file
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Recovery kit import failed");
    return res.json();
  },
  async saveRestoreDestination(input: Pick<RestoreDestinationTemplate, "name" | "path" | "description" | "appId">) {
    return api.post("/api/restore-destinations", input);
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

const FLASH_DURATION_MS = 4500;

function useFlashMessage(durationMs = FLASH_DURATION_MS) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs]);
  return [message, setMessage] as const;
}

function FlashBanner({
  message,
  onDismiss,
  variant = "info"
}: {
  message: string;
  onDismiss: () => void;
  variant?: "info" | "danger" | "warning";
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
            <p className="topbar-sub">A green check means BackupProof restored your data and checked it.</p>
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

        {active === "dashboard" && <Dashboard state={state} summaries={summaries} jobs={latestJobs} refresh={refresh} goTo={setActive} />}
        {active === "protect" && <ProtectData state={state} refresh={refresh} />}
        {active === "recovery" && <Recovery state={state} summaries={summaries} refresh={refresh} goTo={setActive} />}
        {active === "schedule" && <Schedule state={state} summaries={summaries} refresh={refresh} />}
        {active === "alerts" && <Alerts state={state} summaries={summaries} refresh={refresh} />}
        {active === "settings" && <Notifications state={state} refresh={refresh} />}
      </main>
    </div>
  );
}

function EnvironmentPills({ state }: { state: DashboardState }) {
  const items = [
    ["Storage ready", state.environment.dataDirWritable],
    ["Built-in backups", true],
    ["Restic add-on", state.environment.resticAvailable ?? false],
    ["Kopia add-on", state.environment.kopiaAvailable ?? false]
  ] as const;
  return (
    <div className="pills">
      {items.map(([label, ok]) => (
        <span className={ok ? "pill ok" : "pill bad"} key={label} title={
          label === "Restic add-on" ? state.environment.resticVersion : label === "Kopia add-on" ? state.environment.kopiaVersion : undefined
        }>
          {ok ? <CheckCircle2 /> : <XCircle />}
          {label}
        </span>
      ))}
    </div>
  );
}

function Dashboard({
  state,
  summaries,
  jobs,
  refresh,
  goTo
}: {
  state: DashboardState;
  summaries: AppSummary[];
  jobs: Job[];
  refresh: () => Promise<void>;
  goTo: (route: CoachRoute) => void;
}) {
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoMessage, setDemoMessage] = useFlashMessage();
  const [filter, setFilter] = useState<"all" | "attention" | "proven">("all");
  const counts = readinessCounts(summaries);
  const orderedSummaries = [...summaries].sort((a, b) => {
    const order: Record<ReadinessState, number> = { blocked: 0, unprotected: 1, unproven: 2, "at-risk": 3, proven: 4 };
    return order[readinessAdvice(a).state] - order[readinessAdvice(b).state];
  });
  const visibleSummaries = orderedSummaries.filter((summary) => {
    const state = readinessAdvice(summary).state;
    if (filter === "proven") return state === "proven";
    if (filter === "attention") return state !== "proven";
    return true;
  });
  const hasProtectedData = summaries.length > 0;

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
    <section className="dashboard-layout">
      <div className="apps">
        <RecoveryCoachPanel coach={buildRecoveryCoach(state, summaries)} goTo={goTo} />
        <ReadinessOverview counts={counts} summaries={orderedSummaries} refresh={refresh} />
        {!hasProtectedData && <div className="demo-strip">
          <div>
            <strong>Try a safe demo</strong>
            <span>Watch {brand.name} save sample data, recover it, and check that it worked.</span>
          </div>
          <button onClick={runDemo} disabled={demoRunning}><Sparkles /> {demoRunning ? "Starting..." : "Run demo"}</button>
        </div>}
        <FlashBanner message={demoMessage} onDismiss={() => setDemoMessage("")} />
        <div className="section-title">
          <h2>What BackupProof Is Protecting</h2>
          <div className="filter-tabs" aria-label="Filter protected apps">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All {counts.total}</button>
            <button className={filter === "attention" ? "active" : ""} onClick={() => setFilter("attention")}>Needs help {counts.attention}</button>
            <button className={filter === "proven" ? "active" : ""} onClick={() => setFilter("proven")}>Ready {counts.proven}</button>
          </div>
        </div>
        {summaries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="app-grid">
            {visibleSummaries.map((summary) => <AppCard key={summary.app.id} summary={summary} refresh={refresh} />)}
          </div>
        )}
      </div>
      <JobLog jobs={jobs} refresh={refresh} />
    </section>
  );
}

function RecoveryCoachPanel({
  coach,
  goTo,
  compact = false
}: {
  coach: RecoveryCoach;
  goTo: (route: CoachRoute) => void;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "coach-panel compact" : "coach-panel"}>
      <div className="coach-head">
        <div>
          <span className="eyebrow"><ShieldCheck /> Recovery coach</span>
          <h2>{coach.headline}</h2>
          <p>{coach.summary}</p>
        </div>
        <div className="coach-score" aria-label={`${coach.score}% recovery plan complete`}>
          <strong>{coach.score}%</strong>
          <span>ready plan</span>
        </div>
      </div>
        {coach.nextTask && (
        <div className={`coach-next ${coach.nextTask.status}`}>
          <div>
            <span>Best next step</span>
            <strong>{coach.nextTask.title}</strong>
            <p>{coach.nextTask.description}</p>
          </div>
          <button type="button" onClick={() => goTo(coach.nextTask!.route)}>{coach.nextTask.actionLabel}</button>
        </div>
      )}
      <div className="coach-checklist">
        {coach.tasks.map((task) => {
          const isNextTask = coach.nextTask?.id === task.id;
          const content = (
            <>
            {task.status === "done" ? <CheckCircle2 /> : task.status === "warning" ? <AlertTriangle /> : <CircleIcon />}
            <span>
              <strong>{task.title}</strong>
              <small>{task.description}</small>
            </span>
            </>
          );
          return isNextTask ? (
            <button type="button" className={`coach-task ${task.status} actionable`} key={task.id} onClick={() => goTo(task.route)}>
              {content}
            </button>
          ) : (
            <div className={`coach-task ${task.status}`} key={task.id}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CircleIcon() {
  return <span className="circle-icon" aria-hidden="true" />;
}

function ReadinessOverview({
  counts,
  summaries,
  refresh
}: {
  counts: ReturnType<typeof readinessCounts>;
  summaries: AppSummary[];
  refresh: () => Promise<void>;
}) {
  const next = summaries.find((summary) => readinessAdvice(summary).state !== "proven");
  const advice = next ? readinessAdvice(next) : undefined;
  const [running, setRunning] = useState(false);

  async function runNext() {
    if (!next || !advice?.action) return;
    setRunning(true);
    try {
      await api.post(`/api/apps/${next.app.id}/jobs/${advice.action}`);
      await refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="readiness-overview">
      <div className="readiness-heading">
        <div>
          <span className="eyebrow"><Activity /> Recovery readiness</span>
          <h2>{counts.total === 0 ? "Protect your first app" : counts.attention === 0 ? "Your data is ready to recover" : `${counts.attention} item${counts.attention === 1 ? "" : "s"} need help`}</h2>
          <p>{counts.total === 0 ? "Choose important files or apps and make the first checked backup." : counts.attention === 0 ? "Every protected app has been restored and checked recently." : "Start with the item that needs the most attention."}</p>
        </div>
        {next && advice && (
          <div className={`next-action ${advice.state}`}>
            <span>Do this next</span>
            <strong>{next.app.name}: {advice.label}</strong>
            <p>{advice.message}</p>
            {advice.action && <button onClick={runNext} disabled={running}>{advice.action === "backup" ? <Play /> : <RotateCcw />}{running ? "Starting..." : advice.actionLabel}</button>}
          </div>
        )}
      </div>
      <div className="readiness-stats">
        <div><strong>{counts.total}</strong><span>Protected items</span></div>
        <div className="stat-good"><strong>{counts.proven}</strong><span>Ready to recover</span></div>
        <div className="stat-warning"><strong>{counts.attention}</strong><span>Need help</span></div>
        <div className="stat-bad"><strong>{counts.blocked}</strong><span>Blocked</span></div>
      </div>
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
  const [message, setMessage] = useFlashMessage();
  const advice = readinessAdvice(summary);
  const protectedSize = bytes(summary.safety.estimatedSourceBytes);
  const healthLabel = summary.restorable ? "Ready to recover" : summary.confidenceScore >= 60 ? "Needs a fresh check" : "Needs attention";
  const primaryAction = getPrimaryAppAction(summary, advice);

  async function run(type: JobType) {
    await api.post(`/api/apps/${summary.app.id}/jobs/${type}`);
    await refresh();
  }

  async function downloadLatest() {
    if (!summary.latestSnapshot) {
      setMessage("Run a backup first, then you can download a copy.");
      return;
    }
    setMessage("");
    try {
      await api.download(`/api/apps/${summary.app.id}/snapshots/${summary.latestSnapshot.id}/download`);
      setMessage("Backup copy downloaded. Keep it somewhere separate from this server.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not download backup copy");
    }
  }

  async function deleteSnapshots() {
    if (!window.confirm(`Delete all backups for "${summary.app.name}"? This cannot be undone.`)) return;
    setMessage("");
    try {
      await api.delete(`/api/apps/${summary.app.id}/snapshots`);
      await refresh();
      setMessage("All backups deleted.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not delete backups");
    }
  }

  async function removeApp() {
    if (!window.confirm(`Remove "${summary.app.name}" from the dashboard? Its backups and history will be deleted.`)) return;
    setMessage("");
    try {
      await api.delete(`/api/apps/${summary.app.id}`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove item");
    }
  }

  return (
    <article className="app-card">
      <div className="card-head">
        <div>
          <h3>{summary.app.name}</h3>
          <p>{summary.app.backupPaths.length} protected location{summary.app.backupPaths.length === 1 ? "" : "s"} · {protectedSize}</p>
        </div>
        <span className={summary.restorable ? "status good" : "status risk"}>
          {summary.restorable ? <CheckCircle2 /> : <AlertTriangle />}
          {summary.restorable ? "Can recover" : "Needs check"}
        </span>
      </div>
      <div className={`readiness-line ${advice.state}`}>
        <strong>{advice.label}</strong>
        <span>{advice.message}</span>
      </div>
      <div className="metrics">
        <div><span>Last saved</span><strong>{time(summary.latestBackup?.finishedAt)}</strong></div>
        <div><span>Last checked</span><strong>{time(summary.restoreProof?.testedAt)}</strong></div>
        <div><span>Recovery confidence</span><strong>{healthLabel}</strong></div>
      </div>
      <div className={summary.safety.safe ? "safety-strip safe" : "safety-strip unsafe"}>
        {summary.safety.safe ? <ShieldCheck /> : <AlertTriangle />}
        <div>
          <strong>{summary.safety.safe ? "Ready for the next backup" : "Backup needs attention first"}</strong>
          <span>
            {protectedSize} protected
            {summary.safety.freeBytes === undefined ? "" : ` · ${bytes(summary.safety.freeBytes)} available in backup storage`}
          </span>
          {(summary.safety.errors[0] || summary.safety.warnings[0]) && <small>{summary.safety.errors[0] ?? summary.safety.warnings[0]}</small>}
        </div>
      </div>
      <p className="friendly-summary">
        {summary.restorable ? "BackupProof has already restored this data successfully. You can recover it when needed." : "Run a recovery check so BackupProof can prove this backup works."}
      </p>
      <details className="advanced-details">
        <summary>Technical details</summary>
      <SnapshotTrend history={summary.snapshotHistory} />
      <div className="snapshot-line">Latest backup point: {summary.latestSnapshot?.id ?? "None yet"}</div>
      <div className="snapshot-line">Backup storage: {summary.repository?.name ?? "Not configured"} · {summary.app.recipeType}</div>
      <div className="checks">
        {summary.app.healthChecks.length === 0 ? <span>No recovery checks configured</span> : summary.app.healthChecks.map((check) => <span key={check.id}>{check.type}: {check.target}</span>)}
      </div>
      </details>
      {summary.alerts.length > 0 && <div className="inline-alert">{summary.alerts[0].title}</div>}
      <div className="actions simplified-actions">
        <button
          className="primary-card-action"
          onClick={() => run(primaryAction.type)}
          disabled={primaryAction.type === "backup" && !summary.safety.safe}
          title={primaryAction.type === "backup" && !summary.safety.safe ? summary.safety.errors.join(" ") : primaryAction.label}
        >
          <primaryAction.Icon /> {primaryAction.label}
        </button>
        <details className="more-actions">
          <summary>More actions</summary>
          <div className="more-actions-menu">
            {primaryAction.type !== "backup" && (
              <button onClick={() => run("backup")} disabled={!summary.safety.safe} title={summary.safety.safe ? "Back up now" : summary.safety.errors.join(" ")}><Play /> Back up now</button>
            )}
            {primaryAction.type !== "restore-test" && <button onClick={() => run("restore-test")}><RotateCcw /> Check recovery</button>}
            {primaryAction.type !== "manual-restore" && <button onClick={() => run("manual-restore")}><LifeBuoy /> Recover files</button>}
            <button onClick={downloadLatest} disabled={!summary.latestSnapshot}><Download /> Download a copy</button>
            <button onClick={() => run("prune")}><Scissors /> Clean old backups</button>
          </div>
        </details>
      </div>
      <details className="advanced-details danger-details">
        <summary>Remove or delete</summary>
        <div className="danger-actions">
          <button type="button" className="danger" onClick={deleteSnapshots}><Trash2 /> Delete backups</button>
          <button type="button" className="danger" onClick={removeApp}><Trash2 /> Remove from dashboard</button>
        </div>
      </details>
      <FlashBanner message={message} onDismiss={() => setMessage("")} />
    </article>
  );
}

function SnapshotTrend({ history }: { history: AppSummary["snapshotHistory"] }) {
  if (history.length === 0) return null;
  const max = Math.max(...history.map((snapshot) => snapshot.sizeBytes), 1);
  return (
    <div className="snapshot-trend" title="Stored bytes added by recent snapshots">
      <div className="trend-label"><span>Backup history</span><strong>{history.length} recent</strong></div>
      <div className="trend-bars">
        {history.map((snapshot) => (
          <span
            key={snapshot.id}
            style={{ height: `${Math.max(8, (snapshot.sizeBytes / max) * 100)}%` }}
            title={`${time(snapshot.createdAt)} · ${bytes(snapshot.sizeBytes)}`}
          />
        ))}
      </div>
    </div>
  );
}

function getPrimaryAppAction(summary: AppSummary, advice: ReturnType<typeof readinessAdvice>): { type: JobType; label: string; Icon: typeof Play } {
  if (!summary.safety.safe || advice.state === "blocked") {
    return { type: "backup", label: "Fix this first", Icon: AlertTriangle };
  }
  if (summary.snapshotCount === 0) {
    return { type: "backup", label: "Run first backup", Icon: Play };
  }
  if (!summary.restoreProof || summary.restoreProof.status !== "passed" || !summary.restorable) {
    return { type: "restore-test", label: "Check recovery", Icon: RotateCcw };
  }
  return { type: "manual-restore", label: "Recover files", Icon: LifeBuoy };
}

function friendlyJobType(type: JobType) {
  return {
    backup: "Backup saved",
    check: "Storage checked",
    prune: "Old backups cleaned",
    "restore-test": "Recovery checked",
    "manual-restore": "Files recovered",
    "dr-run": "Recovery practice"
  }[type];
}

function friendlyJobStatus(status: Job["status"]) {
  return {
    queued: "Waiting",
    running: "Running",
    succeeded: "Done",
    failed: "Needs attention"
  }[status];
}

function JobLog({ jobs, refresh }: { jobs: Job[]; refresh: () => Promise<void> }) {
  const [message, setMessage] = useFlashMessage();

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
    <section className="job-log">
      <div className="section-title">
        <div>
          <h2><Activity /> Activity log</h2>
          <p>Recent backup, recovery check, restore, and maintenance activity.</p>
        </div>
        <button type="button" className="ghost-button" onClick={clearLogs}><Trash2 /> Clear logs</button>
      </div>
      <FlashBanner message={message} onDismiss={() => setMessage("")} />
      {jobs.length === 0 ? (
        <p className="muted">No jobs yet.</p>
      ) : jobs.map((job) => (
        <details key={job.id} className={`job ${job.status}`}>
          <summary>
            <div className="job-summary-main">
              <span className={`job-dot ${job.status}`} />
              <strong>{friendlyJobType(job.type)}</strong>
              <span>{time(job.startedAt)}</span>
            </div>
            <div className="job-summary-status">
              <span>{job.logs.length} log line{job.logs.length === 1 ? "" : "s"}</span>
              <strong>{friendlyJobStatus(job.status)}</strong>
            </div>
          </summary>
          <div className="job-meta">{time(job.startedAt)} · exit {job.exitCode ?? "pending"}</div>
          <pre>{job.logs.map((log) => `[${new Date(log.at).toLocaleTimeString()}] ${log.line}`).join("\n") || "Waiting for output..."}</pre>
        </details>
      ))}
    </section>
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
type WizardVault = "local" | "sftp" | "s3" | "b2" | "google-drive";
type WizardEngine = "frd" | "restic" | "kopia";

const PROTECT_STEPS = ["Choose data", "Save copies", "Recovery check", "Finish"];

function friendlyRecipeName(recipe: WizardRecipe) {
  return {
    "compose-files": "Files and folders",
    "docker-compose": "Self-hosted app",
    postgres: "PostgreSQL database",
    mysql: "MySQL or MariaDB database"
  }[recipe];
}

function friendlyStorageName(type: WizardVault) {
  return {
    local: "This computer or an attached drive",
    sftp: "Another server",
    s3: "S3-compatible cloud storage",
    b2: "Backblaze B2",
    "google-drive": "Google Drive"
  }[type];
}

function ProtectData({ state, refresh }: { state: DashboardState; refresh: () => Promise<void> }) {
  const defaultPolicy = state.policies[0];
  const resticOk = state.environment.resticAvailable ?? false;
  const kopiaOk = state.environment.kopiaAvailable ?? false;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [message, setMessage] = useFlashMessage();
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
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleConnectionId, setGoogleConnectionId] = useState("");
  const [googleRedirectUri, setGoogleRedirectUri] = useState(() => `${window.location.origin}/api/google-drive/oauth/callback`);
  const [googleConnecting, setGoogleConnecting] = useState(false);

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
    local: "Choose a folder that is not inside the data you are protecting.",
    sftp: "Folder on the other server, for example /backups/my-family-photos.",
    s3: "Bucket and optional folder, for example my-bucket/backups.",
    b2: "Bucket and optional folder in Backblaze B2.",
    "google-drive": "Folder name in Google Drive, for example BackupProof/My server."
  }[repoType];

  useEffect(() => {
    function receiveGoogleConnection(event: MessageEvent) {
      if (event.data?.type !== "backupproof-google-drive" || typeof event.data.connectionId !== "string") return;
      setGoogleConnectionId(event.data.connectionId);
      setGoogleConnecting(false);
      setMessage("Google Drive connected. Continue to create the backup storage.");
    }
    window.addEventListener("message", receiveGoogleConnection);
    return () => window.removeEventListener("message", receiveGoogleConnection);
  }, []);

  async function connectGoogleDrive() {
    if (!googleClientId.trim() || !googleClientSecret.trim()) {
      setMessage("Add the Google OAuth client ID and client secret first.");
      return;
    }
    setGoogleConnecting(true);
    try {
      const result = await api.post("/api/google-drive/oauth/start", {
        clientId: googleClientId.trim(),
        clientSecret: googleClientSecret.trim()
      });
      setGoogleRedirectUri(result.redirectUri);
      const popup = window.open(result.authorizationUrl, "backupproof-google-drive", "popup,width=560,height=720");
      if (!popup) throw new Error("Allow popups to connect Google Drive.");
    } catch (err) {
      setGoogleConnecting(false);
      setMessage(err instanceof Error ? err.message : "Could not start Google Drive connection");
    }
  }

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

  function cmsLabel(type: DiscoveredCmsApp["type"]) {
    return {
      wordpress: "WordPress",
      drupal: "Drupal",
      joomla: "Joomla",
      ghost: "Ghost",
      nextcloud: "Nextcloud"
    }[type];
  }

  function applyCmsApp(cms: DiscoveredCmsApp) {
    const paths = cms.backupPaths.length > 0 ? cms.backupPaths : [cms.rootPath, cms.contentPath].filter(Boolean) as string[];
    const databaseEngine = cms.database?.engine === "postgres" ? "postgres" : cms.database ? "mysql" : undefined;
    const suggestedName = cms.name.replace(/\s*\([^)]*\)\s*$/, "") || cmsLabel(cms.type);
    const slug = suggestedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cms-site";

    setPathMode("manual");
    setRecipeType(databaseEngine ?? (cms.composeFile ? "docker-compose" : "compose-files"));
    setAppName(suggestedName);
    if (cms.composeFile) setComposePath(cms.composeFile);
    if (cms.composeProject) setProjectName(cms.composeProject);
    setBackupPaths(mergePaths(paths));
    if (cms.database) {
      setDbHost(cms.database.host ?? "127.0.0.1");
      setDbPort(String(cms.database.port ?? (cms.database.engine === "postgres" ? 5432 : 3306)));
      setDbName(cms.database.database ?? "");
      setDbUser(cms.database.username ?? "");
      setDumpPath(`.data/dumps/${slug}.sql`);
    }
    const proofTarget = cms.contentPath ?? cms.rootPath ?? paths[0] ?? "";
    if (proofTarget) {
      setHealthType("file");
      setHealthTarget(proofTarget);
    }
    setMessage(
      cms.database
        ? `${cmsLabel(cms.type)} added. Site files and database details are filled in; add the database password if needed.`
        : `${cmsLabel(cms.type)} added. Site files are filled in; add database details if this site uses one.`
    );
  }

  function applyContainer(container: DiscoveredContainer) {
    setPathMode("manual");
    setRecipeType("docker-compose");
    setAppName((current) => current || container.composeProject || container.name);
    if (container.composeFile) setComposePath(container.composeFile);
    if (container.composeProject) setProjectName(container.composeProject);
    setBackupPaths(mergePaths(container.suggestedPaths));
    setMessage(`Added ${container.name}. Review what will be protected below.`);
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
    setMessage(`Added ${database.name}. Add the database password if required.`);
  }

  function stepError(): string | undefined {
    if (step === 0) {
      if (!appName.trim()) return "Give this backup a simple name.";
      if (pathMode === "scan" && selectedPaths.length === 0 && parsePaths(backupPaths).length === 0) {
        return "Choose at least one folder, or switch to advanced setup.";
      }
      if (parsePaths(backupPaths).length === 0) return "Choose at least one folder or file to protect.";
      if (pathMode === "manual" && recipeType === "docker-compose" && !composePath.trim()) {
        return "Add the setup file for this self-hosted app.";
      }
      if (pathMode === "manual" && (recipeType === "postgres" || recipeType === "mysql") && (!dbName.trim() || !dbUser.trim())) {
        return "Add the database name and user.";
      }
    }
    if (step === 1) {
      if (!repoName.trim()) return "Name this backup storage.";
      if (!repoLocation.trim()) return "Choose where backup copies should be stored.";
      if ((engine === "restic" || engine === "kopia") && repoPassword.length < 8) {
        return "This storage engine needs a password of at least 8 characters.";
      }
      if (repoType === "sftp" && (!sftpHost.trim() || !sftpUsername.trim())) return "Add the server address and username.";
      if ((repoType === "s3" || repoType === "b2") && (!s3AccessKey.trim() || !s3SecretKey.trim())) {
        return "Add the cloud access key and secret key.";
      }
      if (repoType === "google-drive" && !googleConnectionId) return "Connect Google Drive before continuing.";
    }
    if (step === 2 && !healthTarget.trim()) {
      return "Choose one simple thing BackupProof should check after recovery.";
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
        } : undefined,
        googleConnectionId: repoType === "google-drive" ? googleConnectionId : undefined
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
      setMessage("Success! Go to Dashboard, run the first backup, then check recovery to earn the green check.");
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
        <p>Choose the data that matters, where backup copies should live, and how BackupProof will check that recovery works.</p>
      </div>

      <div className="wizard-steps">
        {PROTECT_STEPS.map((label, index) => (
          <div className={`wizard-step ${index === step ? "active" : ""} ${index < step ? "done" : ""}`} key={label}>
            <span className="wizard-step-num">{index < step ? "✓" : index + 1}</span>
            <span className="wizard-step-label">{label}</span>
          </div>
        ))}
      </div>

      <FlashBanner
        message={message}
        onDismiss={() => setMessage("")}
        variant={message.startsWith("Success") ? "info" : "danger"}
      />

      {step === 0 && (
        <div className="wizard-panel">
          <h3>What should BackupProof protect?</h3>
          <p className="wizard-lead">Start with familiar folders like Documents and Pictures. Advanced users can add app folders or databases too.</p>

          <div className="protect-helper-grid">
            <div><Folder /><strong>Personal files</strong><span>Photos, documents, projects, downloads, and desktop files.</span></div>
            <div><Server /><strong>Self-hosted apps</strong><span>App folders, uploads, settings, and compose projects.</span></div>
            <div><Database /><strong>Databases</strong><span>PostgreSQL, MySQL, and MariaDB data that needs a clean export.</span></div>
          </div>

          <WizardField label="Name" hint="Something you will recognize on the dashboard">
            <input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="e.g. Family photos, Nextcloud, Shop database" />
          </WizardField>

          <div className="wizard-field full">
            <span className="wizard-label">How do you want to choose?</span>
            <div className="choice-row">
              <button type="button" className={`choice-chip ${pathMode === "scan" ? "selected" : ""}`} onClick={() => switchPathMode("scan")}>
                <FolderSearch /> Help me choose
              </button>
              <button type="button" className={`choice-chip ${pathMode === "manual" ? "selected" : ""}`} onClick={() => switchPathMode("manual")}>
                <Folder /> Advanced setup
              </button>
            </div>
          </div>

          {pathMode === "scan" ? (
            <>
              <div className="section-title compact-title">
                <span>{scanning ? "Looking for important folders..." : `${selectedPaths.length} folder${selectedPaths.length === 1 ? "" : "s"} selected`}</span>
                <button type="button" onClick={scan} disabled={scanning}><Sparkles /> {scanning ? "Looking..." : "Look again"}</button>
              </div>
              {discovery?.warnings.map((warning) => <div className="banner warning" key={warning}>{warning}</div>)}
              {!discovery && scanning ? (
                <div className="empty compact-empty">
                  <FolderSearch />
                  <h2>Looking for important folders</h2>
                  <p>Checking common places like Documents, Pictures, Desktop, and app data.</p>
                </div>
              ) : discovery ? (
                <>
                  <div className="discover-summary">
                    <div><span>This device</span><strong>{discovery.host.platform}</strong></div>
                    <div><span>Your home folder</span><strong>{discovery.host.homeDir}</strong></div>
                    <div><span>Choices found</span><strong>{discovery.paths.length}</strong></div>
                    <div><span>Websites found</span><strong>{(discovery.cmsApps ?? []).length}</strong></div>
                  </div>
                  {(discovery.cmsApps ?? []).length > 0 && (
                    <div className="wizard-subpanel">
                      <h4><Server /> Websites found</h4>
                      {(discovery.cmsApps ?? []).map((cms) => (
                        <div className="cms-found-row" key={cms.id}>
                          <div>
                            <strong>{cms.name}</strong>
                            <span>{cmsLabel(cms.type)} - {cms.database ? "site files and database" : "site files found"}</span>
                            <small>{cms.backupPaths.join(", ") || cms.rootPath}</small>
                          </div>
                          <button type="button" className="infra-use" onClick={() => applyCmsApp(cms)}>
                            Protect this website
                          </button>
                        </div>
                      ))}
                      <p className="muted">This fills in the full website folder and any database details BackupProof can safely detect.</p>
                    </div>
                  )}
                  <div className="path-picker">
                    {discovery.paths.length === 0 ? (
                      <div className="empty compact-empty">
                        <HardDrive />
                        <h2>No common folders found</h2>
                        <p>Switch to <strong>Advanced setup</strong> and type the folders you want protected.</p>
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
                    <details className="wizard-subpanel service-accordion">
                      <summary>
                        <span><Server /> Running services found</span>
                        <small>{discovery.services.length} item{discovery.services.length === 1 ? "" : "s"} - click to show</small>
                      </summary>
                      <div className="service-accordion-body">
                        {discovery.services.map((service) => (
                          <div className="service-row" key={`${service.name}-${service.displayName ?? ""}`}>
                            <strong>{service.displayName ?? service.name}</strong>
                            <span>{service.name}</span>
                            <p>{service.hint}</p>
                          </div>
                        ))}
                        <p className="muted">To protect a self-hosted app or database, use Advanced setup.</p>
                      </div>
                    </details>
                  )}
                </>
              ) : null}
            </>
          ) : (
            <>
              <div className="wizard-subpanel infra-panel">
                <div className="section-title compact-title">
                  <h4><Server /> Apps and databases found</h4>
                  <button type="button" onClick={scan} disabled={scanning}><Sparkles /> {scanning ? "Looking..." : "Look again"}</button>
                </div>
                {discovery?.warnings.map((warning) => <div className="banner warning" key={warning}>{warning}</div>)}
                {!discovery && scanning ? (
                  <p className="muted">Looking for self-hosted apps and databases...</p>
                ) : discovery ? (
                  <>
                    <div className="discover-summary">
                      <div><span>Websites / CMS</span><strong>{(discovery.cmsApps ?? []).length}</strong></div>
                      <div><span>Self-hosted apps</span><strong>{discovery.dockerAvailable ? discovery.containers.length : "Not available"}</strong></div>
                      <div><span>Databases</span><strong>{discovery.databases.length}</strong></div>
                      <div><span>Other services</span><strong>{discovery.services.length}</strong></div>
                    </div>

                    {(discovery.cmsApps ?? []).length > 0 && (
                      <div className="infra-section">
                        <span className="wizard-label">Websites and CMS apps</span>
                        <div className="infra-list">
                          {(discovery.cmsApps ?? []).map((cms) => (
                            <div className="infra-card cms-card" key={cms.id}>
                              <div>
                                <strong>{cms.name}</strong>
                                <span>{cmsLabel(cms.type)} - {cms.source === "docker" ? "running now" : "installed files found"}</span>
                                {cms.backupPaths.length > 0 && <small>Site files: {cms.backupPaths.join(", ")}</small>}
                                {cms.database ? (
                                  <small>
                                    Database: {cms.database.engine.toUpperCase()}
                                    {cms.database.database ? ` - ${cms.database.database}` : ""}
                                    {cms.database.host ? ` on ${cms.database.host}:${cms.database.port ?? ""}` : ""}
                                  </small>
                                ) : (
                                  <small>No database settings were safely detected. You can add them below if this site uses a database.</small>
                                )}
                                <small>{cms.hint}</small>
                              </div>
                              <button type="button" className="infra-use" onClick={() => applyCmsApp(cms)}>
                                Protect site and database
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {discovery.containers.length > 0 && (
                      <div className="infra-section">
                        <span className="wizard-label">Self-hosted apps</span>
                        <div className="infra-list">
                          {discovery.containers.map((container) => (
                            <div className="infra-card" key={container.id}>
                              <div>
                                <strong>{container.name}</strong>
                                <span>{container.image} · {container.status}</span>
                                {container.composeProject && <span>Project: {container.composeProject}</span>}
                                {container.suggestedPaths.length > 0 ? (
                                  <small>{container.suggestedPaths.join(", ")}</small>
                                ) : (
                                  <small>No easy folder was found for this app. You may need to add its data folder yourself.</small>
                                )}
                                {container.mounts.length > 0 && (
                                  <details className="mini-details">
                                    <summary>Technical details</summary>
                                    <small>{container.mounts.map((mount) => `${mount.source || mount.type} -> ${mount.destination}`).join(" | ")}</small>
                                  </details>
                                )}
                              </div>
                              <button type="button" className="infra-use" onClick={() => applyContainer(container)}>
                                Use this app
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {discovery.databases.length > 0 && (
                      <div className="infra-section">
                        <span className="wizard-label">Databases</span>
                        <div className="infra-list">
                          {discovery.databases.map((database) => (
                            <div className="infra-card" key={database.id}>
                              <div>
                                <strong>{database.name}</strong>
                                <span>{database.engine.toUpperCase()} - {database.source === "docker" ? "self-hosted app" : "this machine"} - {database.host}:{database.port}</span>
                                {database.databases.length > 0 && (
                                  <small>Databases: {database.databases.join(", ")}</small>
                                )}
                                {database.dataPath && <small>Data folder: {database.dataPath}</small>}
                                <small>{database.hint}</small>
                              </div>
                              <button type="button" className="infra-use" onClick={() => applyDatabase(database)}>
                                Use this database
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {discovery.containers.length === 0 && discovery.databases.length === 0 && (discovery.cmsApps ?? []).length === 0 && (
                      <p className="muted">
                        {discovery.dockerAvailable
                          ? "No self-hosted apps or databases were found. Add folders below."
                          : "No self-hosted app system is available here. You can still protect normal folders below."}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="muted">Detection has not run yet.</p>
                )}
              </div>

              <div className="wizard-field full">
                <span className="wizard-label">What kind of data is this?</span>
                <div className="choice-grid">
                  {([
                    ["compose-files", Folder, "Files and folders", "Best for most people"],
                    ["docker-compose", Server, "Self-hosted app", "For Docker Compose apps"],
                    ["postgres", Database, "PostgreSQL database", "Creates a clean database copy"],
                    ["mysql", Database, "MySQL / MariaDB", "Creates a clean database copy"]
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
                label="Folders or files to protect"
                hint="One per line. These must exist on this machine."
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
                <WizardField label="App setup file" hint="Full path to compose.yml or docker-compose.yml">
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
                  <WizardField label="Temporary export file" hint="Optional"><input value={dumpPath} onChange={(e) => setDumpPath(e.target.value)} placeholder=".data/dumps/mydb.sql" /></WizardField>
                </div>
              )}

              <button type="button" className="wizard-link" onClick={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? "Hide" : "Show"} advanced options
              </button>
              {showAdvanced && (
                <div className="form-grid">
                  <WizardField label="Compose file" hint="Optional"><input value={composePath} onChange={(e) => setComposePath(e.target.value)} /></WizardField>
                  <WizardField label="Project name" hint="Optional"><input value={projectName} onChange={(e) => setProjectName(e.target.value)} /></WizardField>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="wizard-panel">
          <h3>Where should backup copies live?</h3>
          <p className="wizard-lead">Start with a local folder or attached drive. Add cloud or another server when you want protection from a broken machine.</p>

          <div className="protect-tip">
            <ShieldCheck />
            <div>
              <strong>Simple recommendation</strong>
              <span>Use built-in backups and store copies outside the folder you are protecting. A second place, like Google Drive or another server, is even safer.</span>
            </div>
          </div>

          <div className="wizard-field full">
            <span className="wizard-label">How should BackupProof save copies?</span>
            <div className="choice-grid engines">
              <button type="button" className={`choice-card ${engine === "frd" ? "selected" : ""}`} onClick={() => setEngine("frd")}>
                <ShieldCheck />
                <strong>Built-in backups</strong>
                <span>Recommended for most people</span>
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

          <WizardField label="Storage name" hint="A friendly label shown on the dashboard">
            <input value={repoName} onChange={(e) => setRepoName(e.target.value)} />
          </WizardField>

          <div className="wizard-field full">
            <span className="wizard-label">Where should copies go?</span>
            <div className="choice-row">
              {([
                ["local", HardDrive, "This computer / drive"],
                ["sftp", Server, "Another server"],
                ["s3", Cloud, "S3 cloud storage"],
                ["b2", Cloud, "Backblaze B2"],
                ["google-drive", Cloud, "Google Drive"]
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

          <WizardField label="Folder or storage location" hint={locationHint} full>
            <input value={repoLocation} onChange={(e) => setRepoLocation(e.target.value)} />
          </WizardField>

          <WizardField
            label="Backup password"
            hint={engine === "frd" ? "Recommended. It encrypts your backup copies." : "Required. Use at least 8 characters."}
          >
            <input type="password" value={repoPassword} onChange={(e) => setRepoPassword(e.target.value)} placeholder="Choose a strong passphrase" />
          </WizardField>

          {repoType === "sftp" && (
            <div className="wizard-subpanel">
              <h4>Other server connection</h4>
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
              <h4>Cloud sign-in details</h4>
              <div className="form-grid">
                <WizardField label="Access key"><input value={s3AccessKey} onChange={(e) => setS3AccessKey(e.target.value)} /></WizardField>
                <WizardField label="Secret key"><input type="password" value={s3SecretKey} onChange={(e) => setS3SecretKey(e.target.value)} /></WizardField>
                <WizardField label="Region" hint="e.g. us-east-1"><input value={s3Region} onChange={(e) => setS3Region(e.target.value)} /></WizardField>
                <WizardField label="Endpoint" hint="Required for B2 / MinIO"><input value={s3Endpoint} onChange={(e) => setS3Endpoint(e.target.value)} placeholder="https://s3.us-west-000.backblazeb2.com" /></WizardField>
              </div>
            </div>
          )}

          {repoType === "google-drive" && (
            <div className="wizard-subpanel">
              <h4>Google Drive connection</h4>
              <p className="muted">Connect a Google Drive folder. Advanced setup may require a Google Cloud OAuth client.</p>
              <div className="form-grid">
                <WizardField label="OAuth client ID"><input value={googleClientId} onChange={(e) => setGoogleClientId(e.target.value)} /></WizardField>
                <WizardField label="OAuth client secret"><input type="password" value={googleClientSecret} onChange={(e) => setGoogleClientSecret(e.target.value)} /></WizardField>
              </div>
              {googleRedirectUri && <div className="oauth-redirect"><span>Authorized redirect URL</span><code>{googleRedirectUri}</code></div>}
              <button type="button" className={googleConnectionId ? "google-connect connected" : "google-connect"} onClick={connectGoogleDrive} disabled={googleConnecting}>
                <Cloud /> {googleConnectionId ? "Google Drive connected" : googleConnecting ? "Waiting for Google..." : "Connect Google Drive"}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="wizard-panel">
          <h3>How should BackupProof check recovery?</h3>
          <p className="wizard-lead">
            After a backup, BackupProof restores a safe copy and checks one thing you care about.
            When that works, the dashboard can show the green recovery check.
          </p>

          <div className="wizard-callout">
            <CheckCircle2 />
            <div>
              <strong>Pick a simple proof</strong>
              <span>For files, choose a folder that should exist after recovery. For apps, choose a health page or important file.</span>
            </div>
          </div>

          <div className="choice-row">
            <button type="button" className={`choice-chip ${healthType === "file" ? "selected" : ""}`} onClick={() => setHealthType("file")}>
              <Folder /> A file or folder comes back
            </button>
            <button type="button" className={`choice-chip ${healthType === "http" ? "selected" : ""}`} onClick={() => setHealthType("http")}>
              <Server /> An app page opens
            </button>
          </div>

          <WizardField
            label={healthType === "file" ? "What should exist after recovery?" : "Which app page should open?"}
            hint={healthType === "file" ? "A protected folder is a good default." : "Use a page that returns a normal successful response."}
            full
          >
            <input
              value={healthTarget}
              onChange={(e) => setHealthTarget(e.target.value)}
              placeholder={healthType === "file" ? parsePaths(backupPaths)[0] ?? "C:\\path\\to\\important-file.txt" : "http://localhost:8080/health"}
            />
          </WizardField>

          <WizardField label="Text BackupProof should look for" hint="Optional. Leave blank to only check that it exists.">
            <input value={healthExpected} onChange={(e) => setHealthExpected(e.target.value)} placeholder="e.g. status: ok" />
          </WizardField>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-panel">
          <h3>Ready to protect this data?</h3>
          <p className="wizard-lead">Review the plain-language summary. You can change anything before starting.</p>

          <div className="friendly-review">
            <div><span>Name</span><strong>{appName || "-"}</strong></div>
            <div><span>Data type</span><strong>{friendlyRecipeName(recipeType)}</strong></div>
            <div><span>Protecting</span><strong>{parsePaths(backupPaths).length} item{parsePaths(backupPaths).length === 1 ? "" : "s"}</strong></div>
            <div><span>Backup method</span><strong>{engine === "frd" ? "Built-in backups" : engine.toUpperCase()}</strong></div>
            <div><span>Copies stored in</span><strong>{friendlyStorageName(repoType)}</strong></div>
            <div><span>Recovery check</span><strong>{healthType === "file" ? "File or folder exists" : "App page opens"}</strong></div>
          </div>

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

function Recovery({
  state,
  summaries,
  refresh,
  goTo
}: {
  state: DashboardState;
  summaries: AppSummary[];
  refresh: () => Promise<void>;
  goTo: (route: CoachRoute) => void;
}) {
  const [selectedAppId, setSelectedAppId] = useState("");
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [proofHistory, setProofHistory] = useState<RestoreProof[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [snapshotSearch, setSnapshotSearch] = useState("");
  const [snapshotContents, setSnapshotContents] = useState<SnapshotContents>();
  const [snapshotComparison, setSnapshotComparison] = useState<SnapshotComparison>();
  const [fileSearch, setFileSearch] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [targetDir, setTargetDir] = useState("");
  const [preflight, setPreflight] = useState<RestorePreflight>();
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [message, setMessage] = useFlashMessage();
  const [drScenario, setDrScenario] = useState("lost-server");
  const [downloading, setDownloading] = useState(false);
  const [portableFile, setPortableFile] = useState<File>();
  const [portableTarget, setPortableTarget] = useState("");
  const [importingPortable, setImportingPortable] = useState(false);
  const [kitPassphrase, setKitPassphrase] = useState("");
  const [kitFile, setKitFile] = useState<File>();
  const [kitBusy, setKitBusy] = useState(false);
  const [reports, setReports] = useState<DrReportSummary[]>([]);
  const [templateName, setTemplateName] = useState("Temporary restore folder");
  const [templateDescription, setTemplateDescription] = useState("");
  const selectedApp = summaries.find((summary) => summary.app.id === selectedAppId) ?? summaries[0];
  const destinationTemplates = (state.restoreDestinationTemplates ?? []).filter((template) => !template.appId || template.appId === selectedApp?.app.id);

  useEffect(() => {
    if (!selectedAppId && summaries[0]) {
      setSelectedAppId(summaries[0].app.id);
    }
  }, [selectedAppId, summaries]);

  useEffect(() => {
    if (!selectedApp?.app.id) {
      setSnapshots([]);
      setProofHistory([]);
      setSelectedSnapshotId("");
      return;
    }
    void Promise.all([api.getSnapshots(selectedApp.app.id), api.getProofHistory(selectedApp.app.id)]).then(([items, proofs]) => {
      setSnapshots(items);
      setProofHistory(proofs);
      const currentProof = proofs.find((proof) => proof.status === "passed" && new Date(proof.expiresAt).getTime() > Date.now() && items.some((item) => item.id === proof.snapshotId));
      setSelectedSnapshotId((current) => current || currentProof?.snapshotId || items[0]?.id || "");
    });
  }, [selectedApp?.app.id]);

  useEffect(() => {
    setPreflight(undefined);
  }, [selectedApp?.app.id, selectedSnapshotId, targetDir, selectedPaths]);

  useEffect(() => {
    setSnapshotContents(undefined);
    setSnapshotComparison(undefined);
    setSelectedPaths([]);
    setFileSearch("");
    if (!selectedApp?.app.id || !selectedSnapshotId) return;
    void Promise.all([
      api.getSnapshotContents(selectedApp.app.id, selectedSnapshotId),
      api.compareSnapshot(selectedApp.app.id, selectedSnapshotId)
    ]).then(([contents, comparison]) => {
      setSnapshotContents(contents);
      setSnapshotComparison(comparison);
    }).catch((err) => setMessage(err instanceof Error ? err.message : "Could not inspect snapshot contents"));
  }, [selectedApp?.app.id, selectedSnapshotId, setMessage]);

  useEffect(() => {
    if (!selectedApp?.app.id) {
      setReports([]);
      return;
    }
    void api.getDrReports(selectedApp.app.id).then(setReports).catch(() => setReports([]));
  }, [selectedApp?.app.id]);

  async function runDr() {
    if (!selectedApp) return;
    try {
      await api.post(`/api/apps/${selectedApp.app.id}/dr-run`, {
        scenario: drScenario,
        snapshotId: selectedSnapshotId || undefined,
        targetDir: targetDir.trim() || undefined,
        paths: selectedPaths.length > 0 ? selectedPaths : undefined
      });
      setMessage("Recovery drill started. Restore, verification, proof, and report will complete in the activity log.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start DR run");
    }
  }

  async function prepareRestore() {
    if (!selectedApp || !selectedSnapshotId) {
      setMessage("Choose an app and snapshot first.");
      return;
    }
    setPreflightBusy(true);
    try {
      const result = await api.post(`/api/apps/${selectedApp.app.id}/restore-preflight`, {
        snapshotId: selectedSnapshotId,
        targetDir: targetDir.trim() || undefined
      });
      setPreflight(result);
      setMessage(result.ready ? "Restore preflight complete. Review the destination and warnings below." : "Restore preflight found a blocking problem.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not inspect restore");
    } finally {
      setPreflightBusy(false);
    }
  }

  async function confirmRestore() {
    if (!selectedApp || !selectedSnapshotId || !preflight?.ready) return;
    try {
      await api.post(`/api/apps/${selectedApp.app.id}/restore`, {
        snapshotId: selectedSnapshotId,
        targetDir: preflight.targetDir,
        paths: selectedPaths.length > 0 ? selectedPaths : undefined
      });
      setPreflight(undefined);
      setMessage(selectedPaths.length > 0 ? `Selective restore started for ${selectedPaths.length} chosen path${selectedPaths.length === 1 ? "" : "s"}.` : "Restore job started. Follow progress in the activity log.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start restore");
    }
  }

  async function downloadSelected() {
    if (!selectedApp || !selectedSnapshotId) {
      setMessage("Choose an app and snapshot first.");
      return;
    }
    setDownloading(true);
    try {
      await api.download(`/api/apps/${selectedApp.app.id}/snapshots/${selectedSnapshotId}/download`);
      setMessage("Portable backup downloaded. Keep it somewhere separate from this server.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not download backup");
    } finally {
      setDownloading(false);
    }
  }

  async function importPortable() {
    if (!portableFile) {
      setMessage("Choose a BackupProof portable .tar.gz file first.");
      return;
    }
    setImportingPortable(true);
    try {
      const result = await api.importPortable(portableFile, portableTarget.trim() || undefined);
      setMessage(`Portable backup restored: ${result.metadata.app.name} snapshot ${result.metadata.snapshotId} to ${result.restoreDir}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not import portable backup");
    } finally {
      setImportingPortable(false);
    }
  }

  async function exportRecoveryKit() {
    if (kitPassphrase.length < 12) {
      setMessage("Use a recovery kit passphrase of at least 12 characters.");
      return;
    }
    setKitBusy(true);
    try {
      await api.downloadPost("/api/recovery-kit/export", { passphrase: kitPassphrase }, "backupproof-recovery.bpkit");
      setMessage("Encrypted recovery kit downloaded. Store it separately from this server and remember the passphrase.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not export recovery kit");
    } finally {
      setKitBusy(false);
    }
  }

  async function importRecoveryKit() {
    if (!kitFile || kitPassphrase.length < 12) {
      setMessage("Choose a recovery kit and enter its passphrase.");
      return;
    }
    if (!window.confirm("Import this recovery kit? It will replace protected apps, vault connections, schedules, notifications, and proof history on this server.")) return;
    setKitBusy(true);
    try {
      const result = await api.importRecoveryKit(kitFile, kitPassphrase);
      await refresh();
      setMessage(`Recovery kit imported: ${result.apps} apps, ${result.repositories} vaults, and ${result.policies} schedules restored.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not import recovery kit");
    } finally {
      setKitBusy(false);
    }
  }

  async function saveDestinationTemplate() {
    if (!targetDir.trim()) {
      setMessage("Enter a restore destination before saving it.");
      return;
    }
    try {
      await api.saveRestoreDestination({
        name: templateName.trim() || "Restore destination",
        path: targetDir.trim(),
        description: templateDescription.trim() || undefined,
        appId: selectedApp?.app.id
      });
      await refresh();
      setMessage("Restore destination saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save restore destination");
    }
  }

  async function deleteDestinationTemplate(id: string) {
    try {
      await api.delete(`/api/restore-destinations/${id}`);
      await refresh();
      setMessage("Restore destination deleted.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not delete restore destination");
    }
  }

  const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId);
  const selectedProof = proofHistory.find((proof) => proof.snapshotId === selectedSnapshotId);
  const recommendedSnapshotId = proofHistory.find((proof) =>
    proof.status === "passed" &&
    new Date(proof.expiresAt).getTime() > Date.now() &&
    snapshots.some((snapshot) => snapshot.id === proof.snapshotId)
  )?.snapshotId ?? snapshots[0]?.id;
  const visibleSnapshots = snapshots.filter((snapshot) =>
    !snapshotSearch.trim() ||
    snapshot.id.toLowerCase().includes(snapshotSearch.trim().toLowerCase()) ||
    snapshot.sourcePaths.some((source) => source.toLowerCase().includes(snapshotSearch.trim().toLowerCase()))
  );
  const visibleFiles = snapshotContents?.files.filter((file) => !fileSearch.trim() || file.path.toLowerCase().includes(fileSearch.trim().toLowerCase())) ?? [];

  function togglePath(filePath: string) {
    setSelectedPaths((current) => current.includes(filePath) ? current.filter((item) => item !== filePath) : [...current, filePath]);
  }

  return (
    <section className="recovery">
      <h2><LifeBuoy /> Get Your Data Back</h2>
      <RecoveryCoachPanel coach={buildRecoveryCoach(state, summaries)} goTo={goTo} compact />
      <div className="recovery-steps">
        <div><strong>1</strong><span>Choose what you want to recover.</span></div>
        <div><strong>2</strong><span>Pick where the recovered files should go.</span></div>
        <div><strong>3</strong><span>Let BackupProof check the restore before it starts.</span></div>
      </div>
      <div className="portable-import">
        <div>
          <h2><Upload /> Restore from a downloaded copy</h2>
          <p>Use this when you have a BackupProof download and need to unpack it on this server.</p>
        </div>
        <div className="portable-import-controls">
          <label className="portable-file">
            <span>{portableFile?.name ?? "Choose backup download"}</span>
            <input type="file" accept=".gz,.tgz,application/gzip" onChange={(event) => setPortableFile(event.target.files?.[0])} />
          </label>
          <input value={portableTarget} onChange={(event) => setPortableTarget(event.target.value)} placeholder="Where should files go? Optional" />
          <button className="primary" onClick={importPortable} disabled={!portableFile || importingPortable}><Upload /> {importingPortable ? "Restoring..." : "Restore download"}</button>
        </div>
      </div>
      <div className="recovery-kit">
        <div>
          <h2><ShieldCheck /> Move BackupProof to a new server</h2>
          <p>Save or load the dashboard setup: protected apps, schedules, vault connections, and proof history.</p>
          <small>For safety, user accounts, sessions, job logs, and fleet tokens are not included.</small>
        </div>
        <div className="recovery-kit-controls">
          <input type="password" value={kitPassphrase} onChange={(event) => setKitPassphrase(event.target.value)} placeholder="Password for setup kit, 12+ characters" />
          <button onClick={exportRecoveryKit} disabled={kitBusy || kitPassphrase.length < 12}><Download /> Download setup kit</button>
          <label className="portable-file">
            <span>{kitFile?.name ?? "Choose setup kit"}</span>
            <input type="file" accept=".bpkit,application/octet-stream" onChange={(event) => setKitFile(event.target.files?.[0])} />
          </label>
          <button className="primary" onClick={importRecoveryKit} disabled={kitBusy || !kitFile || kitPassphrase.length < 12}><Upload /> Load setup kit</button>
        </div>
      </div>
      <div className="app-grid">
        {summaries.map((summary) => (
          <article className="app-card" key={summary.app.id}>
            <h3>{summary.app.name}</h3>
            <p>{summary.restorable ? "Ready to recover" : "Needs a recovery check"}</p>
            <p>{summary.app.backupPaths.length} protected location{summary.app.backupPaths.length === 1 ? "" : "s"}</p>
          </article>
        ))}
      </div>
      <div className="snapshot-browser">
        <div className="section-title">
          <h2><ArchiveRestore /> Choose What To Recover</h2>
          <span>{snapshots.length} backup point{snapshots.length === 1 ? "" : "s"}</span>
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
          <input value={targetDir} onChange={(event) => setTargetDir(event.target.value)} placeholder="Where should files go? Optional" />
          <button className="primary" onClick={prepareRestore} disabled={!selectedSnapshotId || preflightBusy}><ArchiveRestore /> {preflightBusy ? "Checking..." : "Check before restore"}</button>
          <button onClick={runDr} disabled={!selectedSnapshotId}><LifeBuoy /> Practice recovery</button>
          <button onClick={downloadSelected} disabled={!selectedSnapshotId || downloading}><Download /> {downloading ? "Preparing..." : "Download a copy"}</button>
        </div>
        <FlashBanner message={message} onDismiss={() => setMessage("")} />
        <div className="destination-templates">
          <div className="section-title">
            <div>
              <h2><Folder /> Saved Places To Restore</h2>
              <p>Save folders you trust so you do not have to type them again.</p>
            </div>
          </div>
          <div className="template-save-row">
            <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Place name" />
            <input value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} placeholder="Optional note" />
            <button onClick={saveDestinationTemplate} disabled={!targetDir.trim()}><Save /> Save this place</button>
          </div>
          {destinationTemplates.length > 0 && (
            <div className="template-list">
              {destinationTemplates.map((template) => (
                <div className="template-row" key={template.id}>
                  <button onClick={() => setTargetDir(template.path)}>
                    <strong>{template.name}</strong>
                    <span>{template.path}</span>
                    {template.description && <small>{template.description}</small>}
                  </button>
                  <button className="icon-danger" onClick={() => deleteDestinationTemplate(template.id)} aria-label={`Delete ${template.name}`}><Trash2 /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        {selectedSnapshot && (
          <div className="restore-point-summary">
            <div>
              <span className="eyebrow"><ShieldCheck /> Chosen backup</span>
              <strong>{selectedSnapshot.id}</strong>
              <small>{time(selectedSnapshot.createdAt)} · {bytes(selectedSnapshot.sizeBytes)}</small>
            </div>
            <div className={selectedProof?.status === "passed" && new Date(selectedProof.expiresAt).getTime() > Date.now() ? "restore-proof-status proven" : "restore-proof-status"}>
              <strong>{selectedProof?.status === "passed" ? "Checked and ready" : selectedProof ? "Check needs attention" : "Not checked yet"}</strong>
              <span>{selectedProof ? `Checked ${time(selectedProof.testedAt)}` : "Run a recovery check before relying on this backup."}</span>
            </div>
          </div>
        )}
        {snapshotContents && (
          <div className="snapshot-inspector">
            <div className="section-title">
              <div>
                <h2><FileText /> Files In This Backup</h2>
                <p>{snapshotContents.supported ? "Choose specific files, or leave everything unchecked to recover the whole backup." : "File browsing is available for BackupProof built-in backups."}</p>
              </div>
              <span>{snapshotContents.totalFiles} file{snapshotContents.totalFiles === 1 ? "" : "s"} · {bytes(snapshotContents.totalBytes)}</span>
            </div>
            {snapshotComparison?.supported && (
              <div className="comparison-strip">
                <span><GitCompare /> Since the previous backup</span>
                <strong className="change-added">+{snapshotComparison.added.length} added</strong>
                <strong className="change-modified">{snapshotComparison.modified.length} changed</strong>
                <strong className="change-deleted">-{snapshotComparison.deleted.length} deleted</strong>
              </div>
            )}
            {snapshotContents.supported && (
              <>
                <div className="file-browser-toolbar">
                  <input value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} placeholder="Find a file" />
                  <span>{selectedPaths.length === 0 ? "Recover everything" : `${selectedPaths.length} file${selectedPaths.length === 1 ? "" : "s"} selected`}</span>
                  {selectedPaths.length > 0 && <button onClick={() => setSelectedPaths([])}>Clear selection</button>}
                </div>
                <div className="snapshot-files">
                  {visibleFiles.length === 0 ? <p className="muted">No matching files.</p> : visibleFiles.slice(0, 200).map((file) => {
                    const change = snapshotComparison?.added.some((item) => item.path === file.path) ? "added"
                      : snapshotComparison?.modified.some((item) => item.path === file.path) ? "modified" : "";
                    return (
                      <label className={selectedPaths.includes(file.path) ? "snapshot-file selected" : "snapshot-file"} key={file.path}>
                        <input type="checkbox" checked={selectedPaths.includes(file.path)} onChange={() => togglePath(file.path)} />
                        <FileText />
                        <span><strong>{file.path}</strong><small>{bytes(file.size)} · modified {time(file.modifiedAt)}</small></span>
                        {change && <em className={`file-change ${change}`}>{change}</em>}
                      </label>
                    );
                  })}
                </div>
                {visibleFiles.length > 200 && <p className="muted">Showing the first 200 matches. Narrow the search to find more.</p>}
              </>
            )}
          </div>
        )}
        <div className="drill-guide">
          <div className="section-title">
            <div>
              <h2><LifeBuoy /> Practice A Recovery</h2>
              <p>Run a safe practice restore and keep a report showing what worked.</p>
            </div>
            <button onClick={runDr} disabled={!selectedSnapshotId}><LifeBuoy /> Start practice run</button>
          </div>
          <div className="drill-checklist">
            <div><CheckCircle2 /><span>Situation</span><strong>{drScenario.replace(/-/g, " ")}</strong></div>
            <div><CheckCircle2 /><span>What to recover</span><strong>{selectedPaths.length > 0 ? `${selectedPaths.length} selected file${selectedPaths.length === 1 ? "" : "s"}` : "Everything"}</strong></div>
            <div><CheckCircle2 /><span>Restore place</span><strong>{targetDir.trim() || "Safe temporary folder"}</strong></div>
            <div><CheckCircle2 /><span>Backup check</span><strong>{selectedProof?.status === "passed" ? "Already checked" : "Needs a fresh check"}</strong></div>
          </div>
        </div>
        <div className="drill-reports">
          <div className="section-title">
            <div>
              <h2><FileText /> Recovery Notes And Reports</h2>
              <p>Download simple instructions or proof that a practice recovery worked.</p>
            </div>
            <div className="report-actions">
              <button onClick={() => selectedApp && api.download(`/api/apps/${selectedApp.app.id}/runbook/download`)} disabled={!selectedApp}><FileText /> Instructions</button>
              <button onClick={() => selectedApp && api.download(`/api/apps/${selectedApp.app.id}/evidence-bundle/download`)} disabled={!selectedApp}><Download /> Proof bundle</button>
            </div>
          </div>
          <span className="report-count">{reports.length} report{reports.length === 1 ? "" : "s"}</span>
          <div className="report-list">
            {reports.length === 0 ? <p className="muted">No recovery drill reports yet.</p> : reports.slice(0, 6).map((report) => (
              <div className="report-row" key={report.id}>
                <div>
                  <strong>{report.scenario.replace(/-/g, " ")} · {time(report.restoredAt)}</strong>
                  <span>Backup checked: {report.proofStatus} · recovery health {report.confidenceScore}%</span>
                  {report.verification && <small>{report.verification.passedFiles}/{report.verification.totalFiles} recovered files matched · {report.selectedPathCount || "full"} recovery</small>}
                </div>
                <button onClick={() => api.download(`/api/apps/${report.appId}/dr-reports/${report.id}/download`)}><Download /> Download</button>
              </div>
            ))}
          </div>
        </div>
        {preflight && (
          <div className={preflight.ready ? "restore-preflight ready" : "restore-preflight blocked"}>
            <div className="section-title">
              <div>
                <h2>{preflight.ready ? <CheckCircle2 /> : <XCircle />} Ready Check</h2>
                <p>{preflight.ready ? `BackupProof can restore ${selectedPaths.length > 0 ? `${selectedPaths.length} selected file${selectedPaths.length === 1 ? "" : "s"}` : "everything"} to this place. Review any warnings before starting.` : "Fix the issue below before restoring."}</p>
              </div>
              <span className={preflight.ready ? "pill ok" : "pill bad"}>{preflight.ready ? "Ready" : "Blocked"}</span>
            </div>
            <div className="preflight-facts">
              <div><span>Restore place</span><strong>{preflight.targetDir}</strong></div>
              <div><span>Already there</span><strong>{preflight.targetExists ? `${preflight.targetEntryCount} item${preflight.targetEntryCount === 1 ? "" : "s"}` : "New folder"}</strong></div>
              <div><span>Backup check</span><strong>{preflight.proof?.current ? "Passed recently" : preflight.proof?.status ?? "Not checked"}</strong></div>
            </div>
            {[...preflight.errors, ...preflight.warnings].map((item) => <p className="preflight-note" key={item}><AlertTriangle /> {item}</p>)}
            <div className="preflight-actions">
              <button onClick={() => setPreflight(undefined)}>Cancel</button>
              <button className="primary" onClick={confirmRestore} disabled={!preflight.ready}><ArchiveRestore /> {selectedPaths.length > 0 ? "Recover selected files" : "Recover everything"}</button>
            </div>
          </div>
        )}
        <div className="snapshot-toolbar">
          <input value={snapshotSearch} onChange={(event) => setSnapshotSearch(event.target.value)} placeholder="Search backups or protected folders" />
          <span>{recommendedSnapshotId ? "Recommended backup is marked below." : "No backup is available yet."}</span>
        </div>
        <div className="snapshot-list">
          {visibleSnapshots.length === 0 ? (
            <div className="empty compact-empty">
              <ArchiveRestore />
              <h2>{snapshots.length === 0 ? "No backups yet" : "No matching backups"}</h2>
              <p>{snapshots.length === 0 ? "Run a backup first, then come back here to inspect and recover it." : "Try a different date or protected folder."}</p>
            </div>
          ) : visibleSnapshots.map((snapshot) => {
            const proof = proofHistory.find((item) => item.snapshotId === snapshot.id);
            const proofCurrent = proof?.status === "passed" && new Date(proof.expiresAt).getTime() > Date.now();
            return (
            <label className={selectedSnapshotId === snapshot.id ? "snapshot-row selected" : "snapshot-row"} key={snapshot.id}>
              <input type="radio" name="snapshot" checked={selectedSnapshotId === snapshot.id} onChange={() => setSelectedSnapshotId(snapshot.id)} />
              <div>
                <strong>{time(snapshot.createdAt)} {snapshot.id === recommendedSnapshotId && <span className="snapshot-badge recommended">Recommended</span>} {proofCurrent && <span className="snapshot-badge proven">Checked</span>}</strong>
                <span>{bytes(snapshot.sizeBytes)}</span>
                <small>{snapshot.sourcePaths.join(", ")}</small>
              </div>
            </label>
          )})}
        </div>
      </div>
      <div className="proof-history">
        <div className="section-title">
          <div>
            <h2><ShieldCheck /> Recovery Check History</h2>
            <p>Past checks show whether BackupProof could restore and verify your data.</p>
          </div>
          <span>{proofHistory.length} test{proofHistory.length === 1 ? "" : "s"}</span>
        </div>
        <div className="proof-timeline">
          {proofHistory.length === 0 ? <p className="muted">No restore tests have completed for this app.</p> : proofHistory.slice(0, 12).map((proof) => (
            <div className={`proof-event ${proof.status}`} key={proof.id}>
              {proof.status === "passed" ? <CheckCircle2 /> : <XCircle />}
              <div>
                <strong>{proof.status === "passed" ? "Recovery check passed" : "Recovery check failed"}</strong>
                <span>{time(proof.testedAt)}</span>
                <small>{proof.healthResults.filter((result) => result.passed).length}/{proof.healthResults.length} app checks · {proof.checksumResults?.filter((result) => result.passed).length ?? 0}/{proof.checksumResults?.length ?? 0} file checks · health {proof.confidenceScore ?? 0}%</small>
              </div>
            </div>
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
  const [message, setMessage] = useFlashMessage();

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
        <FlashBanner message={message} onDismiss={() => setMessage("")} />
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
  const [message, setMessage] = useFlashMessage();
  const [migrateMessage, setMigrateMessage] = useFlashMessage();
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
        <FlashBanner message={message} onDismiss={() => setMessage("")} />
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
            <FlashBanner message={migrateMessage} onDismiss={() => setMigrateMessage("")} />
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
