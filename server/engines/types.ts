import type { App, Policy, Repository } from "../../shared/types";

export interface EngineSnapshot {
  id: string;
  appId: string;
  appName: string;
  createdAt: string;
  archivePath: string;
  sourcePaths: string[];
  sizeBytes: number;
  shortId?: string;
}

export interface PruneResult {
  kept: number;
  pruned: number;
}

export interface EngineContext {
  passwordSecret?: string;
  credentialSecret?: string;
}

export interface BackupEngineAdapter {
  backup(
    app: App,
    repository: Repository,
    sourcePaths: string[],
    onLine: (line: string) => void,
    ctx: EngineContext
  ): Promise<EngineSnapshot>;
  restore(
    app: App,
    repository: Repository,
    snapshotId: string,
    targetDir: string,
    onLine: (line: string) => void,
    ctx: EngineContext,
    options?: { paths?: string[] }
  ): Promise<void>;
  listSnapshots(app: App, repository: Repository, ctx: EngineContext): Promise<EngineSnapshot[]>;
  prune(
    app: App,
    repository: Repository,
    policy: Policy,
    onLine: (line: string) => void,
    ctx: EngineContext
  ): Promise<PruneResult>;
  check(repository: Repository, onLine: (line: string) => void, ctx: EngineContext): Promise<void>;
}
