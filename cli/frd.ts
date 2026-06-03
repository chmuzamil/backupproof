#!/usr/bin/env node
import { parseArgs } from "node:util";

import { brand } from "../shared/brand";

const baseUrl = process.env.FRD_API_URL ?? "http://localhost:8787/api";
const token = process.env.FRD_TOKEN;

async function api(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      snapshot: { type: "string" },
      target: { type: "string" },
      help: { type: "boolean", short: "h" }
    }
  });

  const [command, sub, arg] = positionals;

  if (values.help || !command) {
    console.log(`${brand.cliBinary} - ${brand.name} CLI

Usage:
  frd status
  frd backup run <appId>
  frd proof run <appId>
  frd restore <appId> [--snapshot <id>] [--target <dir>]
  frd repo check <appId>
  frd dr run <appId> [--snapshot <id>] [--target <dir>]

Environment:
  FRD_API_URL  API base (default http://localhost:8787/api)
  FRD_TOKEN    Bearer token from POST /api/auth/login
`);
    return;
  }

  if (command === "status") {
    const summaries = await api("/summaries");
    for (const item of summaries) {
      console.log(`${item.app.name}\tscore=${item.confidenceScore}\trestorable=${item.restorable}\tsnapshots=${item.snapshotCount}`);
    }
    return;
  }

  if (command === "backup" && sub === "run" && arg) {
    const job = await api(`/apps/${arg}/jobs/backup`, { method: "POST" });
    console.log(JSON.stringify(job, null, 2));
    return;
  }

  if (command === "proof" && sub === "run" && arg) {
    const job = await api(`/apps/${arg}/jobs/restore-test`, { method: "POST" });
    console.log(JSON.stringify(job, null, 2));
    return;
  }

  if (command === "restore" && sub) {
    const job = await api(`/apps/${sub}/restore`, {
      method: "POST",
      body: JSON.stringify({ snapshotId: values.snapshot, targetDir: values.target })
    });
    console.log(JSON.stringify(job, null, 2));
    return;
  }

  if (command === "repo" && sub === "check" && arg) {
    const job = await api(`/apps/${arg}/jobs/check`, { method: "POST" });
    console.log(JSON.stringify(job, null, 2));
    return;
  }

  if (command === "dr" && sub === "run" && arg) {
    const job = await api(`/apps/${arg}/dr-run`, {
      method: "POST",
      body: JSON.stringify({ snapshotId: values.snapshot, targetDir: values.target, scenario: "lost-server" })
    });
    console.log(JSON.stringify(job, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${positionals.join(" ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
