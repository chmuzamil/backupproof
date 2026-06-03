import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { config } from "./config";
import { runCommand } from "./shell";
import type {
  DiscoveredContainer,
  DiscoveredDatabase,
  DiscoveredMount,
  DiscoveredPath,
  DiscoveredService,
  DiscoveryResult
} from "../shared/types";

interface PathCandidate {
  path: string;
  label: string;
  reason: string;
  recommended?: boolean;
}

interface DockerInspectRecord {
  Id?: string;
  Name?: string;
  Config?: {
    Image?: string;
    Env?: string[];
    Labels?: Record<string, string>;
  };
  Mounts?: Array<{ Type?: string; Source?: string; Destination?: string }>;
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  };
  State?: { Status?: string };
}

export function uniquePathCandidates(candidates: PathCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = path.normalize(candidate.path).replace(/[\\/]+$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function envFromDockerConfig(env: string[] | undefined) {
  const out: Record<string, string> = {};
  for (const line of env ?? []) {
    const index = line.indexOf("=");
    if (index > 0) out[line.slice(0, index)] = line.slice(index + 1);
  }
  return out;
}

export function classifyDatabaseImage(image: string): "postgres" | "mysql" | "mariadb" | undefined {
  const value = image.toLowerCase();
  if (/(^|[/:])postgres/.test(value)) return "postgres";
  if (/mariadb/.test(value)) return "mariadb";
  if (/mysql/.test(value)) return "mysql";
  return undefined;
}

export function parseDockerInspectRecord(raw: unknown): DiscoveredContainer | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as DockerInspectRecord;
  const id = record.Id;
  const name = (record.Name ?? "").replace(/^\//, "");
  const image = record.Config?.Image ?? "unknown";
  if (!id || !name) return null;

  const labels = record.Config?.Labels ?? {};
  const composeFile = labels["com.docker.compose.project.config_files"]?.split(",")[0]?.trim();
  const mounts: DiscoveredMount[] = (record.Mounts ?? [])
    .filter((mount) => mount.Source && mount.Destination)
    .map((mount) => ({
      type: mount.Type ?? "volume",
      source: mount.Source ?? "",
      destination: mount.Destination ?? ""
    }));

  const suggestedPaths = uniquePathCandidates(
    mounts
      .filter((mount) => mount.type === "bind" && mount.source)
      .map((mount) => ({
        path: mount.source,
        label: name,
        reason: `Bind mount from container ${name}`
      }))
  ).map((item) => item.path);

  return {
    id,
    name,
    image,
    status: record.State?.Status ?? "unknown",
    mounts,
    composeProject: labels["com.docker.compose.project"],
    composeFile: composeFile || undefined,
    suggestedPaths,
    databaseEngine: classifyDatabaseImage(image)
  };
}

export function hostPortFromInspect(record: DockerInspectRecord, containerPort: number) {
  const key = `${containerPort}/tcp`;
  const bindings = record.NetworkSettings?.Ports?.[key];
  if (!bindings?.length) return containerPort;
  const hostPort = Number(bindings[0]?.HostPort);
  return Number.isFinite(hostPort) && hostPort > 0 ? hostPort : containerPort;
}

async function pathExists(candidate: PathCandidate): Promise<DiscoveredPath> {
  try {
    const stat = await fs.stat(candidate.path);
    return { ...candidate, exists: stat.isDirectory() || stat.isFile(), recommended: candidate.recommended ?? true };
  } catch {
    return { ...candidate, exists: false, recommended: false };
  }
}

function windowsCandidates(homeDir: string): PathCandidate[] {
  return [
    { path: path.join(homeDir, "Documents"), label: "Documents", reason: "Often contains personal files, exports, and app configs." },
    { path: path.join(homeDir, "Desktop"), label: "Desktop", reason: "Common place for work-in-progress files." },
    { path: path.join(homeDir, "Pictures"), label: "Pictures", reason: "Usually hard to recreate if lost." },
    { path: path.join(homeDir, "Downloads"), label: "Downloads", reason: "Useful if installers, exports, or invoices live here.", recommended: false },
    { path: "C:\\ProgramData", label: "ProgramData", reason: "Some Windows services store shared application data here.", recommended: false },
    { path: "C:\\inetpub\\wwwroot", label: "IIS web root", reason: "Default IIS site folder when IIS is installed.", recommended: false }
  ];
}

function unixCandidates(homeDir: string): PathCandidate[] {
  return [
    { path: path.join(homeDir, "Documents"), label: "Documents", reason: "Often contains personal files, exports, and app configs." },
    { path: path.join(homeDir, "Desktop"), label: "Desktop", reason: "Common place for work-in-progress files.", recommended: false },
    { path: "/srv", label: "Self-hosted data", reason: "Common home for Compose projects and app data." },
    { path: "/opt", label: "Installed apps", reason: "Many self-hosted apps keep config or data below this folder." },
    { path: "/var/www", label: "Web sites", reason: "Common web root for hosted sites." },
    { path: "/var/lib", label: "Service data", reason: "Databases and server tools often keep state here.", recommended: false }
  ];
}

async function detectWindowsServices(): Promise<DiscoveredService[]> {
  const script = [
    "Get-Service",
    "| Where-Object { $_.Status -eq 'Running' }",
    "| Select-Object -First 35 Name,DisplayName",
    "| ConvertTo-Json -Compress"
  ].join(" ");
  const result = await runCommand("powershell", ["-NoProfile", "-Command", script]);
  if (result.code !== 0 || !result.stdout.trim()) return [];
  const parsed = JSON.parse(result.stdout) as Array<{ Name?: string; DisplayName?: string }> | { Name?: string; DisplayName?: string };
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items
    .filter((item) => item.Name)
    .map((item) => ({
      name: item.Name ?? "service",
      displayName: item.DisplayName,
      hint: serviceHint(`${item.Name ?? ""} ${item.DisplayName ?? ""}`)
    }));
}

async function detectUnixServices(): Promise<DiscoveredService[]> {
  const systemctl = await runCommand("systemctl", ["list-units", "--type=service", "--state=running", "--no-pager", "--plain", "--no-legend"]);
  if (systemctl.code === 0 && systemctl.stdout.trim()) {
    return systemctl.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, 35)
      .map((line) => {
        const name = line.trim().split(/\s+/)[0] ?? "service";
        return { name, displayName: name.replace(/\.service$/, ""), hint: serviceHint(name) };
      });
  }

  const ps = await runCommand("sh", ["-lc", "ps -eo comm= | sort -u | head -35"]);
  if (ps.code !== 0) return [];
  return ps.stdout
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, hint: serviceHint(name) }));
}

