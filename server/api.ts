import express from "express";
import { v4 as uuid } from "uuid";
import {
  agentRegisterSchema,
  appInputSchema,
  drRunSchema,
  loginInputSchema,
  notificationInputSchema,
  policyInputSchema,
  repositoryInputSchema,
  userInputSchema
} from "../shared/schemas";
import { auditExport, recordAudit } from "./auditLog";
import { auditAlerts } from "./alertAudit";
import { authMiddleware, createSession, destroySession, requireRole, verifyPassword } from "./auth";
import { config } from "./config";
import { enrichSummary } from "./confidenceScore";
import { checkEnvironment } from "./environment";
import { assertExternalEngine, detectExternalEngines } from "./engineAvailability";
import { ensureDemoApp } from "./demo";
import { discoverHost } from "./discovery";
import { getEngineAdapter } from "./engines";
import { heartbeatAgent, registerAgent } from "./fleet";
import { JobRunner } from "./jobs";
import { openApiSpec } from "./openapi";
import { Store } from "./store";
import type { AppSummary, SnapshotSummary, User } from "../shared/types";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
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
      const credentialSecretId = input.credentials ? await store.putSecret(input.credentials) : undefined;
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
        restorable: Boolean(proofFresh)
      }, recentFailures);
    }));
    res.json(summaries);
  });

  router.get("/discovery", auth, async (_req, res, next) => {
    try {
      res.json(await discoverHost());
    } catch (error) {
      next(error);
    }
  });

  router.post("/repositories", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const input = repositoryInputSchema.parse(req.body);
      if (input.engine === "restic" || input.engine === "kopia") {
        if (!input.password) throw new Error("Repository password is required for Restic and Kopia vaults");
        await assertExternalEngine(input.engine);
      }
      if ((input.type === "s3" || input.type === "b2") && !input.credentials) {
        throw new Error("Cloud vault credentials are required for S3 and B2");
      }
      const passwordSecretId = input.password ? await store.putSecret(input.password) : undefined;
      const credentialSecretId = input.credentials ? await store.putSecret(input.credentials) : undefined;
      const repository = await store.upsertRepository({
        name: input.name,
        engine: input.engine,
        type: input.type,
        location: input.location,
        passwordSecretId,
        credentialSecretId,
        objectLock: input.objectLock,
        bandwidthLimitKbps: input.bandwidthLimitKbps
      });
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

  router.get("/apps/:id/proof-report", auth, async (req, res, next) => {
    try {
      const proof = store.snapshot().restoreProofs.find((p) => p.appId === req.params.id);
      if (!proof?.reportPath) throw new Error("No proof report available");
      res.json(proof);
    } catch (error) {
      next(error);
    }
  });

  router.post("/apps/:id/restore", auth, async (req, res, next) => {
    try {
      if (req.user) requireRole(req.user.role, "write");
      const snapshotId = typeof req.body?.snapshotId === "string" ? req.body.snapshotId : undefined;
      const restoreTargetDir = typeof req.body?.targetDir === "string" ? req.body.targetDir : undefined;
      const job = await runner.enqueue("manual-restore", req.params.id, { requestedSnapshotId: snapshotId, restoreTargetDir });
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
      const job = await runner.enqueue("dr-run", req.params.id, {
        requestedSnapshotId: input.snapshotId,
        restoreTargetDir: input.targetDir ?? input.scenario
      });
      await recordAudit(store, "dr.run", `DR run (${input.scenario}) for app ${req.params.id}`, req.user);
      broadcast();
      res.status(202).json(job);
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
