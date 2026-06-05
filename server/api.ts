import express from "express";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { v4 as uuid } from "uuid";
import { buildRecoveryReadinessReport } from "../shared/recoveryAnalytics";
import {
  agentRegisterSchema,
  appInputSchema,
  drRunSchema,
  loginInputSchema,
  notificationInputSchema,
  notificationTestInputSchema,
  policyInputSchema,
  repositoryInputSchema,
  restoreDestinationTemplateInputSchema,
  secondaryStorageInputSchema,
  userInputSchema
} from "../shared/schemas";
import { deleteAllSnapshots, deleteApp } from "./appMaintenance";
import { auditExport, recordAudit } from "./auditLog";
import { auditAlerts } from "./alertAudit";
import { authMiddleware, createSession, destroySession, requireRole, verifyPassword } from "./auth";
import { inspectBackupSafetyCached } from "./backupSafety";
import { config } from "./config";
import { enrichSummary } from "./confidenceScore";
import { checkEnvironment } from "./environment";
import { assertExternalEngine, detectExternalEngines } from "./engineAvailability";
import { ensureDemoApp } from "./demo";
import { discoverHost } from "./discovery";
import { getEngineAdapter } from "./engines";
import { heartbeatAgent, registerAgent } from "./fleet";
import { consumeGoogleDriveConnection, finishGoogleDriveOAuth, startGoogleDriveOAuth } from "./googleDrive";
import { JobRunner } from "./jobs";
import { createRepositoryFromInput } from "./repositoryCreate";
import { testRepositoryConnection } from "./repositoryTest";
import { sendTestNotification, sendTestNotificationConfig } from "./notifications";
import { openApiSpec } from "./openapi";
import { createPortableExport } from "./portableExport";
import { restorePortableExport } from "./portableImport";
import { createRecoveryKit, openRecoveryKit } from "./recoveryKit";
import { listDrReports, readDrReport } from "./proofReport";
import { buildRecoveryRunbook, createEvidenceBundle } from "./recoveryEvidence";
import { inspectRestorePreflight } from "./restorePreflight";
import { getRecoveryAnalytics } from "./recoveryAnalytics";
import { sendWeeklyRecoverySummaries } from "./weeklySummary";
import { compareSnapshots, inspectSnapshotContents } from "./snapshotInspector";
import { Store } from "./store";
import type { AppSummary, FileBrowserEntry, FileBrowserResult, SnapshotSummary, User } from "../shared/types";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

async function fileBrowserRoots(): Promise<FileBrowserEntry[]> {
  const home = os.homedir();
  const candidates = process.platform === "win32"
    ? [
      { name: "Home", path: home },
      { name: "Desktop", path: path.join(home, "Desktop") },
      { name: "Documents", path: path.join(home, "Documents") },
      { name: "Pictures", path: path.join(home, "Pictures") },
      { name: "Downloads", path: path.join(home, "Downloads") },
      { name: "Websites", path: "C:\\inetpub\\wwwroot" },
      { name: "Program data", path: "C:\\ProgramData" }
    ]
    : [
      { name: "Home", path: home },
      { name: "Documents", path: path.join(home, "Documents") },
      { name: "Desktop", path: path.join(home, "Desktop") },
      { name: "Websites", path: "/var/www" },
      { name: "Self-hosted apps", path: "/srv" },
      { name: "Installed apps", path: "/opt" },
      { name: "Service data", path: "/var/lib" }
    ];

  const seen = new Set<string>();
  const roots: FileBrowserEntry[] = [];
  for (const candidate of candidates) {
    const resolvedPath = path.resolve(candidate.path);
    if (seen.has(resolvedPath.toLowerCase())) continue;
    seen.add(resolvedPath.toLowerCase());
    try {
      const stat = await fsPromises.stat(resolvedPath);
      if (stat.isDirectory()) roots.push({ ...candidate, path: resolvedPath, type: "folder", modifiedAt: stat.mtime.toISOString() });
    } catch {
      // skip missing starting locations
    }
  }
  return roots;
}

