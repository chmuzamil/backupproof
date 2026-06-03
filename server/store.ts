import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { config } from "./config";
import { hashPassword } from "./auth";
import { encryptSecret } from "./crypto";
import type { Alert, App, AuditEntry, DashboardState, FleetAgent, Job, NotificationTarget, Policy, Repository, RestoreProof, User } from "../shared/types";

interface PersistedState extends Omit<DashboardState, "environment"> {
  secrets: Record<string, string>;
}

const statePath = path.join(config.dataDir, "state.json");

const now = () => new Date().toISOString();

function defaultState(): PersistedState {
  const policyId = uuid();
  const adminId = uuid();
  return {
    apps: [],
    repositories: [],
    policies: [
      {
        id: policyId,
        name: "Daily backup with weekly proof",
        backupCron: "0 2 * * *",
        restoreTestCron: "0 4 * * 0",
        proofFreshnessHours: 24 * 8,
        retention: { keepDaily: 7, keepWeekly: 4, keepMonthly: 6 },
        createdAt: now(),
        updatedAt: now()
      }
    ],
    jobs: [],
    restoreProofs: [],
    notificationTargets: [],
    alerts: [],
    users: [
      {
        id: adminId,
        username: "admin",
        passwordHash: hashPassword("admin"),
        role: "admin",
        createdAt: now()
      }
    ],
    auditLog: [],
    agents: [],
    secrets: {}
  };
}

export class Store {
  private state: PersistedState = defaultState();

  async init() {
    await fs.mkdir(config.dataDir, { recursive: true });
    try {
      const loaded = JSON.parse(await fs.readFile(statePath, "utf8")) as PersistedState;
      this.state = {
        ...defaultState(),
        ...loaded,
        users: loaded.users ?? defaultState().users,
        auditLog: loaded.auditLog ?? [],
        agents: loaded.agents ?? []
      };
      let migrated = false;
      for (const repo of this.state.repositories) {
        if (repo.engine === "native") {
          repo.engine = "frd";
          migrated = true;
        }
      }
      if (migrated) await this.save();
    } catch {
      await this.save();
    }
  }

  snapshot() {
    const { secrets: _secrets, ...publicState } = this.state;
    return publicState;
  }

