import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
import type { RedisClient } from "./redis/client.js";
import { mockVendorRouter } from "./routes/mock-vendors.js";
import { createDemandRouter } from "./routes/demand.js";
import { createRunsRouter } from "./routes/runs.js";
import { createReportsRouter } from "./routes/reports.js";
import { createPaymentsRouter } from "./routes/payments.js";
import type { OrchestratorDeps } from "./services/orchestrator.js";

export function createApp(config: Config, log: Logger, redis: RedisClient, orchestratorDeps: OrchestratorDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: true, credentials: true }));
  app.use((req, res, next) => {
    const hdr = req.header("x-correlation-id");
    res.setHeader("x-correlation-id", hdr ?? "");
    next();
  });
  app.use("/mock", mockVendorRouter());
  app.use(express.json({ limit: "512kb" }));
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "greenfield-vendor-ops", ts: new Date().toISOString() });
  });
  app.use("/demand", createDemandRouter(config, log, redis, orchestratorDeps));
  app.use("/runs", createRunsRouter(config, log, redis, orchestratorDeps));
  app.use("/reports", createReportsRouter(config, log));
  app.use("/payments", createPaymentsRouter(config, log, redis));

  const staticRoot = config.STATIC_WEB_ROOT?.trim()
    ? path.resolve(process.cwd(), config.STATIC_WEB_ROOT.trim())
    : undefined;
  if (staticRoot && existsSync(staticRoot)) {
    log.info("static_web_enabled", { staticRoot });
    app.use(express.static(staticRoot, { index: ["index.html"] }));
    app.get("/*", (req, res, next) => {
      if (req.method !== "GET") return next();
      const indexHtml = path.join(staticRoot, "index.html");
      if (!existsSync(indexHtml)) return next();
      res.sendFile(indexHtml);
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error("unhandled_error", { err: String(err) });
    res.status(500).json({ error: "internal_error" });
  });
  return app;
}