export function serviceHint(text: string) {
  const value = text.toLowerCase();
  if (/(postgres|pgsql)/.test(value)) return "Database detected. Add its data folder or use the PostgreSQL recipe.";
  if (/(mysql|mariadb)/.test(value)) return "Database detected. Add its data folder or use the MySQL/MariaDB recipe.";
  if (/(nginx|apache|httpd|iis)/.test(value)) return "Web server detected. Check web roots and uploaded media folders.";
  if (/(docker|containerd)/.test(value)) return "Container runtime detected. Look for Compose projects and mounted volumes.";
  if (/(redis|mongo|minio|vault)/.test(value)) return "Stateful service detected. Confirm where it stores persistent data.";
  return "Running now. If it keeps important data, add its data folder.";
}

async function detectServices(warnings: string[]) {
  try {
    return process.platform === "win32" ? await detectWindowsServices() : await detectUnixServices();
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Could not detect running services");
    return [];
  }
}

function probePort(host: string, port: number, timeoutMs = 1500) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function dockerAvailable() {
  const result = await runCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
  return result.code === 0;
}

async function detectDockerContainers(warnings: string[]): Promise<{ containers: DiscoveredContainer[]; rawRecords: DockerInspectRecord[] }> {
  const available = await dockerAvailable();
  if (!available) return { containers: [], rawRecords: [] };

  const ps = await runCommand("docker", ["ps", "-q"]);
  if (ps.code !== 0) {
    if (ps.stderr.trim()) warnings.push(`Docker scan skipped: ${ps.stderr.trim()}`);
    return { containers: [], rawRecords: [] };
  }

  const ids = ps.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (ids.length === 0) return { containers: [], rawRecords: [] };

  const inspect = await runCommand("docker", ["inspect", ...ids]);
  if (inspect.code !== 0 || !inspect.stdout.trim()) {
    warnings.push("Could not inspect running Docker containers.");
    return { containers: [], rawRecords: [] };
  }

  try {
    const records = JSON.parse(inspect.stdout) as unknown;
    const rawRecords = (Array.isArray(records) ? records : [records]) as DockerInspectRecord[];
    const containers = rawRecords.map(parseDockerInspectRecord).filter((item): item is DiscoveredContainer => Boolean(item));
    return { containers, rawRecords };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Could not parse Docker container metadata");
    return { containers: [], rawRecords: [] };
  }
}

