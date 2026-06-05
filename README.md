# BackupProof

![GitHub release](https://img.shields.io/github/v/release/chmuzamil/backupproof?include_prereleases)
![License](https://img.shields.io/github/license/chmuzamil/backupproof)
![Stars](https://img.shields.io/github/stars/chmuzamil/backupproof)

![BackupProof - Every backup earns its trust](banner.png)

> Every backup earns its trust.

BackupProof is an open-source, self-hosted backup and recovery dashboard for people who want to know one thing with confidence:

**Can I actually get my data back?**

Most backup tools tell you a backup completed. BackupProof goes further. It saves backup copies, restores them safely, checks the recovered data, and only shows the green recovery check when recovery has been proven.

BackupProof is designed for both non-technical and technical self-hosters:

- A family can protect photos, documents, downloads, and desktop files.
- A homelab user can protect app folders, Docker Compose projects, and databases.
- A small business can keep recovery notes, practice restores, and downloadable proof.
- A maintainer can inspect backup points, restore selected files, and export evidence.

## Current Version

**v13.1.0** polishes the dashboard shell and notification UX on top of v13:

- **Unified top bar** — page title and subtitle in the header (no duplicate titles on each page), sticky frosted bar, compact status toolbar
- **Mobile navigation** — hamburger menu, slide-in sidebar, and responsive layouts across Dashboard, Protect data, Alerts, Profile, and Recovery
- **Single Backup health panel** — one summary at the top with stats, next action, and **Show history** (no duplicate per-card history charts)
- **Technical details simplified** — backup cards keep metadata only; restore-test trends live in the shared history section
- **Job failure toasts** — auto-dismissing toast when a job fails (for example recovery check failed); full alerts remain on the Alerts page
- **First-run wizard polish** — clearer spacing, step labels, and consistent primary/secondary buttons
- **Friendlier job alert titles** — “Recovery check failed” instead of raw `restore-test failed`

**v13.0.0** adds sign-in, profile management, and a simpler dashboard for non-technical users:

- **Login and sessions** — sign-in screen when `FRD_AUTH_ENABLED=true`, default admin bootstrap, optional OIDC SSO, sign out
- **Profile page** — change your password and manage users (admin: add, change roles, delete)
- **`.env` support** — load config from project root; Docker Compose uses `env_file: .env`
- **Simpler dashboard** — plain-language backup health status with charts and history behind **Show history**
- **Immutable storage UI** — optional object lock toggle for S3 and Backblaze B2 vaults
- **Friendlier validation** — readable password and form errors instead of raw JSON

v12 foundations still included: storage presets, second-copy wizard, recovery analytics reports, weekly summary emails, Recovery Coach deep-links, first-run wizard, and notification polish.

v11 foundations still included: Recovery Coach, built-in engine, Google Drive/SFTP/S3/B2/local storage, portable backups, recovery kit, drills, runbooks, evidence bundles, and CMS discovery.

## Product Promise

A backup is not "ready" just because it finished.

BackupProof treats a backup as ready only after it has been restored and checked. The dashboard's green recovery check means BackupProof restored the latest eligible backup and verified it with configured checks.

## What BackupProof Does

### Friendly Dashboard

- Shows what data is protected
- Shows the last backup and last recovery check in plain language
- Highlights items that need attention first
- Gives one clear next step via Recovery Coach
- **Backup health** at the top — headline, stats, next action, and optional history in one panel
- Keeps technical metadata on each card behind **Technical details**
- Auto-dismissing toasts when jobs fail; persistent alerts on the Alerts page
- Mobile-friendly layout with hamburger navigation on small screens
- Moves the activity log to the bottom of the page

### Profile (when sign-in is enabled)

Open **Profile** from the sidebar or click your username in the top bar:

- **Change password** — update the password you use to sign in
- **User management** (admin only) — add users, change roles, remove accounts

Default sign-in is `admin` / `admin` until you change it. Passwords must be at least 5 characters.

### Recovery Coach

The Recovery Coach turns backup safety into a simple checklist:

- Choose important data
- Run the first backup
- Check that recovery works
- Add a second place for backup copies
- Turn on alerts
- Save a safe restore location

It gives a readiness score, one best next step, and deep-links into storage and alert setup so users are not left guessing.

### Backup Health (Dashboard)

When items are protected, the Dashboard shows one **Backup health** panel at the top:

- Plain-language headline (for example, “Your backup is ready to restore”)
- Stats: ready count, need attention, protected, and time since the last restore test
- **Do this next** action when something needs fixing
- **Show history** expands 30/90-day restore-test charts, per-item save/test log, practice recoveries, and report download

Per-app cards no longer duplicate history charts; open **Technical details** on a card for snapshot IDs and storage metadata only.

A **weekly recovery summary** email is sent every Monday morning to enabled email targets. You can also send it manually from **Notifications**.

### Protect Data Wizard

The Protect Data page is built around ordinary decisions:

1. Choose data
2. Save copies
3. Pick a recovery check
4. Finish

It supports:

- Personal files and folders
- Self-hosted app folders
- Docker Compose projects
- Installed or running CMS sites such as WordPress, Drupal, Joomla, Ghost, and Nextcloud
- PostgreSQL databases
- MySQL and MariaDB databases
- Guided folder discovery
- A small file browser for choosing folders and files without typing paths
- **Storage presets** with plain-language labels (this computer, USB, cloud, SFTP, S3, B2)
- **Test connection** before saving storage
- **Optional second copy** during setup
- Advanced setup for technical users

When BackupProof detects a CMS, it can fill in the full site folder and the database details it can safely read. It does not display database passwords discovered from config files or container environment variables.

### Recovery Page

The Recovery page helps users get data back without needing to understand backup internals:

- Choose what to recover
- Pick where recovered files should go
- Check the restore before starting
- Recover everything or selected files
- Download a portable backup
- Restore from a downloaded backup
- Practice a recovery drill
- Save trusted restore places
- Download recovery instructions and evidence bundles

## Core Features

### Built-In Backup Engine

BackupProof includes its own backup engine. No Restic, Kopia, or external backup binary is required for the default experience.

The built-in engine supports:

- Incremental backups
- Encrypted backup data
- Manifest-based tracking
- Deduplication by content
- Integrity checks
- Local storage
- SFTP
- S3-compatible storage
- Backblaze B2
- Google Drive through OAuth

### Optional External Engines

Restic and Kopia are optional add-ons. If they are installed, BackupProof can detect them and import existing repositories for migration or advanced use.

### Recovery Proof

BackupProof can verify recovery with:

- File or folder checks
- Expected text checks
- App health page checks
- Database checks
- Checksum verification after restore

### Portable Backups

Portable backup downloads package restored data into a `.tar.gz` file with recovery metadata. These can be moved to another device or server and restored without the original BackupProof storage connection.

### Recovery Kit

The encrypted `.bpkit` recovery kit helps move BackupProof itself to a fresh server.

It includes:

- Protected data definitions
- Storage connections and encrypted credentials
- Backup schedules
- Notification settings
- Recovery check history

It does not include user accounts, active sessions, job logs, alerts, audit history, or fleet tokens.

### Recovery Evidence

BackupProof can produce:

- Recovery drill reports
- App recovery runbooks
- Evidence bundles with recent reports and latest proof
- Proof history for recovery checks

### Alerts And Operations

BackupProof supports:

- Email notifications
- Webhook notifications
- Slack, Discord, Telegram, and PagerDuty target types
- **Send test alert** before saving or on existing targets
- **Friendly alert templates** for backup and recovery events
- **Weekly recovery summary** email (Mondays at 9:00, server local time)
- Alerts for missed schedules, failed backups, failed recovery checks, stale proof, and storage problems
- Audit logs
- Role-based access control with login UI, sessions, and a Profile page for password and user management
- Backup safety checks before jobs run

## Quick Start

### Docker Compose

```bash
git clone https://github.com/chmuzamil/backupproof.git
cd backupproof
docker compose up -d --build
```

Open:

```text
http://localhost:8787
```

Before using it seriously, edit `docker-compose.yml` and set a strong `FRD_ENCRYPTION_KEY`. Keep this value stable across restarts because it encrypts stored credentials.

### Docker Compose Mounts

The included compose file uses:

| Mount | Purpose |
| ----- | ------- |
| `frd-data:/data` | BackupProof state, credentials, job history, and metadata |
| `/:/host:ro` | Read-only access to host files for backup and discovery |

When protecting host files from inside Docker, use `/host` paths. For example:

```text
/host/home/alex/photos
/host/var/www
/host/opt/my-app/data
```

Optional container discovery:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

### Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

The dev command starts:

- Web UI on `http://localhost:5173`
- API on `http://localhost:8787`

### Production Without Docker

```bash
npm install
npm run build
npm start
```

Open:

```text
http://localhost:8787
```

Set `FRD_DATA_DIR` and `FRD_ENCRYPTION_KEY` for persistent encrypted storage.

### Environment file (`.env`)

Copy the example file and edit it:

```bash
cp .env.example .env
```

BackupProof loads `.env` from the project root on startup. Values already set in the shell or in `docker-compose.yml` `environment:` take precedence.

Example for local auth:

```text
FRD_AUTH_ENABLED=true
FRD_ENCRYPTION_KEY=your-long-random-secret
```

After enabling auth, sign in with the default `admin` / `admin`, then open **Profile** to change the password and add other users.

With Docker Compose, the same `.env` file is used automatically via `env_file`.

### Update An Existing Server

After pulling a new release:

```bash
cd backupproof
git pull
npm install
npm run build
npm start
```

With Docker Compose:

```bash
cd backupproof
git pull
docker compose up -d --build
```

Keep `FRD_ENCRYPTION_KEY` unchanged across updates so stored credentials remain readable.

## Configuration

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT` | `8787` | HTTP server port |
| `FRD_DATA_DIR` | `.data` or `/data` in Docker | Persistent data directory |
| `FRD_ENCRYPTION_KEY` | Dev fallback | Encrypts stored credentials |
| `FRD_MAX_CONCURRENT_JOBS` | `3` | Maximum parallel jobs |
| `FRD_NATIVE_MAX_BYTES` | `5368709120` | Built-in engine size limit guard |
| `FRD_BANDWIDTH_LIMIT_KBPS` | `0` | Default bandwidth limit, where supported |
| `FRD_AUTH_ENABLED` | `false` | Enables built-in auth middleware |
| `FRD_OIDC_ISSUER` | unset | OIDC issuer URL |
| `FRD_OIDC_CLIENT_ID` | unset | OIDC client ID |
| `FRD_OIDC_CLIENT_SECRET` | unset | OIDC client secret |
| `RESTIC_BINARY` | `restic` | Optional Restic binary path |
| `KOPIA_BINARY` | `kopia` | Optional Kopia binary path |

## How To Use

### 1. Protect Data

Open **Protect data** and choose what matters:

- Use **Help me choose** for common folders.
- If a website or CMS is found, choose **Protect this website**.
- Use **Browse folders** to click through the machine and add folders or files.
- Use **Advanced setup** for app folders, Docker Compose projects, and databases.
- Pick a **storage preset**, then use **Test connection** if needed.
- Optionally enable **Save a second copy** for offsite protection.
- Pick one simple recovery check.
- Finish the wizard.

### 2. Run The First Backup

Open **Dashboard** and run the first backup for the protected item.

### 3. Check Recovery

Run a recovery check. BackupProof restores a safe copy and verifies that the recovered data works.

### 4. Watch The Green Check

The green check appears only after BackupProof has successfully recovered and checked the backup.

### 5. Add A Second Place

For stronger protection, add a second storage location such as:

- An attached drive
- Another server over SFTP
- S3-compatible storage
- Backblaze B2
- Google Drive

Use **Add second copy** on the Dashboard (Recovery Coach or app card), or enable it during **Protect data** setup.

## Recovery Workflows

### Restore Files

Open **Recovery**, choose an item, choose a backup point, pick a restore location, and run the ready check before restoring.

### Restore Selected Files

BackupProof can browse backup contents, search files, compare backup points, and restore only selected files.

### Download A Backup

Use **Download a copy** on the Recovery page to create a portable `.tar.gz` package.

The package includes:

- Restored data under `data/`
- `backup-proof-export.json` metadata
- Source paths and export timestamp

### Restore A Downloaded Backup

Use **Restore from a downloaded copy** on the Recovery page. BackupProof validates the archive and rejects unsafe paths before extraction.

### Move BackupProof To A New Server

Use **Move BackupProof to a new server** on the Recovery page.

1. Download a setup kit from the old server.
2. Start BackupProof on the new server.
3. Load the setup kit with the same passphrase.
4. Reconnect storage if needed.
5. Run a recovery check.

## Google Drive Storage

Google Drive support uses OAuth and the narrow `drive.file` scope. BackupProof can manage files it creates.

Setup:

1. Create a Google Cloud project.
2. Enable the Google Drive API.
3. Create a Web application OAuth client.
4. In **Protect data**, choose **Google Drive**.
5. Enter the OAuth client ID and secret.
6. Select **Connect Google Drive**.
7. Add the displayed redirect URL to the OAuth client if Google asks for it.
8. Finish the wizard and run the first backup.

OAuth refresh tokens are encrypted in the BackupProof data directory.

## CLI

```bash
npm run cli -- status
npm run cli -- backup run <appId>
npm run cli -- proof run <appId>
npm run cli -- restore <appId> --snapshot <id>
```

## API

The OpenAPI document is available at:

```text
http://localhost:8787/api/docs/openapi.json
```

Useful API areas include:

- Apps
- Repositories (including `POST /api/repositories/test`)
- Secondary storage (`PUT /api/apps/:id/secondary-storage`)
- Policies
- Jobs
- Recovery
- Recovery analytics (`GET /api/analytics/recovery`)
- Auth (`POST /api/auth/login`, `POST /api/auth/password`, `GET /api/auth/status`)
- Users (`GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id`) — admin only
- Portable import and export
- Recovery kit import and export
- Notifications (including test alerts and weekly summary)
- Alerts
- Audit logs

## Project Layout

| Path | Purpose |
| ---- | ------- |
| `src/` | React dashboard (`main.tsx`, `auth.tsx`, `profile.tsx`, `storageSetup.tsx`) |
| `server/` | Express API, jobs, backup engines, recovery workflows, `.env` loading |
| `shared/` | Shared types, schemas, validation, readiness, and branding |
| `cli/` | Command-line interface |
| `tests/` | Vitest unit and integration tests |
| `agent/` | Early agent scripts for future remote workflows |
| `scripts/` | Packaging and build helper scripts |

## Quality Checks

```bash
npm test
npm run build
npm audit --omit=dev
```

Current local status after the v13.1 release:

- 28 test files passing
- 77 tests passing
- 0 production dependency vulnerabilities

## Security Notes

BackupProof is self-hosted software that can access sensitive files and credentials. Treat the data directory and encryption key carefully.

BackupProof protects against common backup mistakes:

- Blocks local backup storage placed inside protected data
- Checks selected paths are readable
- Estimates source size before backup
- Checks local free space before backup
- Encrypts stored credentials
- Encrypts recovery kits with a separate passphrase
- Validates portable archive paths before restore
- Keeps audit logs for sensitive actions

Recommended practices:

- Use a strong `FRD_ENCRYPTION_KEY`
- Keep a copy of the encryption key outside the server
- Store at least one backup copy away from the main server
- Run recovery checks regularly
- Download a recovery kit after major configuration changes
- Turn on notifications so silent failures do not stay hidden

## What BackupProof Is Not

BackupProof is not trying to be another low-level backup engine race.

It is a friendly recovery dashboard that makes backup safety visible. The built-in engine is the default path, while Restic and Kopia remain optional migration and advanced-use integrations.

V1 through v13 focus on a single-server self-hosted workflow. Kubernetes, remote agents, and multi-host orchestration are future directions.

## Roadmap

Planned areas:

- Official Docker image on GHCR and one-command install packages
- Remote agents
- Kubernetes support
- Team workflows

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, guidelines, and pull request expectations.

Bug reports, feature ideas, and pull requests are welcome on [GitHub Issues](https://github.com/chmuzamil/backupproof/issues).

## License

This project is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 [chmuzamil](https://github.com/chmuzamil)
