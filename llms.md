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

## Main Pages

### Dashboard

The Dashboard shows:

- Protected items
- Last backup
- Last recovery check
- Recovery confidence
- Alerts and next steps
- A green recovery check only when recovery has been proven
- An activity log at the bottom

The dashboard intentionally keeps technical details behind expandable sections.

### Protect Data

The Protect Data page is a wizard for adding something important to backups.

The flow is:

1. Choose data
2. Save copies
3. Pick a recovery check
4. Finish

It supports:

- Personal folders
- Manually selected files and folders
- A small file browser for choosing folders and files without typing paths
- Self-hosted app folders
- Docker Compose projects
- PostgreSQL databases
- MySQL and MariaDB databases
- CMS websites: WordPress, Drupal, Joomla, Ghost, and Nextcloud

The simple mode scans for common folders and discovered websites. Long technical lists, such as running services, should be hidden behind accordions or advanced sections.

The file browser lists one folder at a time and lets users add either the current folder or a specific file. It should remain compact, friendly, and secondary to the main "Help me choose" flow.

When a CMS is detected, BackupProof should offer a plain action such as **Protect this website** or **Protect site and database**. That action should fill in the site folder and database settings when safely available. Database passwords must not be displayed if discovered from config files or container environment variables.

### Recovery

The Recovery page helps users restore data without needing to understand backup internals.

It supports:

- Choosing an item to recover
- Choosing a backup point
- Running a preflight check
- Restoring all files or selected files
- Downloading a portable backup package
- Importing a downloaded backup package
- Saving trusted restore destinations
- Running recovery drills
- Creating recovery reports and evidence bundles
- Downloading a recovery kit for moving BackupProof to a new server

### Schedule

The Schedule page controls backup and recovery-check timing, retention, and related policy choices.

### Alerts / Notifications

BackupProof supports email and webhook notifications plus Slack, Discord, Telegram, and PagerDuty target types. Alerts cover failed backups, failed recovery checks, stale proof, missed schedules, storage problems, and credential/configuration issues.

## Backup And Recovery Concepts

### Built-In Backup Engine

The built-in engine is the default. It supports encrypted backup data, manifests, integrity checks, deduplication by content, and storage backends such as local folders, SFTP, S3-compatible storage, Backblaze B2, and Google Drive.

### Recovery Proof

A recovery proof means BackupProof restored a backup and verified it. Verification can include file checks, text checks, HTTP checks, database checks, and checksum comparison after restore.

### Green Check Meaning

The green check does not mean "a backup job succeeded." It means the latest eligible backup was restored and checked within the configured freshness window.

## Important UX Principles

- Use plain language first.
- Prefer "Protect data", "Check recovery", "Recover files", and "Download a copy" over technical labels.
- Keep advanced details behind accordions or details sections.
- Avoid showing long service or container lists by default.
- Give one clear next action when possible.
- Assume users may not know what Docker, mounts, cron, snapshots, or database dumps mean.
- Technical users should still have access to advanced fields and logs.

## Important Security Principles

- Credentials are encrypted at rest.
- Do not display discovered database passwords.
- Do not place local backup storage inside the folders being protected.
- Validate restore/archive paths before extraction.
- Treat the BackupProof data directory and encryption key as sensitive.
- Recovery kits are encrypted with a separate passphrase.

## Key Code Areas

- `src/`: React web UI
- `server/`: Express API, backup engines, jobs, discovery, recovery flows
- `shared/`: Shared types, schemas, product copy, readiness and recovery helpers
- `tests/`: Vitest test suite
- `cli/`: Command-line interface

Relevant current discovery code:

- `server/discovery.ts`: host, service, Docker, database, and CMS discovery
- `server/api.ts`: `/api/filesystem/browse` endpoint for the Protect Data file browser
- `shared/types.ts`: `DiscoveryResult`, `DiscoveredCmsApp`, and related types
- `src/main.tsx`: Protect Data wizard and user-facing discovery UI

## Development Commands

```bash
npm install
npm run dev
npm test
npm run build
npm audit --omit=dev
```

Development UI:

```text
http://localhost:5173
```

Production UI:

```text
http://localhost:8787
```

## Current Quality Baseline

At the time this file was added:

- 20 test files pass
- 58 tests pass
- Production dependency audit reports 0 vulnerabilities
