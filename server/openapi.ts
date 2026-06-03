import { brand } from "../shared/brand";

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: `${brand.name} API`,
    version: "4.1.0",
    description: `${brand.tagline} Self-hosted backup orchestration with automatic restore proof.`
  },
  servers: [{ url: "/api" }],
  paths: {
    "/state": { get: { summary: "Dashboard state", tags: ["Dashboard"] } },
    "/summaries": { get: { summary: "App summaries with confidence scores", tags: ["Dashboard"] } },
    "/discovery": { get: { summary: "Host discovery", tags: ["Discovery"] } },
    "/repositories": { post: { summary: "Create vault", tags: ["Repositories"] } },
    "/apps": { post: { summary: "Register protected app", tags: ["Apps"] } },
    "/apps/{id}/jobs/{type}": { post: { summary: "Enqueue job", tags: ["Jobs"] } },
    "/apps/{id}/snapshots": { get: { summary: "List snapshots", tags: ["Snapshots"] } },
    "/apps/{id}/restore": { post: { summary: "Manual restore", tags: ["Restore"] } },
    "/apps/{id}/dr-run": { post: { summary: "Disaster recovery run", tags: ["DR"] } },
    "/apps/{id}/proof-report": { get: { summary: "Latest proof report", tags: ["Proof"] } },
    "/demo/run": { post: { summary: "Green check demo", tags: ["Demo"] } },
    "/alerts/{id}/acknowledge": { post: { summary: "Acknowledge alert", tags: ["Alerts"] } },
    "/auth/login": { post: { summary: "Login", tags: ["Auth"] } },
    "/auth/logout": { post: { summary: "Logout", tags: ["Auth"] } },
    "/users": { post: { summary: "Create user (admin)", tags: ["Auth"] } },
    "/audit": { get: { summary: "Audit log export", tags: ["Compliance"] } },
    "/agents/register": { post: { summary: "Register fleet agent", tags: ["Fleet"] } },
    "/agents/heartbeat": { post: { summary: "Agent heartbeat", tags: ["Fleet"] } },
    "/engines/available": { get: { summary: "Detect installed optional engines", tags: ["Engines"] } },
    "/migrate/restic": { post: { summary: "Import existing Restic repo", tags: ["Migration"] } },
    "/migrate/kopia": { post: { summary: "Import existing Kopia repo", tags: ["Migration"] } }
  }
};