export function createApi(store: Store, runner: JobRunner, broadcast: () => void) {
  const router = express.Router();
  const auth = authMiddleware(store.snapshot().users);

  router.get("/auth/oidc/login", (_req, res) => {
    if (!config.oidcIssuer || !config.oidcClientId) {
      return res.status(501).json({ error: "OIDC is not configured. Set FRD_OIDC_ISSUER and FRD_OIDC_CLIENT_ID." });
    }
    const redirect = `${config.oidcIssuer}/authorize?client_id=${encodeURIComponent(config.oidcClientId)}&response_type=code&scope=openid`;
    res.json({ redirect });
  });

  router.get("/auth/oidc/callback", (_req, res) => {
    res.status(501).json({ error: "OIDC callback handler requires provider-specific token exchange. Configure per your IdP." });
  });

  router.get("/docs/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });

  router.get("/google-drive/oauth/callback", async (req, res, next) => {
    try {
      const state = String(req.query.state ?? "");
      const code = String(req.query.code ?? "");
      if (!state || !code) throw new Error("Google Drive authorization was cancelled or incomplete.");
      const connectionId = await finishGoogleDriveOAuth(state, code);
      res.type("html").send(`<!doctype html><html><body><p>Google Drive connected. You can close this window.</p><script>window.opener?.postMessage(${JSON.stringify({ type: "backupproof-google-drive", connectionId })}, "*");window.close();</script></body></html>`);
    } catch (error) {
      next(error);
    }
  });

  router.post("/google-drive/oauth/start", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const clientId = String(req.body?.clientId ?? "").trim();
      const clientSecret = String(req.body?.clientSecret ?? "").trim();
      if (!clientId || !clientSecret) throw new Error("Google OAuth client ID and client secret are required.");
      const redirectUri = `${req.protocol}://${req.get("host")}/api/google-drive/oauth/callback`;
      res.json({ authorizationUrl: await startGoogleDriveOAuth({ clientId, clientSecret, redirectUri }), redirectUri });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/login", async (req, res, next) => {
    try {
      const input = loginInputSchema.parse(req.body);
      const user = store.findUserByUsername(input.username);
      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const token = createSession(user);
      await recordAudit(store, "auth.login", `User ${user.username} logged in`, user);
      res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/logout", auth, (req, res) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (token) destroySession(token);
    res.json({ ok: true });
  });

  router.post("/users", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "admin");
      const input = userInputSchema.parse(req.body);
      const user = await store.addUser(input);
      await recordAudit(store, "user.create", `Created user ${user.username}`, req.user);
      broadcast();
      res.status(201).json({ id: user.id, username: user.username, role: user.role });
    } catch (error) {
      next(error);
    }
  });

  router.get("/audit", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "audit");
      res.json(auditExport(store.snapshot().auditLog));
    } catch (error) {
      next(error);
    }
  });

  router.post("/agents/register", async (req, res, next) => {
    try {
      const input = agentRegisterSchema.parse(req.body);
      const agent = await registerAgent(store, input);
      broadcast();
      res.status(201).json({ id: agent.id, name: agent.name });
    } catch (error) {
      next(error);
    }
  });

  router.post("/agents/heartbeat", async (req, res, next) => {
    try {
      const token = String(req.body?.token ?? "");
      const agent = await heartbeatAgent(store, token);
      res.json({ id: agent.id, lastSeenAt: agent.lastSeenAt });
    } catch (error) {
      next(error);
    }
  });

  router.get("/engines/available", auth, async (_req, res) => {
    const engines = await detectExternalEngines();
    res.json({
      builtIn: ["frd"],
      optional: {
        restic: engines.resticAvailable ? { version: engines.resticVersion, path: engines.resticPath } : null,
        kopia: engines.kopiaAvailable ? { version: engines.kopiaVersion, path: engines.kopiaPath } : null
      }
    });
  });

  router.post("/migrate/restic", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      await assertExternalEngine("restic");
      const input = repositoryInputSchema.parse({ ...req.body, engine: "restic" });
      if (!input.password) throw new Error("Restic repository password is required");
      const passwordSecretId = await store.putSecret(input.password);
      const googleCredentials = consumeGoogleDriveConnection(input.googleConnectionId);
      if (input.type === "google-drive" && !googleCredentials) {
        throw new Error("Connect Google Drive before creating this vault.");
      }
      const credentialSecretId = googleCredentials
        ? await store.putSecret(googleCredentials)
        : input.credentials ? await store.putSecret(input.credentials) : undefined;
      const repository = await store.upsertRepository({
        name: input.name,
        engine: "restic",
        type: input.type,
        location: input.location,
        passwordSecretId,
        credentialSecretId,
        objectLock: input.objectLock,
        bandwidthLimitKbps: input.bandwidthLimitKbps
      });
      await recordAudit(store, "migrate.restic", `Imported Restic repo ${repository.name}`, req.user);
      broadcast();
      res.status(201).json(repository);
    } catch (error) {
      next(error);
    }
  });

  router.post("/migrate/kopia", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      await assertExternalEngine("kopia");
      const input = repositoryInputSchema.parse({ ...req.body, engine: "kopia" });
      if (!input.password) throw new Error("Kopia repository password is required");
      const passwordSecretId = await store.putSecret(input.password);
      const credentialSecretId = input.credentials ? await store.putSecret(input.credentials) : undefined;
      const repository = await store.upsertRepository({
        name: input.name,
        engine: "kopia",
        type: input.type,
        location: input.location,
        passwordSecretId,
        credentialSecretId,
        objectLock: input.objectLock,
        bandwidthLimitKbps: input.bandwidthLimitKbps
      });
      await recordAudit(store, "migrate.kopia", `Imported Kopia repo ${repository.name}`, req.user);
      broadcast();
      res.status(201).json(repository);
    } catch (error) {
      next(error);
    }
  });

  router.get("/state", auth, async (_req, res) => {
    await auditAlerts(store);
    const state = store.snapshot();
    const environment = await checkEnvironment();
    res.json({ ...state, environment });
  });

  router.get("/summaries", auth, async (_req, res) => {
    await auditAlerts(store);
    const state = store.snapshot();
    const summaries: AppSummary[] = await Promise.all(state.apps.map(async (app) => {
      const jobs = state.jobs.filter((job) => job.appId === app.id);
      const restoreProof = state.restoreProofs.find((proof) => proof.appId === app.id);
      const proofFresh = restoreProof?.status === "passed" && new Date(restoreProof.expiresAt).getTime() > Date.now();
      const repository = state.repositories.find((repo) => repo.id === app.repositoryId);
      const snapshots = repository
        ? await getEngineAdapter(repository.engine).listSnapshots(app, repository, {
            passwordSecret: store.getSecret(repository.passwordSecretId),
            credentialSecret: store.getSecret(repository.credentialSecretId)
          })
        : [];
      const recentFailures = jobs.filter((j) => j.status === "failed").length;
      const repositories = [repository, ...(app.secondaryRepositoryIds ?? []).map((id) => state.repositories.find((repo) => repo.id === id))]
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const safety = await inspectBackupSafetyCached(app, repositories);
      return enrichSummary({
        app,
        repository,
        policy: state.policies.find((policy) => policy.id === app.policyId),
        latestBackup: jobs.find((job) => job.type === "backup"),
        latestRestoreTest: jobs.find((job) => job.type === "restore-test"),
        restoreProof,
        snapshotCount: snapshots.length,
        latestSnapshot: snapshots[0]
          ? { id: snapshots[0].id, createdAt: snapshots[0].createdAt, sizeBytes: snapshots[0].sizeBytes }
          : undefined,
        alerts: state.alerts.filter((alert) => alert.appId === app.id && !alert.acknowledgedAt),
        restorable: Boolean(proofFresh),
        safety,
        snapshotHistory: snapshots.slice(0, 12).reverse().map((snapshot) => ({
          id: snapshot.id,
          createdAt: snapshot.createdAt,
          sizeBytes: snapshot.sizeBytes
        }))
      }, recentFailures);
    }));
    res.json(summaries);
  });

  router.get("/analytics/recovery", auth, async (req, res, next) => {
    try {
      const period = Number(req.query.period ?? 30);
      const periodDays = period === 90 ? 90 : period === 7 ? 7 : 30;
      res.json(await getRecoveryAnalytics(store, periodDays));
    } catch (error) {
      next(error);
    }
  });

  router.get("/analytics/recovery/report", auth, async (req, res, next) => {
    try {
      const period = Number(req.query.period ?? 30);
      const periodDays = period === 90 ? 90 : period === 7 ? 7 : 30;
      const analytics = await getRecoveryAnalytics(store, periodDays);
      const body = buildRecoveryReadinessReport(analytics);
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="backupproof-recovery-report-${analytics.generatedAt.slice(0, 10)}.md"`);
      res.send(body);
    } catch (error) {
      next(error);
    }
  });

  router.post("/analytics/recovery/weekly-summary", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      res.json(await sendWeeklyRecoverySummaries(store));
    } catch (error) {
      next(error);
    }
  });

  router.get("/discovery", auth, async (_req, res, next) => {
    try {
      res.json(await discoverHost());
    } catch (error) {
      next(error);
    }
  });

  router.get("/filesystem/browse", auth, async (req, res, next) => {
    try {
      const requestedPath = typeof req.query.path === "string" && req.query.path.trim()
        ? req.query.path.trim()
        : os.homedir();
      const resolvedPath = path.resolve(requestedPath);
      const currentStat = await fsPromises.stat(resolvedPath);
      if (!currentStat.isDirectory()) throw new Error("Choose a folder to browse.");

      const entries = await fsPromises.readdir(resolvedPath, { withFileTypes: true });
      const visibleEntries: FileBrowserEntry[] = await Promise.all(entries
        .filter((entry) => !entry.name.startsWith("."))
        .slice(0, 250)
        .map(async (entry) => {
          const entryPath = path.join(resolvedPath, entry.name);
          const stat = await fsPromises.stat(entryPath).catch(() => undefined);
          return {
            name: entry.name,
            path: entryPath,
            type: entry.isDirectory() ? "folder" : "file",
            size: stat?.isFile() ? stat.size : undefined,
            modifiedAt: stat?.mtime?.toISOString()
          };
        }));

      const roots = await fileBrowserRoots();
      const result: FileBrowserResult = {
        currentPath: resolvedPath,
        parentPath: path.dirname(resolvedPath) !== resolvedPath ? path.dirname(resolvedPath) : undefined,
        entries: visibleEntries.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1),
        roots
      };
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/repositories/test", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const input = repositoryInputSchema.parse(req.body);
      res.json(await testRepositoryConnection(input));
    } catch (error) {
      next(error);
    }
  });

  router.post("/repositories", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const input = repositoryInputSchema.parse(req.body);
      const repository = await createRepositoryFromInput(store, input);
      await recordAudit(store, "repository.create", `Created vault ${repository.name} (${repository.engine})`, req.user);
      broadcast();
      res.status(201).json(repository);
    } catch (error) {
      next(error);
    }
  });

  router.post("/policies", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const policy = await store.upsertPolicy(policyInputSchema.parse(req.body));
      broadcast();
      res.status(201).json(policy);
    } catch (error) {
      next(error);
    }
  });

  router.put("/policies/:id", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const policy = await store.upsertPolicy({ ...policyInputSchema.parse(req.body), id: req.params.id });
      broadcast();
      res.json(policy);
    } catch (error) {
      next(error);
    }
  });

  router.post("/apps", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const input = appInputSchema.parse(req.body);
      const databasePasswordSecretId = input.database?.password ? await store.putSecret(input.database.password) : undefined;
      const app = await store.upsertApp({
        ...input,
        database: input.database
          ? {
              service: input.database.service,
              host: input.database.host,
              port: input.database.port,
              database: input.database.database,
              username: input.database.username,
              passwordSecretId: databasePasswordSecretId,
              dumpPath: input.database.dumpPath,
              dumpCommand: input.database.dumpCommand
            }
          : undefined,
        healthChecks: input.healthChecks.map((check) => ({ ...check, id: check.id ?? uuid() }))
      });
      await recordAudit(store, "app.create", `Protected app ${app.name}`, req.user);
      broadcast();
      res.status(201).json(app);
    } catch (error) {
      next(error);
    }
  });

  router.put("/apps/:id/secondary-storage", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const input = secondaryStorageInputSchema.parse(req.body);
      const app = store.snapshot().apps.find((item) => item.id === req.params.id);
      if (!app) throw new Error("App not found");

      let secondaryId = input.existingRepositoryId;
      if (input.repository) {
        const repository = await createRepositoryFromInput(store, input.repository);
        secondaryId = repository.id;
      }
      if (!secondaryId) throw new Error("Choose a storage location for the second copy.");
      if (secondaryId === app.repositoryId) throw new Error("Choose a different place than the main backup storage.");

      const secondaryRepositoryIds = [...new Set([...(app.secondaryRepositoryIds ?? []), secondaryId])];
      const updated = await store.upsertApp({
        ...app,
        secondaryRepositoryIds
      });
      await recordAudit(store, "app.secondary-storage", `Added second copy storage for ${app.name}`, req.user);
      broadcast();
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.post("/notifications", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const input = notificationInputSchema.parse(req.body);
      const configSecretId = await store.putSecret(input.config);
      const target = await store.upsertNotification({
        name: input.name,
        type: input.type,
        enabled: input.enabled,
        configSecretId
      });
      broadcast();
      res.status(201).json(target);
    } catch (error) {
      next(error);
    }
  });

  router.post("/notifications/test", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const input = notificationTestInputSchema.parse(req.body);
      const delivered = await sendTestNotificationConfig(input.type, input.config);
      if (!delivered) throw new Error("Test alert could not be delivered. Check the settings and try again.");
      res.json({ ok: true, message: "Test alert sent." });
    } catch (error) {
      next(error);
    }
  });

  router.post("/notifications/:id/test", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const target = store.snapshot().notificationTargets.find((item) => item.id === req.params.id);
      if (!target) throw new Error("Notification target not found");
      const delivered = await sendTestNotification(target, store.getSecret(target.configSecretId));
      if (!delivered) throw new Error("Test alert could not be delivered.");
      await store.upsertNotification({
        ...target,
        lastDeliveryAt: new Date().toISOString(),
        lastDeliveryStatus: "succeeded"
      });
      res.json({ ok: true, message: "Test alert sent." });
    } catch (error) {
      next(error);
    }
  });

  router.post("/restore-destinations", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const input = restoreDestinationTemplateInputSchema.parse(req.body);
      const template = await store.upsertRestoreDestinationTemplate(input);
      await recordAudit(store, "restore-destination.save", `Saved restore destination ${template.name}`, req.user);
      broadcast();
      res.status(201).json(template);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/restore-destinations/:id", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const template = await store.removeRestoreDestinationTemplate(req.params.id);
      await recordAudit(store, "restore-destination.delete", `Deleted restore destination ${template.name}`, req.user);
      broadcast();
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/apps/:id/jobs/:type", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const job = await runner.enqueue(req.params.type as never, req.params.id);
      await recordAudit(store, "job.enqueue", `Enqueued ${req.params.type} for app ${req.params.id}`, req.user);
      broadcast();
      res.status(202).json(job);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/apps/:id/snapshots", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const app = store.snapshot().apps.find((item) => item.id === req.params.id);
      if (!app) throw new Error("App not found");
      await deleteAllSnapshots(store, req.params.id);
      await recordAudit(store, "snapshots.delete", `Deleted all backups for ${app.name}`, req.user);
      broadcast();
      res.json({ ok: true, appId: req.params.id });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/apps/:id", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const app = store.snapshot().apps.find((item) => item.id === req.params.id);
      if (!app) throw new Error("App not found");
      await deleteApp(store, req.params.id);
      await recordAudit(store, "app.delete", `Removed protected app ${app.name}`, req.user);
      broadcast();
      res.json({ ok: true, appId: req.params.id });
    } catch (error) {
      next(error);
    }
  });

  router.post("/jobs/clear", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const appId = typeof req.body?.appId === "string" ? req.body.appId : undefined;
      await store.purgeJobHistory(appId);
      await recordAudit(store, "jobs.clear", appId ? `Cleared job history for app ${appId}` : "Cleared completed job history", req.user);
      broadcast();
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/apps/:id/snapshots", auth, async (req, res, next) => {
    try {
      const state = store.snapshot();
      const app = state.apps.find((item) => item.id === req.params.id);
      if (!app) throw new Error("App not found");
      const repository = state.repositories.find((item) => item.id === app.repositoryId);
      if (!repository) throw new Error("App repository not found");
      const snapshots: SnapshotSummary[] = (await getEngineAdapter(repository.engine).listSnapshots(app, repository, {
        passwordSecret: store.getSecret(repository.passwordSecretId),
        credentialSecret: store.getSecret(repository.credentialSecretId)
      })).map((snapshot) => ({
        id: snapshot.id,
        appId: snapshot.appId,
        appName: snapshot.appName,
        createdAt: snapshot.createdAt,
        archivePath: snapshot.archivePath,
        sourcePaths: snapshot.sourcePaths,
        sizeBytes: snapshot.sizeBytes,
        shortId: snapshot.shortId
      }));
      res.json(snapshots);
    } catch (error) {
      next(error);
    }
  });

  router.get("/apps/:id/snapshots/:snapshotId/download", auth, async (req, res, next) => {
    try {
      const state = store.snapshot();
      const app = state.apps.find((item) => item.id === req.params.id);
      if (!app) throw new Error("App not found");
      const repository = state.repositories.find((item) => item.id === app.repositoryId);
      if (!repository) throw new Error("App repository not found");
      const adapter = getEngineAdapter(repository.engine);
      const exported = await createPortableExport(app, repository, req.params.snapshotId, adapter, {
        passwordSecret: store.getSecret(repository.passwordSecretId),
        credentialSecret: store.getSecret(repository.credentialSecretId)
      });
      await recordAudit(store, "snapshot.download", `Downloaded portable backup for ${app.name} snapshot ${req.params.snapshotId}`, req.user);
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="${exported.fileName}"`);
      const stream = fs.createReadStream(exported.filePath);
      stream.on("error", async (error) => {
        await exported.cleanup();
        next(error);
      });
      res.on("finish", () => void exported.cleanup());
      res.on("close", () => {
        if (!res.writableFinished) void exported.cleanup();
      });
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  router.get("/apps/:id/snapshots/:snapshotId/contents", auth, async (req, res, next) => {
    try {
      const state = store.snapshot();
      const app = state.apps.find((item) => item.id === req.params.id);
      if (!app) throw new Error("App not found");
      const repository = state.repositories.find((item) => item.id === app.repositoryId);
      if (!repository) throw new Error("App repository not found");
      res.json(await inspectSnapshotContents(app, repository, req.params.snapshotId, {
        passwordSecret: store.getSecret(repository.passwordSecretId),
        credentialSecret: store.getSecret(repository.credentialSecretId)
      }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/apps/:id/snapshots/:snapshotId/compare", auth, async (req, res, next) => {
    try {
      const state = store.snapshot();
      const app = state.apps.find((item) => item.id === req.params.id);
      if (!app) throw new Error("App not found");
      const repository = state.repositories.find((item) => item.id === app.repositoryId);
      if (!repository) throw new Error("App repository not found");
      res.json(await compareSnapshots(app, repository, req.params.snapshotId, {
        passwordSecret: store.getSecret(repository.passwordSecretId),
        credentialSecret: store.getSecret(repository.credentialSecretId)
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/portable/import", auth, async (req, res, next) => {
    const archivePath = path.join(config.dataDir, "incoming", `portable-${uuid()}.tar.gz`);
    try {
      if (req.user) requireRole(req.user.role, "write");
      const contentLength = Number(req.headers["content-length"] ?? 0);
      if (contentLength > config.nativeEngineMaxBytes) throw new Error("Portable backup exceeds the configured upload size limit.");
      await fsPromises.mkdir(path.dirname(archivePath), { recursive: true });
      let received = 0;
      const limit = new Transform({
        transform(chunk, _encoding, callback) {
          received += chunk.length;
          callback(received > config.nativeEngineMaxBytes ? new Error("Portable backup exceeds the configured upload size limit.") : undefined, chunk);
        }
      });
      await pipeline(req, limit, fs.createWriteStream(archivePath));
      const targetDir = typeof req.headers["x-restore-target"] === "string" ? req.headers["x-restore-target"] : undefined;
      const result = await restorePortableExport(archivePath, targetDir);
      await recordAudit(store, "portable.import", `Imported portable backup for ${result.metadata.app.name} snapshot ${result.metadata.snapshotId}`, req.user);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    } finally {
      await fsPromises.rm(archivePath, { force: true });
    }
  });

  router.post("/recovery-kit/export", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "admin");
      const passphrase = String(req.body?.passphrase ?? "");
      const kit = createRecoveryKit(store.exportRecoveryState(), passphrase);
      await recordAudit(store, "recovery-kit.export", "Exported encrypted BackupProof recovery kit", req.user);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="backupproof-recovery-${new Date().toISOString().slice(0, 10)}.bpkit"`);
      res.send(kit);
    } catch (error) {
      next(error);
    }
  });

  router.post("/recovery-kit/import", auth, async (req, res, next) => {
    const kitPath = path.join(config.dataDir, "incoming", `recovery-kit-${uuid()}.bpkit`);
    try {
      if (req.user) requireRole(req.user.role, "admin");
      const passphrase = typeof req.headers["x-recovery-passphrase"] === "string" ? req.headers["x-recovery-passphrase"] : "";
      await fsPromises.mkdir(path.dirname(kitPath), { recursive: true });
      let received = 0;
      const limit = new Transform({
        transform(chunk, _encoding, callback) {
          received += chunk.length;
          callback(received > 50 * 1024 * 1024 ? new Error("Recovery kit exceeds the 50 MB limit.") : undefined, chunk);
        }
      });
      await pipeline(req, limit, fs.createWriteStream(kitPath));
      const payload = openRecoveryKit(await fsPromises.readFile(kitPath), passphrase);
      const restoredState = await store.importRecoveryState(payload);
      await recordAudit(store, "recovery-kit.import", `Imported recovery kit exported at ${payload.exportedAt}`, req.user);
      broadcast();
      res.status(201).json({
        exportedAt: payload.exportedAt,
        apps: restoredState.apps.length,
        repositories: restoredState.repositories.length,
        policies: restoredState.policies.length
      });
    } catch (error) {
      next(error);
    } finally {
      await fsPromises.rm(kitPath, { force: true });
    }
  });

  router.get("/apps/:id/proof-report", auth, async (req, res, next) => {
    try {
      const proof = store.snapshot().restoreProofs.find((p) => p.appId === req.params.id);
      if (!proof?.reportPath) throw new Error("No proof report available");
      res.json(proof);
    } catch (error) {
      next(error);
    }
  });

  router.get("/apps/:id/proof-history", auth, async (req, res, next) => {
    try {
      const proofs = store.snapshot().restoreProofs
        .filter((proof) => proof.appId === req.params.id)
        .sort((a, b) => b.testedAt.localeCompare(a.testedAt));
      res.json(proofs);
    } catch (error) {
      next(error);
    }
  });

  router.post("/apps/:id/restore-preflight", auth, async (req, res, next) => {
    try {
      const state = store.snapshot();
      const app = state.apps.find((item) => item.id === req.params.id);
      if (!app) throw new Error("App not found");
      const repository = state.repositories.find((item) => item.id === app.repositoryId);
      if (!repository) throw new Error("App repository not found");
      const snapshotId = typeof req.body?.snapshotId === "string" ? req.body.snapshotId : "";
      const targetDir = typeof req.body?.targetDir === "string" ? req.body.targetDir : undefined;
      const snapshot = (await getEngineAdapter(repository.engine).listSnapshots(app, repository, {
        passwordSecret: store.getSecret(repository.passwordSecretId),
        credentialSecret: store.getSecret(repository.credentialSecretId)
      })).find((item) => item.id === snapshotId);
      const proof = state.restoreProofs.find((item) => item.appId === app.id && item.snapshotId === snapshotId);
      res.json(await inspectRestorePreflight({
        app,
        snapshot: snapshot ? { ...snapshot, appId: app.id, appName: app.name } : undefined,
        proof,
        targetDir
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/apps/:id/restore", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const snapshotId = typeof req.body?.snapshotId === "string" ? req.body.snapshotId : undefined;
      const restoreTargetDir = typeof req.body?.targetDir === "string" ? req.body.targetDir : undefined;
      const restorePaths = Array.isArray(req.body?.paths) ? req.body.paths.filter((item: unknown): item is string => typeof item === "string" && item.length > 0).slice(0, 1000) : undefined;
      const job = await runner.enqueue("manual-restore", req.params.id, { requestedSnapshotId: snapshotId, restoreTargetDir, restorePaths });
      broadcast();
      res.status(202).json(job);
    } catch (error) {
      next(error);
    }
  });

  router.post("/apps/:id/dr-run", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const input = drRunSchema.parse(req.body ?? {});
      const restorePaths = Array.isArray(req.body?.paths) ? req.body.paths.filter((item: unknown): item is string => typeof item === "string" && item.length > 0).slice(0, 1000) : undefined;
      const job = await runner.enqueue("dr-run", req.params.id, {
        requestedSnapshotId: input.snapshotId,
        restoreTargetDir: input.targetDir,
        restorePaths,
        drScenario: input.scenario
      });
      await recordAudit(store, "dr.run", `DR run (${input.scenario}) for app ${req.params.id}`, req.user);
      broadcast();
      res.status(202).json(job);
    } catch (error) {
      next(error);
    }
  });

  router.get("/apps/:id/dr-reports", auth, async (req, res, next) => {
    try {
      res.json(await listDrReports(req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/apps/:id/dr-reports/:reportId/download", auth, async (req, res, next) => {
    try {
      const body = await readDrReport(req.params.id, req.params.reportId);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.reportId}.json"`);
      res.send(body);
    } catch (error) {
      next(error);
    }
  });

  router.get("/apps/:id/runbook/download", auth, async (req, res, next) => {
    try {
      const state = store.snapshot();
      const app = state.apps.find((item) => item.id === req.params.id);
      if (!app) throw new Error("App not found");
      const body = await buildRecoveryRunbook(state, app);
      await recordAudit(store, "runbook.download", `Downloaded recovery runbook for ${app.name}`, req.user);
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="backupproof-runbook-${app.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || app.id}.md"`);
      res.send(body);
    } catch (error) {
      next(error);
    }
  });

  router.get("/apps/:id/evidence-bundle/download", auth, async (req, res, next) => {
    try {
      const state = store.snapshot();
      const app = state.apps.find((item) => item.id === req.params.id);
      if (!app) throw new Error("App not found");
      const bundle = await createEvidenceBundle(state, app);
      await recordAudit(store, "evidence-bundle.download", `Downloaded recovery evidence bundle for ${app.name}`, req.user);
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="${bundle.fileName}"`);
      const stream = fs.createReadStream(bundle.filePath);
      stream.on("error", async (error) => {
        await bundle.cleanup();
        next(error);
      });
      res.on("finish", () => void bundle.cleanup());
      res.on("close", () => {
        if (!res.writableFinished) void bundle.cleanup();
      });
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  router.post("/demo/run", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const app = await ensureDemoApp(store);
      const backup = await runner.enqueue("backup", app.id);
      const restoreTest = await runner.enqueue("restore-test", app.id);
      broadcast();
      res.status(202).json({ app, jobs: [backup, restoreTest] });
    } catch (error) {
      next(error);
    }
  });

  router.post("/alerts/:id/acknowledge", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const alert = await store.acknowledgeAlert(req.params.id);
      broadcast();
      res.json(alert);
    } catch (error) {
      next(error);
    }
  });

  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unknown API error";
    res.status(400).json({ error: message });
  });

  return router;
}
