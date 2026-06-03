import { getEngineAdapter } from "./engines";
import { sendAlert } from "./notifications";
import { Store } from "./store";
import type { Alert } from "../shared/types";

async function deliver(store: Store, alert: Alert) {
  const targets = store.snapshot().notificationTargets;
  for (const target of targets) {
    try {
      const delivered = await sendAlert(target, store.getSecret(target.configSecretId), alert);
      await store.upsertNotification({
        ...target,
        lastDeliveryAt: new Date().toISOString(),
        lastDeliveryStatus: delivered ? "succeeded" : target.lastDeliveryStatus
      });
    } catch {
      await store.upsertNotification({ ...target, lastDeliveryAt: new Date().toISOString(), lastDeliveryStatus: "failed" });
    }
  }
}

export async function auditAlerts(store: Store) {
  const state = store.snapshot();

  for (const app of state.apps) {
    const repository = state.repositories.find((item) => item.id === app.repositoryId);
    if (!repository) {
      const result = await store.addAlertIfMissing({
        appId: app.id,
        severity: "critical",
        title: "Repository missing",
        message: `${app.name} cannot run backups because its vault is missing.`
      });
      if (result.created) await deliver(store, result.alert);
      continue;
    }

    try {
      const adapter = getEngineAdapter(repository.engine);
      await adapter.check(repository, () => undefined, {
        passwordSecret: store.getSecret(repository.passwordSecretId),
        credentialSecret: store.getSecret(repository.credentialSecretId)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Repository unreachable";
      const result = await store.addAlertIfMissing({
        appId: app.id,
        severity: "critical",
        title: "Repository unreachable",
        message: `${app.name}: ${message}`
      });
      if (result.created) await deliver(store, result.alert);
    }

    const snapshots = await getEngineAdapter(repository.engine).listSnapshots(app, repository, {
      passwordSecret: store.getSecret(repository.passwordSecretId),
      credentialSecret: store.getSecret(repository.credentialSecretId)
    });
    const proof = state.restoreProofs.find((item) => item.appId === app.id);

    if (snapshots.length > 0 && !proof) {
      const result = await store.addAlertIfMissing({
        appId: app.id,
        severity: "warning",
        title: "Restore proof missing",
        message: `${app.name} has backups, but none have passed a restore test yet.`
      });
      if (result.created) await deliver(store, result.alert);
      continue;
    }

    if (proof?.status === "failed") {
      const result = await store.addAlertIfMissing({
        appId: app.id,
        severity: "critical",
        title: "Restore proof failed",
        message: `${app.name} restored snapshot ${proof.snapshotId}, but at least one proof check failed.`
      });
      if (result.created) await deliver(store, result.alert);
    }

    if (proof?.status === "passed") {
      const expiresIn = new Date(proof.expiresAt).getTime() - Date.now();
      if (expiresIn <= 0) {
        const result = await store.addAlertIfMissing({
          appId: app.id,
          severity: "warning",
          title: "Restore proof stale",
          message: `${app.name} needs a fresh restore test. Last proof expired ${proof.expiresAt}.`
        });
        if (result.created) await deliver(store, result.alert);
      } else if (expiresIn < 24 * 60 * 60 * 1000) {
        const result = await store.addAlertIfMissing({
          appId: app.id,
          severity: "info",
          title: "Restore proof expiring soon",
          message: `${app.name} proof expires within 24 hours.`
        });
        if (result.created) await deliver(store, result.alert);
      }
    }
  }
}