export function parseDatabaseList(stdout: string) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((name) => !["information_schema", "mysql", "performance_schema", "sys", "template0", "template1"].includes(name));
}

async function listPostgresDatabases(user: string, host: string, port: number, containerId?: string) {
  const result = containerId
    ? await runCommand("docker", ["exec", containerId, "psql", "-U", user, "-tAc", "SELECT datname FROM pg_database WHERE datistemplate = false AND datallowconn"])
    : await runCommand("psql", ["-h", host, "-p", String(port), "-U", user, "-tAc", "SELECT datname FROM pg_database WHERE datistemplate = false AND datallowconn"]);
  if (result.code !== 0) return [];
  return parseDatabaseList(result.stdout);
}

async function listMysqlDatabases(user: string, host: string, port: number, containerId?: string) {
  const sql = "SHOW DATABASES";
  const result = containerId
    ? await runCommand("docker", ["exec", containerId, "mysql", "-u", user, "-N", "-e", sql])
    : await runCommand("mysql", ["-h", host, "-P", String(port), "-u", user, "-N", "-e", sql]);
  if (result.code !== 0) return [];
  return parseDatabaseList(result.stdout);
}

function dataPathFromMounts(mounts: DiscoveredMount[], engine: "postgres" | "mysql" | "mariadb") {
  const targets = engine === "postgres"
    ? ["/var/lib/postgresql/data", "/var/lib/postgresql"]
    : ["/var/lib/mysql", "/var/lib/mariadb"];
  for (const mount of mounts) {
    if (mount.type === "bind" && targets.some((target) => mount.destination === target || mount.destination.startsWith(`${target}/`))) {
      return mount.source;
    }
  }
  const volumeMount = mounts.find((mount) =>
    mount.type === "volume" && /postgres|mysql|mariadb|db/i.test(`${mount.destination} ${mount.source}`)
  );
  return volumeMount?.source;
}

async function databasesFromContainers(containers: DiscoveredContainer[], rawRecords: DockerInspectRecord[]) {
  const databases: DiscoveredDatabase[] = [];

  for (const container of containers) {
    if (!container.databaseEngine) continue;
    const record = rawRecords.find((item) => item.Id === container.id);
    const env = envFromDockerConfig(record?.Config?.Env);
    const engine = container.databaseEngine === "mariadb" ? "mysql" : container.databaseEngine;
    const defaultPort = engine === "postgres" ? 5432 : 3306;
    const port = record ? hostPortFromInspect(record, defaultPort) : defaultPort;
    const username = engine === "postgres"
      ? env.POSTGRES_USER ?? "postgres"
      : env.MYSQL_USER ?? "root";
    const preferredDb = engine === "postgres" ? env.POSTGRES_DB : env.MYSQL_DATABASE;
    const databasesListed = engine === "postgres"
      ? await listPostgresDatabases(username, "127.0.0.1", port, container.id)
      : await listMysqlDatabases(username, "127.0.0.1", port, container.id);

    databases.push({
      id: `docker-${container.id}`,
      engine,
      name: container.composeProject ? `${container.composeProject} (${container.name})` : container.name,
      host: "127.0.0.1",
      port,
      source: "docker",
      containerName: container.name,
      containerId: container.id,
      username,
      database: preferredDb ?? databasesListed[0],
      databases: databasesListed,
      dataPath: dataPathFromMounts(container.mounts, container.databaseEngine),
      hint: databasesListed.length
        ? `Docker ${engine} container with ${databasesListed.length} database(s).`
        : `Docker ${engine} container detected. Credentials may be required to list databases.`
    });
  }

  return databases;
}

