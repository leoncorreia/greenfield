import { Router } from "express";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { RedisClient } from "../redis/client.js";
import * as runsRepo from "../repos/runs.js";
import { startSourcingPipeline, type OrchestratorDeps } from "../services/orchestrator.js";

export function createRunsRouter(
  _config: Config,
  log: Logger,
  redis: RedisClient,
  orchestratorDeps: OrchestratorDeps,
) {
  const r = Router();

  r.post("/:id/start", async (req, res) => {
    const { id } = req.params;
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

  r.get("/:id", async (req, res) => {
    const run = await runsRepo.getRun(redis, req.params.id);
    if (!run) {
      res.status(404).json({ error: "run_not_found" });
      return;
    }
    res.json(run);
  });

  return r;
}
