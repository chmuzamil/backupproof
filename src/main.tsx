import React, { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  ChevronUp,
  Cloud,
  Database,
  Download,
  Folder,
  FolderSearch,
  FileText,
  GitCompare,
  HardDrive,
  LifeBuoy,
  LogIn,
  Menu,
  Play,
  Scissors,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  User,
  XCircle
} from "lucide-react";
import type { Alert, AppSummary, AuthStatus, AuthUser, DashboardState, DiscoveredCmsApp, DiscoveredContainer, DiscoveredDatabase, DiscoveryResult, DrReportSummary, FileBrowserResult, Job, JobType, Policy, RestoreDestinationTemplate, RestorePreflight, RestoreProof, SnapshotComparison, SnapshotContents, SnapshotSummary } from "../shared/types";
import { brand } from "../shared/brand";
import { formatDaysSince, recoveryHealthHeadline, recoveryHealthSummary, type RecoveryAnalytics } from "../shared/recoveryAnalytics";
import { readinessAdvice, readinessCounts, type ReadinessState } from "../shared/readiness";
import { buildRecoveryCoach, type CoachRoute, type CoachTask, type RecoveryCoach } from "../shared/recoveryCoach";
import {
  SecondStorageModal,
  StorageLocationForm,
  buildStoragePayload,
  createStorageFormState,
  type StorageFormState
} from "./storageSetup";
import {
  LoginScreen,
  authFetch,
  canWrite,
  clearAuthToken,
  fetchAuthStatus,
  getAuthToken,
  roleLabel,
  setAuthToken
} from "./auth";
import { Profile } from "./profile";
import "./styles.css";

