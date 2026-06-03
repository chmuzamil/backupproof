import { brand } from "../shared/brand";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { Store } from "./store";

export async function ensureDemoApp(store: Store) {
  const state = store.snapshot();
  const existing = state.apps.find((app) => app.name === "Demo Notes Folder");
  if (existing) return existing;

  const demoRoot = path.join(config.dataDir, "demo", "notes");
  const vaultRoot = path.join(config.dataDir, "demo", "vault");
  const proofFile = path.join(demoRoot, "welcome.txt");
  await fs.mkdir(demoRoot, { recursive: true });
  await fs.writeFile(
    proofFile,
    [
      `${brand.name} demo`,
      "This file proves the backup can be restored.",
      `Created at ${new Date().toISOString()}`
    ].join("\n")
  );

  const policy = state.policies[0] ?? await store.upsertPolicy({
    name: "Demo proof policy",
    backupCron: "0 2 * * *",
    restoreTestCron: "0 4 * * 0",
    proofFreshnessHours: 24 * 8,
    retention: { keepDaily: 3, keepWeekly: 1, keepMonthly: 0 }
  });

  const repository = await store.upsertRepository({
    name: "Demo local vault",
    engine: "frd",
    type: "local",
    location: vaultRoot,
    passwordSecretId: await store.putSecret("demo-vault-passphrase")
  });

  return store.upsertApp({
    name: "Demo Notes Folder",
    composePath: "",
    projectName: "demo-notes",
    services: [],
    safeRestoreServices: [],
    recipeType: "compose-files",
    backupPaths: [demoRoot],
    healthChecks: [
      {
        id: "demo-proof-file",
        type: "file",
        target: proofFile,
        expected: "backup can be restored"
      }
    ],
    repositoryId: repository.id,
    policyId: policy.id
  });
}
