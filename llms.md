# BackupProof LLM Context

BackupProof is an open-source, self-hosted backup and recovery dashboard.

Its core promise is simple: a backup should only look safe when it has been restored and checked. The product phrase is:

> Every backup earns its trust.

## What BackupProof Is

BackupProof is a friendly recovery dashboard for self-hosters, families, homelabs, and small teams. It helps users protect files, self-hosted app data, Docker Compose projects, databases, and CMS websites.

The main user question BackupProof answers is:

**Can I actually get my data back?**

BackupProof is not positioned as another low-level backup engine. It is a dashboard and workflow layer focused on recovery proof, calm disaster recovery, and making backup safety understandable to non-technical users.

## Current Product Direction

BackupProof started as a wrapper concept around tools like restic and Kopia, but the current app uses its own built-in backup process by default. Restic and Kopia are optional advanced or migration add-ons.

The product is currently focused on single-server self-hosted use. Kubernetes, multi-host orchestration, and remote agents are future directions.

**Current release:** v13.1.x — unified top bar (page titles in header, no duplicate h2 on pages), mobile hamburger nav, single **Backup health** panel on Dashboard (stats + **Show history**), auto-dismissing job-failure toasts, first-run wizard polish, friendly job alert titles. v13.0 adds login UI, Profile page, `.env` loading, immutable S3/B2 toggle, and friendly validation errors.

## Main Pages

### Dashboard

The Dashboard shows:

- Recovery Coach checklist with one best next step
- **Backup health** panel at the top — headline, summary, stats (ready / attention / protected / since last test), optional **Do this next** card
- **Show history** (collapsed by default) — 30/90-day restore-test chart, per-item save and test log, practice recoveries, report download
- Protected backup cards with simple timing (“Last saved … · Last tested …”)
- **Technical details** on each card — snapshot count, backup point ID, storage, checks (no per-card history charts)
- Activity log on the right / bottom

Do not duplicate history UI on cards. One history section only.

When a job fails, a bottom-right toast auto-dismisses after ~4.5s (for example “Recovery check failed”). Persistent alerts live on the **Alerts** page.

### App shell / navigation

- Sidebar: BackupProof branding and main nav
- Top bar: current page title + subtitle, system status, alert count, account, sign out
- Mobile: hamburger opens slide-in sidebar with backdrop; body scroll locked while open
- Page routes do not repeat the page title in the body (subtitle only in top bar)

### Protect Data

The Protect Data page is a wizard for adding something important to backups.

The flow is:

1. Choose data
2. Save copies
3. Pick a recovery check
4. Finish

It supports storage presets (this computer, USB, Google Drive, SFTP, S3, B2), test connection before saving, optional second copy, and immutable storage toggle for S3/B2.

### Recovery

The Recovery page helps users restore data without needing to understand backup internals.

It supports restore preflight, selected file restore, portable packages, recovery drills, runbooks, and evidence bundles.

### Schedule

Controls backup and recovery-check timing, retention, and related policy choices.

### Alerts / Notifications

Email, Slack, Discord, Telegram, webhook, and PagerDuty targets. Includes send-test alerts, friendly templates, weekly recovery summary email (Mondays), and coach deep-link into alert setup. Does **not** include password or user management — that lives on **Profile**.

Job failures create alerts with friendly titles (for example “Recovery check failed” not `restore-test failed`).

### Profile

Visible when `FRD_AUTH_ENABLED=true` and the user is signed in.

- **Change password** — current + new + confirm; minimum 5 characters
- **User management** (admin only) — list users, create accounts, change roles, delete users (cannot delete self or last admin)

Sidebar link **Profile** and top-bar username both open this page.

### Authentication

When `FRD_AUTH_ENABLED=true`:

- Login screen with username/password
- Default sign-in `admin` / `admin` until changed
- First-run admin bootstrap flow (replaces default admin)
- Optional OIDC SSO when issuer/client env vars are set
- Sign out from the top bar
- Viewer/auditor roles are read-only in the UI
- Password hashes use `backupproof-auth-v1:` scheme (not tied to `FRD_ENCRYPTION_KEY`); legacy hashes migrate on login

Config loads from `.env` in project root via `server/loadEnv.ts`. See `.env.example`.

### First-run wizard

Modal shown when no apps are protected and user has not dismissed it. Three steps: protect data, run demo, set up alerts. Styled with step numbers, icon badges, primary/secondary buttons.

## Backup And Recovery Concepts

### Built-In Backup Engine

The built-in engine is the default. It supports encrypted backup data, manifests, integrity checks, deduplication by content, and storage backends such as local folders, SFTP, S3-compatible storage, Backblaze B2, and Google Drive.

### Recovery Proof

A recovery proof means BackupProof restored a backup and verified it.

### Green Check Meaning

The green check does not mean "a backup job succeeded." It means the latest eligible backup was restored and checked within the configured freshness window.

## Important UX Principles

- Use plain language first.
- Prefer "Protect data", "Check recovery", "Recover files", "Ready to restore", and "Download a copy" over technical labels.
- Avoid leading with "confidence score", "analytics", "drill", or "proof" in primary UI copy.
- Keep advanced details behind accordions, collapsed sections, or **Show history**.
- Give one clear next action when possible.
- Assume users may not know what Docker, mounts, cron, snapshots, or database dumps mean.
- One page title in the top bar — do not add duplicate headings in page body.
- Flash banners and job toasts auto-dismiss; use Alerts page for persistent problems.

## Important Security Principles

- Credentials are encrypted at rest.
- Do not display discovered database passwords.
- Do not place local backup storage inside the folders being protected.
- Treat the BackupProof data directory and encryption key as sensitive.
- Enable `FRD_AUTH_ENABLED` for anything beyond trusted homelab use.
- Change default admin password after first login via Profile.

## Key Code Areas

- `src/main.tsx` — App shell, top bar, Dashboard, wizards, FlashBanner, job-failure toast, Backup health panel
- `src/auth.tsx` — Login screen, session token, role helpers
- `src/profile.tsx` — Password change and user management UI
- `src/storageSetup.tsx` — Storage presets and second-copy modal
- `src/styles.css` — Layout, top bar, mobile nav, first-run modal, toast host
- `server/api.ts` — REST routes including auth and users
- `server/auth.ts` — Password hashing, sessions, RBAC
- `server/jobs.ts` — Job runner; creates friendly-titled alerts on failure
- `server/loadEnv.ts` — `.env` file loading
- `shared/schemas.ts` — Zod validation (`MIN_PASSWORD_LENGTH = 5`)
- `shared/validation.ts` — Friendly Zod error formatting
- `shared/notificationCopy.ts` — Friendly alert titles including job failure labels
- `shared/recoveryAnalytics.ts` — Analytics data + plain-language health copy
- `tests/` — Vitest test suite

## Development Commands

```bash
cp .env.example .env
npm install
npm run dev
npm test
npm run build
```

Development UI: `http://localhost:5173` (API proxied to `8787`)  
Production UI: `http://localhost:8787`

## Current Quality Baseline

- 28 test files pass
- 77 tests pass
- Production dependency audit reports 0 vulnerabilities