  async save() {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(this.state, null, 2));
  }

  async putSecret(value: unknown) {
    const id = uuid();
    this.state.secrets[id] = encryptSecret(value);
    await this.save();
    return id;
  }

  getSecret(id?: string) {
    return id ? this.state.secrets[id] : undefined;
  }

  async upsertRepository(input: Omit<Repository, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const item: Repository = { ...input, engine: input.engine === "native" ? "frd" : (input.engine ?? "frd"), id: input.id ?? uuid(), createdAt: now(), updatedAt: now() };
    const index = this.state.repositories.findIndex((repo) => repo.id === item.id);
    if (index >= 0) this.state.repositories[index] = { ...this.state.repositories[index], ...item, updatedAt: now() };
    else this.state.repositories.push(item);
    await this.save();
    return item;
  }

  async upsertPolicy(input: Omit<Policy, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const existing = input.id ? this.state.policies.find((policy) => policy.id === input.id) : undefined;
    const item: Policy = { ...input, id: input.id ?? uuid(), createdAt: existing?.createdAt ?? now(), updatedAt: now() };
    const index = this.state.policies.findIndex((policy) => policy.id === item.id);
    if (index >= 0) this.state.policies[index] = item;
    else this.state.policies.push(item);
    await this.save();
    return item;
  }

  async upsertApp(input: Omit<App, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const existing = input.id ? this.state.apps.find((app) => app.id === input.id) : undefined;
    const item: App = { ...input, id: input.id ?? uuid(), createdAt: existing?.createdAt ?? now(), updatedAt: now() };
    const index = this.state.apps.findIndex((app) => app.id === item.id);
    if (index >= 0) this.state.apps[index] = item;
    else this.state.apps.push(item);
    await this.save();
    return item;
  }

  async upsertNotification(input: Omit<NotificationTarget, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const existing = input.id ? this.state.notificationTargets.find((target) => target.id === input.id) : undefined;
    const item: NotificationTarget = { ...input, id: input.id ?? uuid(), createdAt: existing?.createdAt ?? now(), updatedAt: now() };
    const index = this.state.notificationTargets.findIndex((target) => target.id === item.id);
    if (index >= 0) this.state.notificationTargets[index] = item;
    else this.state.notificationTargets.push(item);
    await this.save();
    return item;
  }

  async addUser(input: Omit<User, "id" | "createdAt" | "passwordHash"> & { password: string }) {
    const item: User = {
      id: uuid(),
      username: input.username,
      passwordHash: hashPassword(input.password),
      role: input.role,
      createdAt: now()
    };
    this.state.users.push(item);
    await this.save();
    return item;
  }

  findUserByUsername(username: string) {
    return this.state.users.find((u) => u.username === username);
  }

  async addAuditEntry(entry: AuditEntry) {
    this.state.auditLog.unshift(entry);
    this.state.auditLog = this.state.auditLog.slice(0, 5000);
    await this.save();
    return entry;
  }

  async addAgent(agent: FleetAgent) {
    this.state.agents.push(agent);
    await this.save();
    return agent;
  }

  async updateAgent(id: string, patch: Partial<FleetAgent>) {
    const agent = this.state.agents.find((a) => a.id === id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    Object.assign(agent, patch);
    await this.save();
    return agent;
  }

  async addJob(job: Omit<Job, "id" | "logs" | "status">) {
    const item: Job = { ...job, id: uuid(), logs: [], status: "queued" };
    this.state.jobs.unshift(item);
    await this.save();
    return item;
  }

  async updateJob(id: string, patch: Partial<Job>) {
    const job = this.state.jobs.find((item) => item.id === id);
    if (!job) throw new Error(`Job ${id} not found`);
    Object.assign(job, patch);
    await this.save();
    return job;
  }

  async appendLog(id: string, line: string) {
    const job = this.state.jobs.find((item) => item.id === id);
    if (!job) throw new Error(`Job ${id} not found`);
    job.logs.push({ at: now(), line });
    await this.save();
    return job;
  }

  async addRestoreProof(proof: Omit<RestoreProof, "id">) {
    const item: RestoreProof = { ...proof, id: uuid() };
    this.state.restoreProofs = [item, ...this.state.restoreProofs.filter((old) => old.appId !== item.appId)];
    await this.save();
    return item;
  }

  async addAlert(alert: Omit<Alert, "id" | "createdAt">) {
    const item: Alert = { ...alert, id: uuid(), createdAt: now() };
    this.state.alerts.unshift(item);
    await this.save();
    return item;
  }

  async addAlertIfMissing(alert: Omit<Alert, "id" | "createdAt">) {
    const existing = this.state.alerts.find((item) =>
      !item.acknowledgedAt &&
      item.appId === alert.appId &&
      item.title === alert.title &&
      item.message === alert.message
    );
    if (existing) return { alert: existing, created: false };
    return { alert: await this.addAlert(alert), created: true };
  }

  async acknowledgeAlert(id: string) {
    const alert = this.state.alerts.find((item) => item.id === id);
    if (!alert) throw new Error(`Alert ${id} not found`);
    alert.acknowledgedAt = now();
    await this.save();
    return alert;
  }

  async acknowledgeActiveAlertsByTitle(appId: string, titles: string[]) {
    if (titles.length === 0) return;
    let changed = false;
    for (const alert of this.state.alerts) {
      if (alert.appId === appId && !alert.acknowledgedAt && titles.includes(alert.title)) {
        alert.acknowledgedAt = now();
        changed = true;
      }
    }
    if (changed) await this.save();
  }

  async removeApp(id: string) {
    const app = this.state.apps.find((item) => item.id === id);
    if (!app) throw new Error(`App ${id} not found`);
    this.state.apps = this.state.apps.filter((item) => item.id !== id);
    await this.save();
    return app;
  }

  async removeRestoreProofsForApp(appId: string) {
    this.state.restoreProofs = this.state.restoreProofs.filter((proof) => proof.appId !== appId);
    await this.save();
  }

  async removeAlertsForApp(appId: string) {
    this.state.alerts = this.state.alerts.filter((alert) => alert.appId !== appId);
    await this.save();
  }

  async purgeJobHistory(appId?: string) {
    this.state.jobs = this.state.jobs.filter((job) => {
      if (job.status === "running" || job.status === "queued") return true;
      if (appId) return job.appId !== appId;
      return false;
    });
    await this.save();
  }
}
