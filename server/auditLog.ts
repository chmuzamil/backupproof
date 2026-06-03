import { v4 as uuid } from "uuid";
import type { AuditEntry } from "../shared/types";
import type { Store } from "./store";

export async function recordAudit(store: Store, action: string, detail: string, user?: { id: string; username: string }) {
  const entry: AuditEntry = {
    id: uuid(),
    userId: user?.id,
    username: user?.username,
    action,
    detail,
    at: new Date().toISOString()
  };
  await store.addAuditEntry(entry);
  return entry;
}

export function auditExport(entries: AuditEntry[]) {
  return {
    exportedAt: new Date().toISOString(),
    count: entries.length,
    entries
  };
}
