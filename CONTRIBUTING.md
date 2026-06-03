# Contributing to BackupProof

Thank you for helping improve **BackupProof** — *Every backup earns its trust.*

## Ways to contribute

- **Bug reports** — something broken, unclear errors, failed restore proof
- **Feature ideas** — engines, discovery, UI, alerts, DR workflows
- **Pull requests** — fixes, tests, docs, small features
- **Documentation** — README, setup guides, troubleshooting

## Before you start

1. Search [existing issues](https://github.com/chmuzamil/backupproof/issues) to avoid duplicates.
2. For large changes, open an issue first to agree on direction.
3. Keep PRs focused — one concern per pull request when possible.

## Development setup

```bash
git clone https://github.com/chmuzamil/backupproof.git
cd backupproof
npm install
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:8787

## Quality checks

Run these before opening a PR:

```bash
npm test
npm run build
npm run lint
```

All tests should pass. Avoid committing secrets (`.env`, vault passphrases, credentials).

## Project layout

| Path | Purpose |
|------|---------|
| `src/` | React UI |
| `server/` | Express API, jobs, engines, discovery |
| `shared/` | Types, schemas, branding |
| `cli/` | `frd` CLI |
| `tests/` | Vitest tests |

## Code guidelines

- Match existing style and naming in the file you edit.
- Prefer small, readable diffs over large refactors unless discussed first.
- Add or update tests when behavior changes.
- User-facing copy should match **BackupProof** branding (`shared/brand.ts`).

## Pull request checklist

- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] README or docs updated if behavior or setup changed
- [ ] No secrets or local `.data` files included

## Security

If you find a security issue, please **do not** open a public issue with exploit details. Contact the maintainer privately through GitHub.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
