import cron from "node-cron";
import { JobRunner } from "./jobs";
import { Store } from "./store";
import { sendWeeklyRecoverySummaries } from "./weeklySummary";

export function startScheduler(store: Store, runner: JobRunner) {
  let tasks: Array<{ stop: () => void }> = [];

  function refresh() {
    tasks.forEach((task) => task.stop());
    const appTasks = store.snapshot().apps.flatMap((app) => {
      const policy = store.snapshot().policies.find((item) => item.id === app.policyId);
      if (!policy) return [];
      return [
        cron.schedule(policy.backupCron, () => void runner.enqueue("backup", app.id)),
        cron.schedule(policy.restoreTestCron, () => void runner.enqueue("restore-test", app.id))
      ];
    });
    tasks = [
      ...appTasks,
      cron.schedule("0 9 * * 1", () => void sendWeeklyRecoverySummaries(store))
    ];
  }

  refresh();
  return {
    refresh,
    stop: () => tasks.forEach((task) => task.stop())
  };
}
