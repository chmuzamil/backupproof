import fs from "node:fs/promises";
import { config } from "./config";
import { detectExternalEngines } from "./engineAvailability";
import type { EnvironmentStatus } from "../shared/types";

export async function checkEnvironment(): Promise<EnvironmentStatus> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let dataDirWritable = true;
  try {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(`${config.dataDir}/.write-test`, new Date().toISOString());
    await fs.rm(`${config.dataDir}/.write-test`, { force: true });
  } catch (error) {
    dataDirWritable = false;
    errors.push(error instanceof Error ? error.message : "Data directory is not writable");
  }

  const engines = await detectExternalEngines();
  const availableEngines: EnvironmentStatus["availableEngines"] = ["frd"];
  if (engines.resticAvailable) availableEngines.push("restic");
  if (engines.kopiaAvailable) availableEngines.push("kopia");

  if (engines.resticAvailable) {
    warnings.push(`Restic detected (${engines.resticVersion}). You can use it for vaults or import existing Restic repositories.`);
  }
  if (engines.kopiaAvailable) {
    warnings.push(`Kopia detected (${engines.kopiaVersion}). You can use it for vaults or import existing Kopia repositories.`);
  }

  return {
    dataDirWritable,
    checkedAt: new Date().toISOString(),
    errors,
    warnings,
    resticAvailable: engines.resticAvailable,
    kopiaAvailable: engines.kopiaAvailable,
    resticVersion: engines.resticVersion,
    kopiaVersion: engines.kopiaVersion,
    resticPath: engines.resticPath,
    kopiaPath: engines.kopiaPath,
    availableEngines
  };
}
