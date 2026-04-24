import { Router, type Request, type Response } from "express";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { RedisClient } from "../redis/client.js";
import * as runsRepo from "../repos/runs.js";
import { startSourcingPipeline, type OrchestratorDeps } from "../services/orchestrator.js";

function paramId(req: Request): string | undefined {
  const raw = req.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id ?? undefined;
}

export function createRunsRouter(
  _config: Config,
  log: Logger,
  redis: RedisClient,
  orchestratorDeps: OrchestratorDeps,
) {
  const r = Router();

  r.post("/:id/start", async (req: Request, res: Response) => {
    const id = paramId(req);
    if (!id) {
      res.status(400).json({ error: "missing_run_id" });
      return;
    }
    const run = await runsRepo.getRun(redis, id);
    if (!run) {
      res.status(404).json({ error: "run_not_found" });
      return;
    }
    if (run.state !== "DEMAND_RECEIVED") {
      res.status(409).json({ error: "run_not_startable", state: run.state });
      return;
    }
    log.info("run_start_requested", { correlationId: run.correlationId, runId: id });
    void startSourcingPipeline(orchestratorDeps, id);
    res.status(202).json({
      ok: true,
      runId: id,
      note: "Sourcing pipeline accepted (async). Poll GET /runs/:id for state.",
    });
  });

  r.get("/:id", async (req: Request, res: Response) => {
    const id = paramId(req);
    if (!id) {
      res.status(400).json({ error: "missing_run_id" });
      return;
    }
    const run = await runsRepo.getRun(redis, id);
    if (!run) {
      res.status(404).json({ error: "run_not_found" });
      return;
    }
    res.json(run);
  });

  return r;
}
