import type { BackupEngine } from "../../shared/types";
import { frdEngine } from "./frd";
import { kopiaEngine } from "./kopia";
import { resticEngine } from "./restic";
import type { BackupEngineAdapter } from "./types";

const engines: Record<string, BackupEngineAdapter> = {
  frd: frdEngine,
  native: frdEngine,
  restic: resticEngine,
  kopia: kopiaEngine
};

export function normalizeEngine(engine: BackupEngine | string): BackupEngine {
  if (engine === "native") return "frd";
  return engine as BackupEngine;
}

export function getEngineAdapter(engine: BackupEngine | string): BackupEngineAdapter {
  const normalized = normalizeEngine(engine);
  const adapter = engines[normalized];
  if (!adapter) throw new Error(`Unknown backup engine: ${engine}`);
  return adapter;
}

export function engineContext(secrets: { passwordSecret?: string; credentialSecret?: string }) {
  return secrets;
}

export { frdEngine };
export type { BackupEngineAdapter, EngineSnapshot, EngineContext, PruneResult } from "./types";
