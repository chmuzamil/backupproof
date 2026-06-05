import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function projectRootFromModule(moduleUrl: string) {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..");
}

export function loadEnvFile(filename = ".env", cwd = process.cwd()) {
  const filePath = path.resolve(cwd, filename);
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    const existing = process.env[key];
    if (existing === undefined || existing === "") {
      process.env[key] = value;
    }
  }

  return true;
}

export function parseEnvBoolean(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}
