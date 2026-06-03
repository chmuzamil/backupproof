import { v4 as uuid } from "uuid";
import type { FleetAgent } from "../shared/types";
import type { Store } from "./store";

export async function registerAgent(store: Store, input: Omit<FleetAgent, "id" | "registeredAt" | "lastSeenAt">) {
  const existing = store.snapshot().agents.find((a) => a.token === input.token);
  if (existing) {
    return store.updateAgent(existing.id, { lastSeenAt: new Date().toISOString(), hostname: input.hostname, platform: input.platform });
  }
  return store.addAgent({
    ...input,
    id: uuid(),
    registeredAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  });
}

export async function heartbeatAgent(store: Store, token: string) {
  const agent = store.snapshot().agents.find((a) => a.token === token);
  if (!agent) throw new Error("Agent not registered");
  return store.updateAgent(agent.id, { lastSeenAt: new Date().toISOString() });
}
