import { config } from "./config";
import { runCommand } from "./shell";

export interface ExternalEngineStatus {
  resticAvailable: boolean;
  kopiaAvailable: boolean;
  resticVersion?: string;
  kopiaVersion?: string;
  resticPath: string;
  kopiaPath: string;
}

export async function detectExternalEngines(): Promise<ExternalEngineStatus> {
  const resticPath = config.resticBinary;
  const kopiaPath = config.kopiaBinary;

  const restic = await runCommand(resticPath, ["version"]);
  const kopia = await runCommand(kopiaPath, ["--version"]);

  const resticAvailable = restic.code === 0;
  const kopiaAvailable = kopia.code === 0;

  return {
    resticAvailable,
    kopiaAvailable,
    resticVersion: resticAvailable ? (restic.stdout.split("\n")[0] ?? "").trim() : undefined,
    kopiaVersion: kopiaAvailable ? (kopia.stdout.split("\n")[0] ?? kopia.stderr.split("\n")[0] ?? "").trim() : undefined,
    resticPath,
    kopiaPath
  };
}

export async function assertExternalEngine(engine: "restic" | "kopia") {
  const status = await detectExternalEngines();
  if (engine === "restic" && !status.resticAvailable) {
    throw new Error(`Restic is not installed. Install Restic or set RESTIC_BINARY (tried: ${status.resticPath}).`);
  }
  if (engine === "kopia" && !status.kopiaAvailable) {
    throw new Error(`Kopia is not installed. Install Kopia or set KOPIA_BINARY (tried: ${status.kopiaPath}).`);
  }
  return status;
}
