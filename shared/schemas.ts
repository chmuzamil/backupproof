import { z } from "zod";

export const healthCheckSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["file", "http", "container", "database"]),
  target: z.string().min(1),
  expected: z.string().optional()
});

export const appInputSchema = z.object({
  name: z.string().min(1),
  composePath: z.string().default(""),
  projectName: z.string().default(""),
  services: z.array(z.string().min(1)).default([]),
  safeRestoreServices: z.array(z.string().min(1)).default([]),
  recipeType: z.enum(["compose-files", "postgres", "mysql", "docker-compose"]),
  backupPaths: z.array(z.string().min(1)).min(1),
  database: z
    .object({
      service: z.string().optional().default(""),
      host: z.string().optional(),
      port: z.coerce.number().int().positive().optional(),
      database: z.string().min(1),
      username: z.string().min(1),
      password: z.string().optional(),
      dumpPath: z.string().optional(),
      dumpCommand: z.string().optional()
    })
    .optional(),
  healthChecks: z.array(healthCheckSchema).default([]),
  repositoryId: z.string().min(1),
  secondaryRepositoryIds: z.array(z.string()).default([]),
  policyId: z.string().min(1),
  proofPaths: z.array(z.string()).default([])
});

export const repositoryInputSchema = z.object({
  name: z.string().min(1),
  engine: z.enum(["frd", "native", "restic", "kopia"]).default("frd"),
  type: z.enum(["local", "sftp", "s3", "b2", "google-drive"]),
  location: z.string().min(1),
  password: z.string().min(8, "Vault passphrase must be at least 8 characters").optional(),
  credentials: z.record(z.string()).optional(),
  googleConnectionId: z.string().optional(),
  objectLock: z.boolean().default(false),
  bandwidthLimitKbps: z.number().int().min(0).default(0)
});

export const policyInputSchema = z.object({
  name: z.string().min(1),
  backupCron: z.string().min(5),
  restoreTestCron: z.string().min(5),
  proofFreshnessHours: z.number().int().min(1).max(24 * 30),
  retention: z.object({
    keepDaily: z.number().int().min(1),
    keepWeekly: z.number().int().min(0),
    keepMonthly: z.number().int().min(0)
  }),
  bandwidthLimitKbps: z.number().int().min(0).default(0)
});

export const notificationInputSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["email", "webhook", "slack", "discord", "telegram", "pagerduty"]),
  enabled: z.boolean().default(true),
  config: z.record(z.string())
});

export const restoreDestinationTemplateInputSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  description: z.string().optional(),
  appId: z.string().optional()
});

export const loginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const userInputSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
  role: z.enum(["admin", "operator", "viewer", "auditor"]).default("operator")
});

export const agentRegisterSchema = z.object({
  name: z.string().min(1),
  hostname: z.string().min(1),
  platform: z.string().min(1),
  token: z.string().min(16)
});

export const drRunSchema = z.object({
  scenario: z.enum(["lost-server", "corrupted-disk", "ransomware"]).default("lost-server"),
  snapshotId: z.string().optional(),
  targetDir: z.string().optional()
});
