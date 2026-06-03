import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  dataDir: process.env.FRD_DATA_DIR ?? path.resolve(process.cwd(), ".data"),
  encryptionKey: process.env.FRD_ENCRYPTION_KEY ?? "dev-only-change-this-secret-value",
  publicDir: path.resolve(process.cwd(), "dist/public"),
  resticBinary: process.env.RESTIC_BINARY ?? "restic",
  kopiaBinary: process.env.KOPIA_BINARY ?? "kopia",
  maxConcurrentJobs: Number(process.env.FRD_MAX_CONCURRENT_JOBS ?? 3),
  nativeEngineMaxBytes: Number(process.env.FRD_NATIVE_MAX_BYTES ?? 5 * 1024 * 1024 * 1024),
  defaultBandwidthLimitKbps: Number(process.env.FRD_BANDWIDTH_LIMIT_KBPS ?? 0),
  authEnabled: process.env.FRD_AUTH_ENABLED === "true",
  oidcIssuer: process.env.FRD_OIDC_ISSUER,
  oidcClientId: process.env.FRD_OIDC_CLIENT_ID,
  oidcClientSecret: process.env.FRD_OIDC_CLIENT_SECRET
};