async function detectHostDatabases(warnings: string[]) {
  const databases: DiscoveredDatabase[] = [];
  const checks = [
    { engine: "postgres" as const, port: 5432, user: "postgres" },
    { engine: "mysql" as const, port: 3306, user: "root" }
  ];

  for (const check of checks) {
    const open = await probePort("127.0.0.1", check.port);
    if (!open) continue;

    const listed = check.engine === "postgres"
      ? await listPostgresDatabases(check.user, "127.0.0.1", check.port)
      : await listMysqlDatabases(check.user, "127.0.0.1", check.port);

    databases.push({
      id: `host-${check.engine}-${check.port}`,
      engine: check.engine,
      name: `Host ${check.engine} on port ${check.port}`,
      host: "127.0.0.1",
      port: check.port,
      source: "host",
      username: check.user,
      database: listed[0],
      databases: listed,
      hint: listed.length
        ? `Native ${check.engine} server with ${listed.length} database(s).`
        : `Port ${check.port} is open. Install client tools or provide credentials to list databases.`
    });
  }

  if (databases.length === 0) return databases;

  try {
    const dataRoots = process.platform === "win32"
      ? ["C:\\Program Files\\PostgreSQL", "C:\\ProgramData\\MySQL"]
      : ["/var/lib/postgresql", "/var/lib/mysql", "/var/lib/mariadb"];
    for (const db of databases) {
      for (const root of dataRoots) {
        try {
          await fs.access(root);
          db.dataPath = root;
          break;
        } catch {
          // try next root
        }
      }
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Could not locate database data folders");
  }

  return databases;
}

async function detectDatabases(containers: DiscoveredContainer[], rawRecords: DockerInspectRecord[], warnings: string[]) {
  const dockerDbs = await databasesFromContainers(containers, rawRecords);
  const hostDbs = await detectHostDatabases(warnings);
  const seen = new Set<string>();
  return [...dockerDbs, ...hostDbs].filter((item) => {
    const key = `${item.source}:${item.engine}:${item.port}:${item.containerId ?? "host"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function discoverHost(): Promise<DiscoveryResult> {
  const warnings: string[] = [];
  const homeDir = os.homedir();
  const candidates = process.platform === "win32" ? windowsCandidates(homeDir) : unixCandidates(homeDir);
  const paths = await Promise.all(uniquePathCandidates(candidates).map(pathExists));
  const services = await detectServices(warnings);
  const dockerOk = await dockerAvailable();
  const { containers, rawRecords } = dockerOk ? await detectDockerContainers(warnings) : { containers: [], rawRecords: [] };
  const databases = await detectDatabases(containers, rawRecords, warnings);

  return {
    checkedAt: new Date().toISOString(),
    host: {
      platform: process.platform,
      homeDir
    },
    defaultAppName: "My important files",
    defaultVaultPath: path.join(config.dataDir, "discovered-vault"),
    paths: paths.filter((item) => item.exists).sort((a, b) => Number(b.recommended) - Number(a.recommended)),
    services,
    containers,
    databases,
    dockerAvailable: dockerOk,
    warnings
  };
}
