import { Router } from "express";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import { demandSchema } from "../models/demand.js";
import type { RedisClient } from "../redis/client.js";
import * as demandsRepo from "../repos/demands.js";
import * as runsRepo from "../repos/runs.js";
import type { OrchestratorDeps } from "../services/orchestrator.js";
import { startSourcingPipeline } from "../services/orchestrator.js";

export function createDemandRouter(
  config: Config,
  log: Logger,
  redis: RedisClient,
  orchestratorDeps: OrchestratorDeps,
) {
  const r = Router();

  r.post("/", async (req, res) => {
    const parsed = demandSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_demand", details: parsed.error.flatten() });
      return;
    }
    const demand = await demandsRepo.createDemand(redis, parsed.data);
    const run = await runsRepo.createRun(redis, demand.id, "DEMAND_RECEIVED", req.header("x-correlation-id") ?? undefined);
    log.info("demand_created", { correlationId: run.correlationId, demandId: demand.id, runId: run.id });
    if (config.AUTO_START_RUN) {
      void startSourcingPipeline(orchestratorDeps, run.id);
    }
    res.status(201).json({ demand, run });
  });

  return r;
}
