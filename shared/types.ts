export type RecipeType = "compose-files" | "postgres" | "mysql" | "docker-compose";
export type BackupEngine = "frd" | "native" | "restic" | "kopia";
export type RepositoryType = "local" | "sftp" | "s3" | "b2";
export type JobType = "backup" | "check" | "prune" | "restore-test" | "manual-restore" | "dr-run";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type NotificationType = "email" | "webhook" | "slack" | "discord" | "telegram" | "pagerduty";
export type AlertSeverity = "info" | "warning" | "critical";
export type UserRole = "admin" | "operator" | "viewer" | "auditor";

export interface HealthCheck {
  id: string;
  type: "file" | "http" | "container" | "database";
  target: string;
  expected?: string;
}

export interface DatabaseConfig {
  service: string;
  host?: string;
  port?: number;
  database: string;
  username: string;
  passwordSecretId?: string;
  dumpPath?: string;
  dumpCommand?: string;
}

export interface App {
  id: string;
  name: string;
  composePath: string;
  projectName: string;
  services: string[];
  safeRestoreServices: string[];
  recipeType: RecipeType;
  backupPaths: string[];
  database?: DatabaseConfig;
  healthChecks: HealthCheck[];
  repositoryId: string;
  secondaryRepositoryIds?: string[];
  policyId: string;
  proofPaths?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Repository {
  id: string;
  name: string;
  engine: BackupEngine;
  type: RepositoryType;
  location: string;
  credentialSecretId?: string;
  passwordSecretId?: string;
  objectLock?: boolean;
  bandwidthLimitKbps?: number;
  lastCheckAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Policy {
  id: string;
  name: string;
  backupCron: string;
  restoreTestCron: string;
  proofFreshnessHours: number;
  retention: {
    keepDaily: number;
    keepWeekly: number;
    keepMonthly: number;
  };
  bandwidthLimitKbps?: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobLog {
  at: string;
  line: string;
}

export interface Job {
  id: string;
  type: JobType;
  appId?: string;
  repositoryId?: string;
  status: JobStatus;
  logs: JobLog[];
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  snapshotId?: string;
  requestedSnapshotId?: string;
  restoreTargetDir?: string;
  error?: string;
}

export interface ChecksumResult {
  path: string;
  passed: boolean;
  message: string;
}

export interface RestoreProof {
  id: string;
  appId: string;
  snapshotId: string;
  testedAt: string;
  expiresAt: string;
  status: "passed" | "failed" | "stale";
  healthResults: Array<{
    checkId: string;
    passed: boolean;
    message: string;
  }>;
  checksumResults?: ChecksumResult[];
  confidenceScore?: number;
  reportPath?: string;
}

export interface NotificationTarget {
  id: string;
  name: string;
  type: NotificationType;
  enabled: boolean;
  configSecretId?: string;
  lastDeliveryAt?: string;
  lastDeliveryStatus?: "succeeded" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  appId?: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  createdAt: string;
  acknowledgedAt?: string;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  userId?: string;
  username?: string;
  action: string;
  detail: string;
  at: string;
}

export interface FleetAgent {
  id: string;
  name: string;
  hostname: string;
  platform: string;
  token: string;
  lastSeenAt?: string;
  registeredAt: string;
}

export interface EnvironmentStatus {
  dataDirWritable: boolean;
  checkedAt: string;
  errors: string[];
  warnings: string[];
  resticAvailable?: boolean;
  kopiaAvailable?: boolean;
  resticVersion?: string;
  kopiaVersion?: string;
  resticPath?: string;
  kopiaPath?: string;
  availableEngines?: BackupEngine[];
}

export interface DashboardState {
  apps: App[];
  repositories: Repository[];
  policies: Policy[];
  jobs: Job[];
  restoreProofs: RestoreProof[];
  notificationTargets: NotificationTarget[];
  alerts: Alert[];
  users: User[];
  auditLog: AuditEntry[];
  agents: FleetAgent[];
  environment: EnvironmentStatus;
}

export interface AppSummary {
  app: App;
  repository?: Repository;
  policy?: Policy;
  latestBackup?: Job;
  latestRestoreTest?: Job;
  restoreProof?: RestoreProof;
  snapshotCount: number;
  latestSnapshot?: {
    id: string;
    createdAt: string;
    sizeBytes: number;
  };
  alerts: Alert[];
  restorable: boolean;
  confidenceScore: number;
}

export interface SnapshotSummary {
  id: string;
  appId: string;
  appName: string;
  createdAt: string;
  archivePath: string;
  sourcePaths: string[];
  sizeBytes: number;
  shortId?: string;
}

export interface DiscoveredPath {
  path: string;
  label: string;
  reason: string;
  exists: boolean;
  recommended: boolean;
}

export interface DiscoveredService {
  name: string;
  displayName?: string;
  hint: string;
}

export interface DiscoveredMount {
  source: string;
  destination: string;
  type: string;
}

export interface DiscoveredContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  mounts: DiscoveredMount[];
  composeProject?: string;
  composeFile?: string;
  suggestedPaths: string[];
  databaseEngine?: "postgres" | "mysql" | "mariadb";
}

export interface DiscoveredDatabase {
  id: string;
  engine: "postgres" | "mysql" | "mariadb";
  name: string;
  host: string;
  port: number;
  source: "host" | "docker";
  containerName?: string;
  containerId?: string;
  username?: string;
  database?: string;
  databases: string[];
  dataPath?: string;
  hint: string;
}

export interface DiscoveryResult {
  checkedAt: string;
  host: {
    platform: NodeJS.Platform;
    homeDir: string;
  };
  defaultAppName: string;
  defaultVaultPath: string;
  paths: DiscoveredPath[];
  services: DiscoveredService[];
  containers: DiscoveredContainer[];
  databases: DiscoveredDatabase[];
  dockerAvailable: boolean;
  warnings: string[];
}

export interface DrReport {
  appId: string;
  appName: string;
  scenario: string;
  snapshotId: string;
  restoredAt: string;
  proofStatus: string;
  confidenceScore: number;
  steps: string[];
}
