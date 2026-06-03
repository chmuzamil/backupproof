import express from "express";
import cors from "cors";
import path from "node:path";
import { brand } from "../shared/brand";
import { config } from "./config";
import { createApi } from "./api";
import { JobRunner } from "./jobs";
import { startScheduler } from "./scheduler";
import { Store } from "./store";

const app = express();
const store = new Store();
await store.init();

const clients = new Set<express.Response>();
const broadcast = () => {
  const payload = `data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`;
  for (const client of clients) client.write(payload);
};

const runner = new JobRunner(store, broadcast);
const scheduler = startScheduler(store, runner);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write("retry: 1000\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
});
app.use("/api", createApi(store, runner, () => {
  scheduler.refresh();
  broadcast();
}));

app.use(express.static(config.publicDir));
app.use((_req, res) => {
  res.sendFile(path.join(config.publicDir, "index.html"));
});

app.listen(config.port, () => {
  console.log(`${brand.name} listening on ${config.port}`);
});
