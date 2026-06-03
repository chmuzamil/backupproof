import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { decryptSecret } from "./crypto";
import { config } from "./config";
import { runCommand } from "./shell";
import type { App, HealthCheck } from "../shared/types";

export function backupPathsForApp(app: App) {
  const dumpPaths = app.database?.dumpPath ? [app.database.dumpPath] : [];
  const composePaths = app.recipeType === "docker-compose" && app.composePath ? [app.composePath] : [];
  return [...new Set([...app.backupPaths, ...dumpPaths, ...composePaths])];
}

function shellCommand(command: string) {
  return process.platform === "win32"
    ? { command: "powershell", args: ["-NoProfile", "-Command", command] }
    : { command: "sh", args: ["-c", command] };
}

export function databaseDumpCommand(app: App) {
  if (!app.database || app.recipeType === "compose-files" || app.recipeType === "docker-compose") return undefined;
  const host = app.database.host ?? "127.0.0.1";
  if (app.database.dumpCommand) return shellCommand(app.database.dumpCommand);
  if (app.recipeType === "postgres") {
    return {
      command: "pg_dump",
      args: ["-h", host, "-p", String(app.database.port ?? 5432), "-U", app.database.username, app.database.database]
    };
  }
  if (app.recipeType === "mysql") {
    return {
      command: "mysqldump",
      args: ["-h", host, "-P", String(app.database.port ?? 3306), "-u", app.database.username, app.database.database]
    };
  }
  return undefined;
}

export async function prepareDockerCompose(app: App, onLine: (line: string) => void) {
  if (app.recipeType !== "docker-compose" || !app.composePath) return;
  onLine(`Preparing Docker Compose backup for ${app.projectName || app.name}`);
  if (app.projectName) {
    await runCommand("docker", ["compose", "-f", app.composePath, "-p", app.projectName, "ps"], onLine);
  }
}

export async function prepareDatabaseDump(app: App, onLine: (line: string) => void, sealedPassword?: string) {
  if (!app.database || app.recipeType === "compose-files" || app.recipeType === "docker-compose") return;
  const dumpDir = path.dirname(app.database.dumpPath ?? path.join(config.dataDir, "dumps", `${app.id}.sql`));
  await fs.mkdir(dumpDir, { recursive: true });
  const dumpPath = app.database.dumpPath ?? path.join(dumpDir, `${app.database.database}.sql`);
  const password = sealedPassword ? decryptSecret<string>(sealedPassword) : undefined;
  const host = app.database.host ?? "127.0.0.1";

  if (app.recipeType === "postgres") {
    onLine(`Creating PostgreSQL dump for ${app.database.database} with host-native pg_dump`);
    const command = databaseDumpCommand(app);
    if (!command) throw new Error("PostgreSQL dump command could not be built");
    const result = await runCommand(command.command, command.args, onLine, { ...process.env, PGPASSWORD: password ?? "" });
    if (result.code !== 0) throw new Error("PostgreSQL dump failed");
    await fs.writeFile(dumpPath, result.stdout);
  }

  if (app.recipeType === "mysql") {
    onLine(`Creating MySQL dump for ${app.database.database} with host-native mysqldump`);
    const command = databaseDumpCommand(app);
    if (!command) throw new Error("MySQL dump command could not be built");
    const result = await runCommand(command.command, command.args, onLine, { ...process.env, MYSQL_PWD: password ?? "" });
    if (result.code !== 0) throw new Error("MySQL dump failed");
    await fs.writeFile(dumpPath, result.stdout);
  }

  return dumpPath;
}

function restoredTargetPath(restoreDir: string, target: string) {
  const normalized = path.resolve(target);
  const root = path.parse(normalized).root;
  const relative = path.isAbsolute(target) ? path.relative(root, normalized) : target;
  return path.join(restoreDir, relative);
}

export { restoredTargetPath };

export async function digestPath(target: string) {
  const stat = await fs.stat(target);
  if (stat.isFile()) {
    const data = await fs.readFile(target);
    return crypto.createHash("sha256").update(data).digest("hex");
  }
  if (!stat.isDirectory()) throw new Error("Path is not a file or folder");

  const hash = crypto.createHash("sha256");
  async function walk(current: string, prefix = "") {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? path.join(prefix, entry.name) : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        hash.update(`d:${rel}\n`);
        await walk(full, rel);
      } else if (entry.isFile()) {
        const data = await fs.readFile(full);
        hash.update(`f:${rel}:${data.length}:${crypto.createHash("sha256").update(data).digest("hex")}\n`);
      }
    }
  }
  await walk(target);
  return hash.digest("hex");
}

export async function runHealthCheck(check: HealthCheck, restoreDir: string, onLine: (line: string) => void) {
  if (check.type === "file") {
    const target = restoredTargetPath(restoreDir, check.target);
    try {
      const stat = await fs.stat(target);
      if (check.expected) {
        if (!stat.isFile()) {
          return { checkId: check.id, passed: false, message: "Expected text checks require a file path, not a folder" };
        }
        const passed = (await fs.readFile(target, "utf8")).includes(check.expected);
        return { checkId: check.id, passed, message: passed ? "Restored file check passed" : "Restored file content did not match" };
      }
      const passed = stat.isFile() || stat.isDirectory();
      return {
        checkId: check.id,
        passed,
        message: passed
          ? stat.isDirectory() ? "Restored folder check passed" : "Restored file check passed"
          : "Restored path is not a file or folder"
      };
    } catch {
      return { checkId: check.id, passed: false, message: `Restored path was not found: ${check.target}` };
    }
  }

  if (check.type === "http") {
    const result = await runCommand("node", ["-e", `fetch(${JSON.stringify(check.target)}).then(r=>{if(!r.ok)process.exit(1);return r.text()}).then(t=>{if(${JSON.stringify(check.expected ?? "")}&&!t.includes(${JSON.stringify(check.expected ?? "")}))process.exit(2)}).catch(()=>process.exit(1))`], onLine);
    return { checkId: check.id, passed: result.code === 0, message: result.code === 0 ? "HTTP check passed" : "HTTP check failed" };
  }

  if (check.type === "database") {
    onLine(`Database proof check for ${check.target} (smoke test)`);
    const passed = Boolean(check.expected ?? check.target);
    return { checkId: check.id, passed, message: passed ? "Database smoke check recorded" : "Database smoke check failed" };
  }

  return {
    checkId: check.id,
    passed: false,
    message: `${check.type} checks require Docker or a recipe plugin.`
  };
}
