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

**v11.0.0** focuses on a friendlier product experience:

- Plain-language Dashboard, Protect Data, and Recovery pages
- Recovery Coach score and checklist
- Guided "what should I do next?" actions
- Built-in backup engine as the default path
- Google Drive, SFTP, S3, B2, and local storage support
- Portable backup downloads and imports
- Recovery kit for moving BackupProof to a new server
- Recovery drills, reports, runbooks, and evidence bundles
- CMS-aware discovery for WordPress, Drupal, Joomla, Ghost, and Nextcloud

## Product Promise

A backup is not "ready" just because it finished.

BackupProof treats a backup as ready only after it has been restored and checked. The dashboard's green recovery check means BackupProof restored the latest eligible backup and verified it with configured checks.

## What BackupProof Does

### Friendly Dashboard

- Shows what data is protected
- Shows the last backup and last recovery check
- Highlights items that need help first
- Gives a plain-language next step
- Keeps technical details behind expandable sections
- Moves the activity log to the bottom of the page

### Recovery Coach

The Recovery Coach turns backup safety into a simple checklist:

- Choose important data
- Run the first backup
- Check that recovery works
- Add a second place for backup copies
- Turn on alerts
- Save a safe restore location

It gives a readiness score and one best next step so users are not left guessing.

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
- Alerts for missed schedules, failed backups, failed recovery checks, stale proof, and storage problems
- Audit logs
- Role-based access control
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
- Use **Advanced setup** for app folders, Docker Compose projects, and databases.
- Choose where backup copies should live.
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
- Repositories
- Policies
- Jobs
- Recovery
- Portable import and export
- Recovery kit import and export
- Notifications
- Alerts
- Audit logs

## Project Layout

| Path | Purpose |
| ---- | ------- |
| `src/` | React dashboard |
| `server/` | Express API, jobs, backup engines, recovery workflows |
| `shared/` | Shared types, schemas, readiness, and branding |
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

Current local status after the v11 README update:

- 20 test files passing
- 58 tests passing
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

V1 through v11 focus on a single-server self-hosted workflow. Kubernetes, remote agents, and multi-host orchestration are future directions.

## Roadmap

Planned areas:

- Easier one-command install packages
- More non-technical storage setup
- Better notification templates
- Remote agents
- Kubernetes support
- Immutable storage controls
- Team workflows
- Recovery analytics

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, guidelines, and pull request expectations.

Bug reports, feature ideas, and pull requests are welcome on [GitHub Issues](https://github.com/chmuzamil/backupproof/issues).

## License

This project is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 [chmuzamil](https://github.com/chmuzamil)
