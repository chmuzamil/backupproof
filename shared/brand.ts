export const brand = {
  name: "BackupProof",
  tagline: "Every backup earns its trust.",
  productDescription: "Verified backups with automatic restore proof.",
  engineName: "FRD",
  engineLabel: "FRD built-in",
  cliBinary: "frd",
  loadingMessage: "Loading BackupProof…"
} as const;

export function brandWordmarkParts() {
  return { prefix: "Backup", suffix: "Proof" };
}
