/** @deprecated Use server/engines/frd — kept for test compatibility */
export type { EngineSnapshot as NativeSnapshot } from "./types";
export { frdEngine as nativeEngine } from "./frd";
import { frdEngine } from "./frd";
import type { App, Policy, Repository } from "../../shared/types";

export async function nativeBackup(app: App, repository: Repository, sourcePaths: string[], onLine: (line: string) => void, credentialSecret?: string) {
  return frdEngine.backup(app, repository, sourcePaths, onLine, { credentialSecret, passwordSecret: credentialSecret });
}

export async function nativeSnapshots(app: App, repository: Repository, credentialSecret?: string) {
  return frdEngine.listSnapshots(app, repository, { credentialSecret, passwordSecret: credentialSecret });
}

export async function nativeRestore(app: App, repository: Repository, snapshotId: string, targetDir: string, onLine: (line: string) => void, credentialSecret?: string) {
  return frdEngine.restore(app, repository, snapshotId, targetDir, onLine, { credentialSecret, passwordSecret: credentialSecret });
}

export async function nativePrune(app: App, repository: Repository, keepCount: number, onLine: (line: string) => void, credentialSecret?: string) {
  const policy = { retention: { keepDaily: keepCount, keepWeekly: 0, keepMonthly: 0 } } as Policy;
  return frdEngine.prune(app, repository, policy, onLine, { credentialSecret, passwordSecret: credentialSecret });
}
