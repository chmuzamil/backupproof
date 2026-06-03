import { config } from "./config";
import { runCommand } from "./shell";

export interface ResticSnapshot {
  id: string;
  short_id: string;
  time: string;
  paths: string[];
  tags: string[];
}

export function resticBinary() {
  return config.resticBinary;
}

export async function runRestic(
  args: string[],
  onLine: (line: string) => void,
  env: NodeJS.ProcessEnv = process.env
) {
  const result = await runCommand(resticBinary(), args, onLine, env);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `restic exited with code ${result.code}`);
  }
  return result;
}

export async function resticSnapshots(repoUrl: string, password: string, tag: string, onLine: (line: string) => void) {
  const result = await runRestic(
    ["-r", repoUrl, "snapshots", "--tag", tag, "--json"],
    onLine,
    { ...process.env, RESTIC_PASSWORD: password }
  );
  if (!result.stdout.trim()) return [] as ResticSnapshot[];
  return JSON.parse(result.stdout) as ResticSnapshot[];
}
