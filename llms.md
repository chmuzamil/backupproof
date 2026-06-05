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

**Current release:** v13.x with login UI, Profile page (password + user management), `.env` config loading, simplified dashboard copy, collapsed backup health analytics, immutable storage toggle for S3/B2, and friendly validation errors.

## Main Pages

### Dashboard

The Dashboard shows:

- Recovery Coach checklist with one best next step
- **At a glance** status in plain language (ready vs needs attention)
- Protected backup cards with simple timing (“Last saved … · Last tested …”)
- Compact **Backup health** summary at the bottom (collapsed by default; expand for charts and history)
- An activity log on the right / bottom

Technical metrics (confidence %, drill timelines, bar charts) stay behind **View backup history**. Assume non-technical users never expand that section unless they ask.

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
- Keep advanced details behind accordions, collapsed sections, or **View backup history**.
- Give one clear next action when possible.
- Assume users may not know what Docker, mounts, cron, snapshots, or database dumps mean.

## Important Security Principles

- Credentials are encrypted at rest.
- Do not display discovered database passwords.
- Do not place local backup storage inside the folders being protected.
- Treat the BackupProof data directory and encryption key as sensitive.
- Enable `FRD_AUTH_ENABLED` for anything beyond trusted homelab use.
- Change default admin password after first login via Profile.

## Key Code Areas

- `src/main.tsx` — Dashboard, wizards, most pages
- `src/auth.tsx` — Login screen, session token, role helpers
- `src/profile.tsx` — Password change and user management UI
- `src/storageSetup.tsx` — Storage presets and second-copy modal
- `server/api.ts` — REST routes including auth and users
- `server/auth.ts` — Password hashing, sessions, RBAC
- `server/loadEnv.ts` — `.env` file loading
- `shared/schemas.ts` — Zod validation (`MIN_PASSWORD_LENGTH = 5`)
- `shared/validation.ts` — Friendly Zod error formatting
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