const api = {
  async getState(): Promise<DashboardState> {
    return authFetch("/api/state").then((res) => res.json());
  },
  async getSummaries(): Promise<AppSummary[]> {
    return authFetch("/api/summaries").then((res) => res.json());
  },
  async getRecoveryAnalytics(period: 30 | 90 = 30): Promise<RecoveryAnalytics> {
    return authFetch(`/api/analytics/recovery?period=${period}`).then((res) => res.json());
  },
  async getSnapshots(appId: string): Promise<SnapshotSummary[]> {
    return authFetch(`/api/apps/${appId}/snapshots`).then((res) => res.json());
  },
  async getProofHistory(appId: string): Promise<RestoreProof[]> {
    return authFetch(`/api/apps/${appId}/proof-history`).then((res) => res.json());
  },
  async getSnapshotContents(appId: string, snapshotId: string): Promise<SnapshotContents> {
    return authFetch(`/api/apps/${appId}/snapshots/${snapshotId}/contents`).then((res) => res.json());
  },
  async compareSnapshot(appId: string, snapshotId: string): Promise<SnapshotComparison> {
    return authFetch(`/api/apps/${appId}/snapshots/${snapshotId}/compare`).then((res) => res.json());
  },
  async getDrReports(appId: string): Promise<DrReportSummary[]> {
    return authFetch(`/api/apps/${appId}/dr-reports`).then((res) => res.json());
  },
  async getDiscovery(): Promise<DiscoveryResult> {
    return authFetch("/api/discovery").then((res) => res.json());
  },
  async browseFiles(path?: string): Promise<FileBrowserResult> {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    return authFetch(`/api/filesystem/browse${query}`).then((res) => res.json());
  },
  async post(path: string, body?: unknown) {
    const res = await authFetch(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
    return res.json();
  },
  async put(path: string, body: unknown) {
    const res = await authFetch(path, {
      method: "PUT",
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
    return res.json();
  },
  async delete(path: string) {
    const res = await authFetch(path, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
    return res.json();
  },
  async download(path: string) {
    const res = await authFetch(path);
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
    const headers: Record<string, string> = { "content-type": "application/gzip" };
    if (targetDir) headers["x-restore-target"] = targetDir;
    const res = await authFetch("/api/portable/import", { method: "POST", headers, body: file });
    if (!res.ok) throw new Error((await res.json()).error ?? "Portable backup import failed");
    return res.json();
  },
  async downloadPost(path: string, body: unknown, fallbackName: string) {
    const res = await authFetch(path, { method: "POST", body: JSON.stringify(body) });
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
    const res = await authFetch("/api/recovery-kit/import", {
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

function useFlashMessage() {
  return useState("");
}

function FlashBanner({
  message,
  onDismiss,
  variant = "info",
  autoDismissMs = FLASH_DURATION_MS
}: {
  message: string;
  onDismiss: () => void;
  variant?: "info" | "danger" | "warning";
  autoDismissMs?: number;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!message || autoDismissMs <= 0) return;
    const timer = window.setTimeout(() => onDismissRef.current(), autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [message, autoDismissMs]);

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

function friendlyJobFailureLabel(type: JobType) {
  return {
    backup: "Backup",
    check: "Storage check",
    prune: "Cleanup",
    "restore-test": "Recovery check",
    "manual-restore": "File recovery",
    "dr-run": "Recovery practice"
  }[type];
}

function useJobFailureToast(jobs: Job[]) {
  const [message, setMessage] = useState("");
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const job of jobs) {
      if (job.status !== "failed") continue;
      if (notifiedRef.current.has(job.id)) continue;
      notifiedRef.current.add(job.id);
      const label = friendlyJobFailureLabel(job.type);
      setMessage(job.error ? `${label} failed — ${job.error}` : `${label} failed`);
    }
  }, [jobs]);

  return [message, () => setMessage("")] as const;
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

const FIRST_RUN_KEY = "backupproof.firstRunDismissed";
const REPORT_KEY = "backupproof.reportDownloaded";

type AppPage = "dashboard" | "protect" | "recovery" | "schedule" | "alerts" | "settings" | "profile";

const PAGE_META: Record<AppPage, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "See what is protected and what to do next." },
  protect: { title: "Protect data", subtitle: "Choose what to back up, where copies live, and how recovery is checked." },
  recovery: { title: "Recovery", subtitle: "Restore files or practice getting data back." },
  schedule: { title: "Schedule", subtitle: "When backups and checks should run." },
  alerts: { title: "Alerts", subtitle: "Review problems and acknowledge them when handled." },
  settings: { title: "Notifications", subtitle: "Email and chat alerts when something fails." },
  profile: { title: "Profile", subtitle: "Change your password or manage dashboard users." }
};

const NAV_ITEMS: { page: AppPage; label: string; icon: React.ReactNode; authOnly?: boolean }[] = [
  { page: "dashboard", label: "Dashboard", icon: <HardDrive /> },
  { page: "protect", label: "Protect data", icon: <ShieldCheck /> },
  { page: "recovery", label: "Recovery", icon: <LifeBuoy /> },
  { page: "schedule", label: "Schedule", icon: <CalendarClock /> },
  { page: "alerts", label: "Alerts", icon: <AlertTriangle /> },
  { page: "settings", label: "Notifications", icon: <Bell /> },
  { page: "profile", label: "Profile", icon: <User />, authOnly: true }
];

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [state, setState] = useState<DashboardState | null>(null);
  const [summaries, setSummaries] = useState<AppSummary[]>([]);
  const [active, setActive] = useState<"dashboard" | "protect" | "recovery" | "schedule" | "alerts" | "settings" | "profile">("dashboard");
  const [secondStorageAppId, setSecondStorageAppId] = useState<string | null>(null);
  const [focusAlertsSetup, setFocusAlertsSetup] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [error, setError] = useState<string>();

  const currentUser = authStatus?.user ?? null;
  const writeAccess = canWrite(currentUser?.role);

  useEffect(() => {
    if (!navOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navOpen]);

  function goToPage(page: AppPage) {
    setActive(page);
    setNavOpen(false);
    if (page !== "settings") setFocusAlertsSetup(false);
  }

  async function loadAuthStatus() {
    try {
      const params = new URLSearchParams(window.location.search);
      const oidcToken = params.get("auth");
      if (oidcToken) {
        setAuthToken(oidcToken);
        window.history.replaceState({}, "", window.location.pathname);
      }
      const status = await fetchAuthStatus();
      setAuthStatus(status);
      return status;
    } catch {
      setAuthStatus({
        authEnabled: false,
        oidcAvailable: false,
        setupRequired: false,
        user: null
      });
      return null;
    }
  }

  function handleCoachGoTo(route: CoachRoute, task?: CoachTask) {
    if (task?.id === "recovery-report") {
      void api.download("/api/analytics/recovery/report?period=30").then(() => {
        window.localStorage.setItem(REPORT_KEY, "1");
      });
      return;
    }
    if (task?.id === "offsite-copy") {
      setActive("dashboard");
      setNavOpen(false);
      const candidate = state?.apps.find((app) => !(app.secondaryRepositoryIds?.length)) ?? state?.apps[0];
      setSecondStorageAppId(candidate?.id ?? null);
      return;
    }
    if (task?.id === "alerts") {
      setFocusAlertsSetup(true);
      setActive("settings");
      setNavOpen(false);
      return;
    }
    setActive(route);
    setNavOpen(false);
  }

  function dismissFirstRun() {
    window.localStorage.setItem(FIRST_RUN_KEY, "1");
    setShowFirstRun(false);
  }

  function startFirstRunProtect() {
    dismissFirstRun();
    setActive("protect");
    setNavOpen(false);
  }

  function startFirstRunAlerts() {
    dismissFirstRun();
    setFocusAlertsSetup(true);
    setActive("settings");
    setNavOpen(false);
  }

  async function refresh() {
    try {
      const [nextState, nextSummaries] = await Promise.all([api.getState(), api.getSummaries()]);
      setState(nextState);
      setSummaries(nextSummaries);
      setError(undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load dashboard";
      if (message.toLowerCase().includes("authentication")) {
        clearAuthToken();
        setAuthStatus(await fetchAuthStatus());
      }
      setError(message);
    }
  }

  async function handleAuthenticated() {
    const status = await loadAuthStatus();
    if (status?.user) await refresh();
  }

  async function logout() {
    try {
      if (getAuthToken()) await api.post("/api/auth/logout");
    } catch {
      /* ignore logout errors */
    }
    clearAuthToken();
    setState(null);
    setSummaries([]);
    setAuthStatus(await fetchAuthStatus());
  }

  useEffect(() => {
    void loadAuthStatus();
  }, []);

  useEffect(() => {
    if (!authStatus) return;
    if (authStatus.authEnabled && !authStatus.user) return;
    void refresh();
    const events = new EventSource("/events");
    events.onmessage = () => void refresh();
    return () => events.close();
  }, [authStatus]);

  useEffect(() => {
    if (summaries.length === 0 && !window.localStorage.getItem(FIRST_RUN_KEY)) {
      setShowFirstRun(true);
    }
  }, [summaries.length]);

  useEffect(() => {
    if (active !== "settings") setFocusAlertsSetup(false);
  }, [active]);

  const latestJobs = useMemo(() => state?.jobs.slice(0, 8) ?? [], [state]);
  const [jobToast, clearJobToast] = useJobFailureToast(state?.jobs ?? []);

  if (!authStatus) {
    return (
      <div className="loading">
        <img className="loading-logo" src="/logo-mark.svg" width={56} height={56} alt="" />
        <span>{brand.loadingMessage}</span>
      </div>
    );
  }

  if (authStatus.authEnabled && !authStatus.user) {
    return <LoginScreen authStatus={authStatus} onAuthenticated={handleAuthenticated} />;
  }

  if (!state) {
    return (
      <div className="loading">
        <img className="loading-logo" src="/logo-mark.svg" width={56} height={56} alt="" />
        <span>{brand.loadingMessage}</span>
      </div>
    );
  }

  return (
    <div className={`app-shell${navOpen ? " nav-open" : ""}`}>
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Close menu"
        onClick={() => setNavOpen(false)}
      />
      <aside className={`sidebar${navOpen ? " open" : ""}`} aria-label="Main navigation">
        <SidebarBrand />
        {NAV_ITEMS.filter((item) => !item.authOnly || authStatus.authEnabled).map((item) => (
          <button
            key={item.page}
            type="button"
            className={active === item.page ? "nav active" : "nav"}
            onClick={() => goToPage(item.page)}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </aside>

      <main>
        <header className="topbar">
          <div className="topbar-leading">
            <button
              type="button"
              className="mobile-nav-toggle"
              aria-label={navOpen ? "Close menu" : "Open menu"}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((open) => !open)}
            >
              <Menu />
            </button>
            <div className="topbar-copy">
              <h1 className="topbar-title">{PAGE_META[active].title}</h1>
              <p className="topbar-sub">{PAGE_META[active].subtitle}</p>
            </div>
          </div>
          <div className="topbar-trailing">
            <TopbarToolbar
              state={state}
              currentUser={currentUser}
              authEnabled={authStatus.authEnabled}
              onAlerts={() => goToPage("alerts")}
              onProfile={() => goToPage("profile")}
              onLogout={() => void logout()}
            />
          </div>
        </header>
        <div className="page-body">
        {!writeAccess && (
          <div className="banner info">Signed in as a read-only user. Backup and settings changes are disabled.</div>
        )}
        {error && <div className="banner danger">{error}</div>}
        {state.environment.errors.length > 0 && <div className="banner warning">{state.environment.errors.join(" ")}</div>}
        {state.environment.warnings.length > 0 && <div className="banner info">{state.environment.warnings.join(" ")}</div>}

        {active === "dashboard" && <Dashboard state={state} summaries={summaries} jobs={latestJobs} refresh={refresh} goTo={handleCoachGoTo} onAddSecondCopy={setSecondStorageAppId} writeAccess={writeAccess} />}
        {active === "protect" && <ProtectData state={state} refresh={refresh} writeAccess={writeAccess} />}
        {active === "recovery" && <Recovery state={state} summaries={summaries} refresh={refresh} goTo={handleCoachGoTo} writeAccess={writeAccess} />}
        {active === "schedule" && <Schedule state={state} summaries={summaries} refresh={refresh} writeAccess={writeAccess} />}
        {active === "alerts" && <Alerts state={state} summaries={summaries} refresh={refresh} writeAccess={writeAccess} />}
        {active === "settings" && <Notifications state={state} refresh={refresh} highlightSetup={focusAlertsSetup} writeAccess={writeAccess} />}
        {active === "profile" && <Profile authEnabled={authStatus.authEnabled} currentUser={currentUser} refresh={refresh} />}
        {secondStorageAppId && <SecondStorageModal state={state} appId={secondStorageAppId} onClose={() => setSecondStorageAppId(null)} refresh={refresh} />}
        {showFirstRun && summaries.length === 0 && (
          <FirstRunWizard
            onProtect={startFirstRunProtect}
            onAlerts={startFirstRunAlerts}
            onDemo={async () => {
              dismissFirstRun();
              await api.post("/api/demo/run");
              await refresh();
            }}
            onDismiss={dismissFirstRun}
          />
        )}
        </div>
        {jobToast && (
          <div className="toast-host" aria-live="polite">
            <FlashBanner message={jobToast} onDismiss={clearJobToast} variant="danger" />
          </div>
        )}
      </main>
    </div>
  );
}

function TopbarToolbar({
  state,
  currentUser,
  authEnabled,
  onAlerts,
  onProfile,
  onLogout
}: {
  state: DashboardState;
  currentUser: AuthUser | null;
  authEnabled: boolean;
  onAlerts: () => void;
  onProfile: () => void;
  onLogout: () => void;
}) {
  const alertCount = state.alerts.filter((alert) => !alert.acknowledgedAt).length;
  const hasAlerts = alertCount > 0;
  const storageOk = state.environment.dataDirWritable;
  const optionalEngines = [
    state.environment.resticAvailable ? `Restic ${state.environment.resticVersion ?? ""}`.trim() : null,
    state.environment.kopiaAvailable ? `Kopia ${state.environment.kopiaVersion ?? ""}`.trim() : null
  ].filter(Boolean).join(" · ");

  return (
    <div className="topbar-toolbar">
      <span
        className={`topbar-segment system-status ${storageOk ? "ok" : "bad"}`}
        title={storageOk ? (optionalEngines ? `Optional engines: ${optionalEngines}` : "Built-in backup engine is ready") : "Backup storage is not writable"}
      >
        {storageOk ? <CheckCircle2 /> : <XCircle />}
        <span className="topbar-segment-text">{storageOk ? "System ready" : "Storage issue"}</span>
      </span>
      <button
        type="button"
        className={`topbar-segment alert-segment${hasAlerts ? " has-alerts" : ""}`}
        onClick={onAlerts}
      >
        {hasAlerts ? <AlertTriangle /> : <Bell />}
        <span className="topbar-segment-text">{alertCount} alert{alertCount === 1 ? "" : "s"}</span>
      </button>
      {currentUser && authEnabled && (
        <>
          <button
            type="button"
            className="topbar-segment account-segment"
            title={`Signed in as ${currentUser.username}`}
            onClick={onProfile}
          >
            <span className="account-avatar" aria-hidden="true">{currentUser.username.slice(0, 1).toUpperCase()}</span>
            <span className="account-meta">
              <strong>{currentUser.username}</strong>
              <small>{roleLabel(currentUser.role)}</small>
            </span>
          </button>
          <button type="button" className="topbar-segment signout-segment" onClick={onLogout}>
            Sign out
          </button>
        </>
      )}
    </div>
  );
}

function Dashboard({
  state,
  summaries,
  jobs,
  refresh,
  goTo,
  onAddSecondCopy,
  writeAccess
}: {
  state: DashboardState;
  summaries: AppSummary[];
  jobs: Job[];
  refresh: () => Promise<void>;
  goTo: (route: CoachRoute, task?: CoachTask) => void;
  onAddSecondCopy: (appId: string) => void;
  writeAccess: boolean;
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
        <RecoveryCoachPanel coach={buildRecoveryCoach(state, summaries, { reportDownloaded: Boolean(window.localStorage.getItem(REPORT_KEY)) })} goTo={goTo} />
        <BackupHealthPanel counts={counts} summaries={orderedSummaries} refresh={refresh} writeAccess={writeAccess} />
        {!hasProtectedData && <div className="demo-strip">
          <div>
            <strong>Try a safe demo</strong>
            <span>Watch {brand.name} save sample data, recover it, and check that it worked.</span>
          </div>
          <button onClick={runDemo} disabled={demoRunning || !writeAccess}><Sparkles /> {demoRunning ? "Starting..." : "Run demo"}</button>
        </div>}
        <FlashBanner message={demoMessage} onDismiss={() => setDemoMessage("")} />
        <div className="section-title">
          <h2>Your backups</h2>
          <div className="filter-tabs" aria-label="Filter protected apps">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All {counts.total}</button>
            <button className={filter === "attention" ? "active" : ""} onClick={() => setFilter("attention")}>Needs attention {counts.attention}</button>
            <button className={filter === "proven" ? "active" : ""} onClick={() => setFilter("proven")}>Ready {counts.proven}</button>
          </div>
        </div>
        {summaries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="app-grid">
            {visibleSummaries.map((summary) => (
              <AppCard key={summary.app.id} summary={summary} refresh={refresh} onAddSecondCopy={() => onAddSecondCopy(summary.app.id)} writeAccess={writeAccess} />
            ))}
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
  goTo: (route: CoachRoute, task?: CoachTask) => void;
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
          <button type="button" onClick={() => goTo(coach.nextTask!.route, coach.nextTask)}>{coach.nextTask.actionLabel}</button>
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
            <button type="button" className={`coach-task ${task.status} actionable`} key={task.id} onClick={() => goTo(task.route, task)}>
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

function BackupHealthPanel({
  counts,
  summaries,
  refresh,
  writeAccess
}: {
  counts: ReturnType<typeof readinessCounts>;
  summaries: AppSummary[];
  refresh: () => Promise<void>;
  writeAccess: boolean;
}) {
  const [period, setPeriod] = useState<30 | 90>(30);
  const [analytics, setAnalytics] = useState<RecoveryAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useFlashMessage();
  const next = summaries.find((summary) => readinessAdvice(summary).state !== "proven");
  const advice = next ? readinessAdvice(next) : undefined;
  const [running, setRunning] = useState(false);
  const hasProtectedData = counts.total > 0;

  useEffect(() => {
    if (!hasProtectedData) {
      setAnalytics(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void api.getRecoveryAnalytics(period).then((data) => {
      if (active) {
        setAnalytics(data);
        setLoading(false);
      }
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [period, hasProtectedData]);

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

  async function downloadReport() {
    setMessage("");
    try {
      await api.download(`/api/analytics/recovery/report?period=${period}`);
      setMessage("Report downloaded.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not download report");
    }
  }

  const trendMax = Math.max(1, ...(analytics?.trend.filter((point) => point.hasData).map((point) => point.averageScore) ?? [1]));
  const lastCheckLabel = !analytics || analytics.summary.averageDaysSinceProof === null
    ? "Not yet"
    : analytics.summary.averageDaysSinceProof === 0
      ? "Today"
      : `${analytics.summary.averageDaysSinceProof}d ago`;

  const headline = !hasProtectedData
    ? "Protect your first backup"
    : loading && !analytics
      ? "Checking your backups..."
      : analytics
        ? recoveryHealthHeadline(analytics)
        : counts.attention === 0
          ? "Everything looks good"
          : `${counts.attention} item${counts.attention === 1 ? "" : "s"} need${counts.attention === 1 ? "s" : ""} attention`;

  const summary = !hasProtectedData
    ? "Pick files or apps you care about and save the first backup."
    : analytics
      ? recoveryHealthSummary(analytics)
      : counts.attention === 0
        ? "BackupProof has tested your backups and they can be restored."
        : "Fix the item below first — BackupProof will tell you exactly what to do.";

  return (
    <section className="readiness-overview backup-health-panel">
      <div className="readiness-heading">
        <div>
          <span className="eyebrow"><TrendingUp /> Backup health</span>
          <h2>{headline}</h2>
          <p>{summary}</p>
        </div>
        {next && advice && (
          <div className={`next-action ${advice.state}`}>
            <span>Do this next</span>
            <strong>{next.app.name}</strong>
            <p>{advice.message}</p>
            {advice.action && (
              <button onClick={runNext} disabled={running || !writeAccess}>
                {advice.action === "backup" ? <Play /> : <RotateCcw />}
                {running ? "Starting..." : advice.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
      {hasProtectedData && (
        <div className="readiness-stats readiness-stats-compact">
          <div className="stat-good"><strong>{counts.proven}</strong><span>Ready to restore</span></div>
          {counts.attention > 0 && <div className="stat-warning"><strong>{counts.attention}</strong><span>Need attention</span></div>}
          <div><strong>{counts.total}</strong><span>Protected</span></div>
          {analytics && (
            <div><strong>{lastCheckLabel}</strong><span>Since last test</span></div>
          )}
        </div>
      )}
      <FlashBanner message={message} onDismiss={() => setMessage("")} />
      {hasProtectedData && analytics && (
        <>
          <div className="analytics-expand-row">
            <button type="button" className="ghost-button analytics-toggle" onClick={() => setExpanded((open) => !open)}>
              {expanded ? <><ChevronUp size={16} /> Hide history</> : <><ChevronDown size={16} /> Show history</>}
            </button>
            {expanded && (
              <button type="button" className="ghost-button" onClick={() => void downloadReport()}><Download /> Download report</button>
            )}
          </div>
          {expanded && (
            <div className="analytics-details">
              <div className="analytics-actions inline">
                <div className="filter-tabs" aria-label="History period">
                  <button type="button" className={period === 30 ? "active" : ""} onClick={() => setPeriod(30)}>Last 30 days</button>
                  <button type="button" className={period === 90 ? "active" : ""} onClick={() => setPeriod(90)}>Last 90 days</button>
                </div>
              </div>
              <p className="muted analytics-details-lead">Restore tests over time and a log of recent saves.</p>
              <div className="analytics-trend-wrap">
                <div className="analytics-trend" aria-label="Restore test results by day">
                  {analytics.trend.map((point) => (
                    <div className="analytics-bar-wrap" key={point.date} title={`${point.date}: ${point.hasData ? `${point.averageScore}% passed` : "No tests"}`}>
                      <div
                        className={`analytics-bar ${point.hasData ? "has-data" : ""}`}
                        style={{ height: point.hasData ? `${Math.max(8, (point.averageScore / trendMax) * 100)}%` : "6px" }}
                      />
                      <span className="analytics-bar-label">{point.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="analytics-list history-items-list">
                <h3>Your protected items</h3>
                {summaries.map((summary) => (
                  <div className="analytics-row" key={summary.app.id}>
                    <strong>{summary.app.name}</strong>
                    <span>{summary.snapshotCount} save{summary.snapshotCount === 1 ? "" : "s"} · last {time(summary.latestBackup?.finishedAt)}</span>
                    <span>{summary.restorable ? "Ready to restore" : "Needs a restore test"} · tested {formatDaysSince(summary.restoreProof?.testedAt)}</span>
                  </div>
                ))}
              </div>
              {analytics.drills.length > 0 && (
                <div className="analytics-list history-drills-list">
                  <h3>Practice recoveries</h3>
                  {analytics.drills.slice(0, 6).map((drill) => (
                    <div className="analytics-row" key={`${drill.appId}-${drill.id}`}>
                      <strong>{drill.appName}</strong>
                      <span>{time(drill.restoredAt)}</span>
                      <span>{drill.proofStatus === "passed" ? "Passed" : "Needs review"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FirstRunWizard({
  onProtect,
  onAlerts,
  onDemo,
  onDismiss
}: {
  onProtect: () => void;
  onAlerts: () => void;
  onDemo: () => Promise<void>;
  onDismiss: () => void;
}) {
  const [demoRunning, setDemoRunning] = useState(false);

  async function runDemo() {
    setDemoRunning(true);
    try {
      await onDemo();
    } finally {
      setDemoRunning(false);
    }
  }

  return (
    <div className="modal-backdrop first-run-backdrop" role="dialog" aria-modal="true" aria-labelledby="first-run-title">
      <div className="modal first-run-modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow"><Sparkles /> Quick setup</span>
            <h2 id="first-run-title">Welcome to BackupProof</h2>
            <p>Three calm steps to go from zero to a backup you can actually restore.</p>
          </div>
          <button type="button" className="modal-close" onClick={onDismiss} aria-label="Close"><XCircle /></button>
        </div>
        <ol className="first-run-steps">
          <li>
            <span className="first-run-step-icon" aria-hidden="true"><ShieldCheck /></span>
            <div className="first-run-step-body">
              <span className="first-run-step-num">Step 1</span>
              <strong>Protect something important</strong>
              <p>Choose photos, documents, app data, or a website folder.</p>
              <button type="button" className="first-run-btn primary" onClick={onProtect}>Start protect wizard</button>
            </div>
          </li>
          <li>
            <span className="first-run-step-icon" aria-hidden="true"><Play /></span>
            <div className="first-run-step-body">
              <span className="first-run-step-num">Step 2</span>
              <strong>Save and check the first backup</strong>
              <p>Try the safe demo if you want to watch the full flow first.</p>
              <button type="button" className="first-run-btn secondary" onClick={() => void runDemo()} disabled={demoRunning}>{demoRunning ? "Starting demo..." : "Run safe demo"}</button>
            </div>
          </li>
          <li>
            <span className="first-run-step-icon" aria-hidden="true"><Bell /></span>
            <div className="first-run-step-body">
              <span className="first-run-step-num">Step 3</span>
              <strong>Turn on alerts</strong>
              <p>Get a plain-language email when a backup or recovery check needs attention.</p>
              <button type="button" className="first-run-btn secondary" onClick={onAlerts}>Set up alerts</button>
            </div>
          </li>
        </ol>
      </div>
    </div>
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

function AppCard({ summary, refresh, onAddSecondCopy, writeAccess }: { summary: AppSummary; refresh: () => Promise<void>; onAddSecondCopy: () => void; writeAccess: boolean }) {
  const [message, setMessage] = useFlashMessage();
  const advice = readinessAdvice(summary);
  const protectedSize = bytes(summary.safety.estimatedSourceBytes);
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
      <p className="app-timing muted">
        Last saved {time(summary.latestBackup?.finishedAt)} · Last tested {formatDaysSince(summary.restoreProof?.testedAt)}
      </p>
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
      {summary.snapshotCount > 0 && (
        <div className="snapshot-line">{summary.snapshotCount} backup point{summary.snapshotCount === 1 ? "" : "s"} saved</div>
      )}
      <div className="snapshot-line">Latest backup point: {summary.latestSnapshot?.id ?? "None yet"}</div>
      <div className="snapshot-line">Backup storage: {summary.repository?.name ?? "Not configured"} · {summary.repository?.type}{summary.repository?.objectLock ? " · Immutable" : ""}</div>
      {(summary.app.secondaryRepositoryIds ?? []).length > 0 && (
        <div className="snapshot-line">Second copy: {(summary.app.secondaryRepositoryIds ?? []).length} extra location{(summary.app.secondaryRepositoryIds ?? []).length === 1 ? "" : "s"}</div>
      )}
      <div className="checks">
        {summary.app.healthChecks.length === 0 ? <span>No recovery checks configured</span> : summary.app.healthChecks.map((check) => <span key={check.id}>{check.type}: {check.target}</span>)}
      </div>
      </details>
      <div className="actions simplified-actions">
        <button
          className="primary-card-action"
          onClick={() => run(primaryAction.type)}
          disabled={!writeAccess || (primaryAction.type === "backup" && !summary.safety.safe)}
          title={primaryAction.type === "backup" && !summary.safety.safe ? summary.safety.errors.join(" ") : primaryAction.label}
        >
          <primaryAction.Icon /> {primaryAction.label}
        </button>
        <details className="more-actions">
          <summary>More actions</summary>
          <div className="more-actions-menu">
            {primaryAction.type !== "backup" && (
              <button onClick={() => run("backup")} disabled={!writeAccess || !summary.safety.safe} title={summary.safety.safe ? "Back up now" : summary.safety.errors.join(" ")}><Play /> Back up now</button>
            )}
            {primaryAction.type !== "restore-test" && <button onClick={() => run("restore-test")} disabled={!writeAccess}><RotateCcw /> Check recovery</button>}
            {primaryAction.type !== "manual-restore" && <button onClick={() => run("manual-restore")} disabled={!writeAccess}><LifeBuoy /> Recover files</button>}
            <button onClick={downloadLatest} disabled={!summary.latestSnapshot}><Download /> Download a copy</button>
            <button onClick={onAddSecondCopy} disabled={!writeAccess}><Cloud /> Add second copy</button>
            <button onClick={() => run("prune")} disabled={!writeAccess}><Scissors /> Clean old backups</button>
          </div>
        </details>
      </div>
      <details className="advanced-details danger-details">
        <summary>Remove or delete</summary>
        <div className="danger-actions">
          <button type="button" className="danger" onClick={deleteSnapshots} disabled={!writeAccess}><Trash2 /> Delete backups</button>
          <button type="button" className="danger" onClick={removeApp} disabled={!writeAccess}><Trash2 /> Remove from dashboard</button>
        </div>
      </details>
      <FlashBanner message={message} onDismiss={() => setMessage("")} />
    </article>
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

function FileBrowserPicker({
  browser,
  loading,
  message,
  onBrowse,
  onAdd
}: {
  browser: FileBrowserResult | null;
  loading: boolean;
  message: string;
  onBrowse: (path?: string) => void;
  onAdd: (path: string) => void;
}) {
  return (
    <div className="file-picker">
      <div className="section-title compact-title">
        <div>
          <h4><FolderSearch /> Browse folders</h4>
          <p className="muted">Click through folders and add the files or folders you want protected.</p>
        </div>
        <button type="button" onClick={() => onBrowse()} disabled={loading}><FolderSearch /> {loading ? "Opening..." : "Start at home"}</button>
      </div>
      {message && <div className="banner warning">{message}</div>}
      {browser ? (
        <>
          <div className="file-picker-roots">
            {browser.roots.map((root) => (
              <button type="button" key={root.path} onClick={() => onBrowse(root.path)}>
                <Folder /> {root.name}
              </button>
            ))}
          </div>
          <div className="file-picker-current">
            {browser.parentPath && (
              <button type="button" onClick={() => onBrowse(browser.parentPath)}>
                <ChevronLeft /> Up one folder
              </button>
            )}
            <code>{browser.currentPath}</code>
            <button type="button" className="infra-use" onClick={() => onAdd(browser.currentPath)}>
              Add this folder
            </button>
          </div>
          <div className="file-picker-list">
            {browser.entries.length === 0 ? (
              <p className="muted">This folder is empty or cannot show its contents.</p>
            ) : browser.entries.map((entry) => (
              <div className="file-picker-row" key={entry.path}>
                <button type="button" className="file-picker-open" onClick={() => entry.type === "folder" ? onBrowse(entry.path) : onAdd(entry.path)}>
                  {entry.type === "folder" ? <Folder /> : <FileText />}
                  <span>{entry.name}</span>
                  {entry.type === "folder" && <ChevronRight />}
                </button>
                <button type="button" className="file-picker-add" onClick={() => onAdd(entry.path)}>
                  Add
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty compact-empty">
          <FolderSearch />
          <h2>Open the file browser</h2>
          <p>Browse this machine and add folders or files without typing paths.</p>
        </div>
      )}
    </div>
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

function ProtectData({ state, refresh, writeAccess }: { state: DashboardState; refresh: () => Promise<void>; writeAccess: boolean }) {
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
  const [fileBrowser, setFileBrowser] = useState<FileBrowserResult | null>(null);
  const [browsingFiles, setBrowsingFiles] = useState(false);
  const [browserMessage, setBrowserMessage] = useState("");
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
  const [primaryForm, setPrimaryForm] = useState(() => createStorageFormState({
    repoName: "My safety vault",
    repoLocation: ".data/vaults/default"
  }));
  const [enableSecondCopy, setEnableSecondCopy] = useState(false);
  const [secondForm, setSecondForm] = useState(() => createStorageFormState({
    repoName: "Second copy",
    repoLocation: ".data/vaults/secondary"
  }));

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

  function addPathToSelection(itemPath: string) {
    const next = mergePaths([itemPath]);
    setBackupPaths(next);
    setSelectedPaths(parsePaths(next));
    if (!healthTarget) setHealthTarget(itemPath);
    setMessage("Added to the protection list.");
  }

  async function browseFiles(path?: string) {
    setBrowsingFiles(true);
    setBrowserMessage("");
    try {
      const result = await api.browseFiles(path);
      if ("error" in result) throw new Error(String(result.error));
      setFileBrowser(result);
    } catch (err) {
      setBrowserMessage(err instanceof Error ? err.message : "Could not open that folder.");
    } finally {
      setBrowsingFiles(false);
    }
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
        setPrimaryForm((current) => ({ ...current, repoLocation: result.defaultVaultPath }));
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
    void browseFiles();
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
      if (!primaryForm.repoName.trim()) return "Name this backup storage.";
      if (!primaryForm.repoLocation.trim()) return "Choose where backup copies should be stored.";
      if ((engine === "restic" || engine === "kopia") && primaryForm.repoPassword.length < 8) {
        return "This storage engine needs a password of at least 8 characters.";
      }
      if (primaryForm.repoType === "sftp" && (!primaryForm.credentials.host?.trim() || !primaryForm.credentials.username?.trim())) {
        return "Add the server address and username.";
      }
      if ((primaryForm.repoType === "s3" || primaryForm.repoType === "b2") && (!primaryForm.credentials.accessKey?.trim() || !primaryForm.credentials.secretKey?.trim())) {
        return "Add the cloud access key and secret key.";
      }
      if (primaryForm.repoType === "google-drive" && !primaryForm.googleConnectionId) return "Connect Google Drive before continuing.";
      if (enableSecondCopy) {
        if (!secondForm.repoName.trim() || !secondForm.repoLocation.trim()) return "Finish the second copy storage details.";
        if (secondForm.repoType === "google-drive" && !secondForm.googleConnectionId) return "Connect Google Drive for the second copy.";
      }
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
      const repo = await api.post("/api/repositories", buildStoragePayload(primaryForm, engine));
      const secondaryRepositoryIds: string[] = [];
      if (enableSecondCopy) {
        const secondRepo = await api.post("/api/repositories", buildStoragePayload(secondForm, engine));
        secondaryRepositoryIds.push(secondRepo.id);
      }

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
        secondaryRepositoryIds,
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
    if (step === 1 && !vaultPrefilled) {
      setPrimaryForm((current) => ({
        ...current,
        repoLocation: `.data/vaults/${appName.trim().toLowerCase().replace(/\s+/g, "-") || "default"}`
      }));
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
      <div className="wizard-steps" aria-label="Setup progress">
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
                  <FileBrowserPicker
                    browser={fileBrowser}
                    loading={browsingFiles}
                    message={browserMessage}
                    onBrowse={(itemPath) => void browseFiles(itemPath)}
                    onAdd={addPathToSelection}
                  />
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
                hint="Use the browser below, or type one path per line."
                full
              >
                <textarea
                  value={backupPaths}
                  onChange={(e) => setBackupPaths(e.target.value)}
                  placeholder={"C:\\Users\\you\\Documents\nD:\\Projects\\my-app\\data"}
                  rows={3}
                />
              </WizardField>

              <FileBrowserPicker
                browser={fileBrowser}
                loading={browsingFiles}
                message={browserMessage}
                onBrowse={(itemPath) => void browseFiles(itemPath)}
                onAdd={addPathToSelection}
              />

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
          <p className="wizard-lead">Pick a friendly storage type, test the connection, and optionally add a second place right away.</p>

          <div className="protect-tip">
            <ShieldCheck />
            <div>
              <strong>Simple recommendation</strong>
              <span>Keep the main copy on this computer, then add Google Drive, another server, or an attached drive as backup #2.</span>
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

          <div className="wizard-subpanel">
            <h4>Main backup storage</h4>
            <StorageLocationForm state={primaryForm} setState={setPrimaryForm} engine={engine} onMessage={setMessage} />
          </div>

          <div className="wizard-subpanel second-copy-panel">
            <label className="second-copy-toggle">
              <input type="checkbox" checked={enableSecondCopy} onChange={(e) => setEnableSecondCopy(e.target.checked)} />
              <span>
                <strong>Also save a second copy somewhere else</strong>
                <small>Recommended once the first backup works. Future backups will write to both places.</small>
              </span>
            </label>
            {enableSecondCopy && (
              <StorageLocationForm
                state={secondForm}
                setState={setSecondForm}
                engine={engine}
                showPresets
                onMessage={setMessage}
              />
            )}
          </div>
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
            <div><span>Copies stored in</span><strong>{friendlyStorageName(primaryForm.repoType)}</strong></div>
            {enableSecondCopy && <div><span>Second copy</span><strong>{friendlyStorageName(secondForm.repoType)}</strong></div>}
            <div><span>Recovery check</span><strong>{healthType === "file" ? "File or folder exists" : "App page opens"}</strong></div>
          </div>

          <dl className="wizard-review">
            <div><dt>App name</dt><dd>{appName || "—"}</dd></div>
            <div><dt>Selection</dt><dd>{pathMode === "scan" ? `Scan (${selectedPaths.length} folders)` : "Manual entry"}</dd></div>
            <div><dt>Backup type</dt><dd>{recipeType}</dd></div>
            <div><dt>Paths</dt><dd>{parsePaths(backupPaths).join(", ") || "—"}</dd></div>
            <div><dt>Engine</dt><dd>{engine.toUpperCase()}</dd></div>
            <div><dt>Vault</dt><dd>{primaryForm.repoName} ({primaryForm.repoType})</dd></div>
            <div><dt>Location</dt><dd>{primaryForm.repoLocation}</dd></div>
            {enableSecondCopy && <div><dt>Second copy</dt><dd>{secondForm.repoName} ({secondForm.repoType})</dd></div>}
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
          <button type="button" className="primary" onClick={submit} disabled={!writeAccess || saving || completed}>
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
  goTo,
  writeAccess
}: {
  state: DashboardState;
  summaries: AppSummary[];
  refresh: () => Promise<void>;
  goTo: (route: CoachRoute, task?: CoachTask) => void;
  writeAccess: boolean;
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

function Schedule({ state, summaries, refresh, writeAccess }: { state: DashboardState; summaries: AppSummary[]; refresh: () => Promise<void>; writeAccess: boolean }) {
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
        <button className="primary" disabled={!writeAccess}><CalendarClock /> Save schedule</button>
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

function Alerts({ state, summaries, refresh, writeAccess }: { state: DashboardState; summaries: AppSummary[]; refresh: () => Promise<void>; writeAccess: boolean }) {
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
      <div className="section-title alerts-toolbar">
        <p className="page-lead compact">
          {activeAlerts.length === 0
            ? "Nothing needs your attention right now."
            : `${activeAlerts.length} active alert${activeAlerts.length === 1 ? "" : "s"} need review.`}
        </p>
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

function Notifications({ state, refresh, highlightSetup = false, writeAccess }: { state: DashboardState; refresh: () => Promise<void>; highlightSetup?: boolean; writeAccess: boolean }) {
  const [message, setMessage] = useFlashMessage();
  const [migrateMessage, setMigrateMessage] = useFlashMessage();
  const [alertType, setAlertType] = useState<"email" | "webhook" | "slack" | "discord" | "telegram" | "pagerduty">("email");
  const [testing, setTesting] = useState(false);
  const [weeklySending, setWeeklySending] = useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const resticOk = state.environment.resticAvailable ?? false;
  const kopiaOk = state.environment.kopiaAvailable ?? false;

  useEffect(() => {
    if (!highlightSetup) return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [highlightSetup]);

  function buildConfig(form: FormData) {
    if (alertType === "webhook" || alertType === "slack" || alertType === "discord") {
      return { url: String(form.get("url")) };
    }
    if (alertType === "telegram") {
      return { token: String(form.get("token")), chatId: String(form.get("chatId")) };
    }
    if (alertType === "pagerduty") {
      return { routingKey: String(form.get("routingKey")) };
    }
    return {
      host: String(form.get("host")),
      port: String(form.get("port")),
      from: String(form.get("from")),
      to: String(form.get("to")),
      user: String(form.get("user")),
      pass: String(form.get("pass"))
    };
  }

  async function testDraft(form: FormData) {
    setTesting(true);
    setMessage("");
    try {
      await api.post("/api/notifications/test", { type: alertType, config: buildConfig(form) });
      setMessage("Test alert sent. Check your inbox or channel.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send test alert");
    } finally {
      setTesting(false);
    }
  }

  async function testSaved(targetId: string) {
    setTesting(true);
    setMessage("");
    try {
      await api.post(`/api/notifications/${targetId}/test`);
      await refresh();
      setMessage("Test alert sent using the saved target.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send test alert");
    } finally {
      setTesting(false);
    }
  }

  async function submit(form: FormData) {
    try {
      await api.post("/api/notifications", {
        name: String(form.get("name")),
        type: alertType,
        enabled: true,
        config: buildConfig(form)
      });
      await refresh();
      setMessage("Alerts turned on. BackupProof will tell you when something needs attention.");
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

  async function sendWeeklySummaryNow() {
    setWeeklySending(true);
    setMessage("");
    try {
      const result = await api.post("/api/analytics/recovery/weekly-summary");
      if (result.skipped === "no-email-targets") {
        setMessage("Add an email alert target first, then try again.");
      } else if (result.sent > 0) {
        setMessage(`Weekly summary sent to ${result.sent} email target${result.sent === 1 ? "" : "s"}.`);
      } else {
        setMessage("Weekly summary was not sent. It may have already gone out this week.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send weekly summary");
    } finally {
      setWeeklySending(false);
    }
  }

  return (
    <section className="schedule-layout">
      {highlightSetup && (
        <div className="banner info notification-coach-banner">
          Recovery coach sent you here. Add one email or chat alert so silent backup failures do not stay hidden.
        </div>
      )}
      <form ref={formRef} className={`wizard compact notification-form ${highlightSetup ? "highlighted" : ""}`} action={(form) => void submit(form)}>
        <WizardSection icon={<Bell />} title="Turn on alerts">
          <p className="muted notification-intro">Get a plain-language message when a backup fails, a recovery check goes stale, or storage stops responding.</p>
          <input name="name" placeholder="Alert name, e.g. Email me" required />
          <label className="wizard-field full">
            <span className="wizard-label">How should BackupProof reach you?</span>
            <select value={alertType} onChange={(e) => setAlertType(e.target.value as typeof alertType)}>
              <option value="email">Email</option>
              <option value="slack">Slack</option>
              <option value="discord">Discord</option>
              <option value="telegram">Telegram</option>
              <option value="webhook">Webhook</option>
              <option value="pagerduty">PagerDuty</option>
            </select>
          </label>
          {(alertType === "webhook" || alertType === "slack" || alertType === "discord") && (
            <input name="url" placeholder={alertType === "slack" ? "Slack incoming webhook URL" : alertType === "discord" ? "Discord webhook URL" : "Webhook URL"} required />
          )}
          {alertType === "telegram" && (
            <>
              <input name="token" placeholder="Telegram bot token" required />
              <input name="chatId" placeholder="Telegram chat id" required />
            </>
          )}
          {alertType === "pagerduty" && <input name="routingKey" placeholder="PagerDuty routing key" required />}
          {alertType === "email" && (
            <>
              <input name="host" placeholder="SMTP host" required />
              <input name="port" placeholder="SMTP port (587)" required />
              <input name="from" placeholder="From email" required />
              <input name="to" placeholder="Send alerts to" required />
              <input name="user" placeholder="SMTP username" />
              <input name="pass" type="password" placeholder="SMTP password" />
            </>
          )}
        </WizardSection>
        <div className="notification-actions">
          <button type="button" onClick={(event) => {
            event.preventDefault();
            const form = (event.currentTarget.closest("form") as HTMLFormElement | null);
            if (form) void testDraft(new FormData(form));
          }} disabled={testing || !writeAccess}><Bell /> {testing ? "Sending test..." : "Send test alert"}</button>
          <button className="primary" disabled={!writeAccess}><Bell /> Save alerts</button>
        </div>
        <FlashBanner message={message} onDismiss={() => setMessage("")} />
      </form>
      <aside className="schedule-side">
        <h2>What you will be told about</h2>
        <div className="schedule-app"><strong>Backup saved</strong><span>When scheduled backups finish successfully.</span></div>
        <div className="schedule-app"><strong>Recovery check failed</strong><span>When BackupProof cannot prove a backup works.</span></div>
        <div className="schedule-app"><strong>Storage problem</strong><span>When backup storage cannot be reached.</span></div>
        <div className="schedule-app"><strong>Missed schedule</strong><span>When a backup or check does not run on time.</span></div>
        <h2>Weekly recovery summary</h2>
        <p className="muted">Every Monday morning, BackupProof emails a plain-language recovery summary to enabled email targets.</p>
        <button type="button" className="ghost-button" onClick={() => void sendWeeklySummaryNow()} disabled={weeklySending || !writeAccess}>
          <Bell /> {weeklySending ? "Sending..." : "Send weekly summary now"}
        </button>
        <h2>Delivery targets</h2>
        {state.notificationTargets.length === 0 ? (
          <p className="muted">No alert targets yet.</p>
        ) : state.notificationTargets.map((target) => (
          <div className="schedule-app" key={target.id}>
            <strong>{target.name}</strong>
            <span>{target.type} · {target.enabled ? "enabled" : "disabled"}</span>
            <span>Last delivery: {target.lastDeliveryAt ? `${target.lastDeliveryStatus ?? "unknown"} at ${time(target.lastDeliveryAt)}` : "never"}</span>
            <button type="button" className="ghost-button" onClick={() => void testSaved(target.id)} disabled={testing}>Send test</button>
          </div>
        ))}
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
      </aside>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
