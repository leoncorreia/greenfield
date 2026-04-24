import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { DemandRecord } from "../models/demand.js";
import * as demandsRepo from "../repos/demands.js";
import * as runsRepo from "../repos/runs.js";
import { assertTransition, canTransition } from "../state-machine.js";
import type { RedisClient } from "../redis/client.js";
import { maybeNormalizeOffers } from "../integrations/nexla.js";
import { maybePersistResearchArtifacts } from "../integrations/optional-storage.js";
import { appendCited, buildRankingCited, buildSourcingCited } from "./cited.js";
import { runDiscovery } from "./discovery.js";
import { rankVendorOffers } from "../llm/ranking.js";

export type OrchestratorDeps = {
  config: Config;
  log: Logger;
  redis: RedisClient;
};

const activeRuns = new Set<string>();

export async function startSourcingPipeline(deps: OrchestratorDeps, runId: string): Promise<void> {
  if (activeRuns.has(runId)) {
    deps.log.warn("orchestrator_run_already_active", { runId });
    return;
  }
  activeRuns.add(runId);

  const controller = new AbortController();
  const { config, log, redis } = deps;

  try {
    const run = await runsRepo.getRun(redis, runId);
    if (!run) {
      log.error("orchestrator_run_missing", { runId });
      return;
    }
    const demand = await demandsRepo.getDemand(redis, run.demandId);
    if (!demand) {
      log.error("orchestrator_demand_missing", { runId, demandId: run.demandId });
      return;
    }

    assertTransition(run.state, "SOURCING");
    run.state = "SOURCING";
    await runsRepo.saveRun(redis, run);
    log.info("run_state_transition", {
      correlationId: run.correlationId,
      runId,
      state: run.state,
    });
    await appendCited(config, log, {
      title: `Run started — sourcing`,
      runId: run.id,
      correlationId: run.correlationId,
      phase: "SOURCING",
      decision: "Pipeline kicked; entering sourcing phase (mock or web discovery per config).",
      sources: [
        {
          url: `internal://demand/${demand.id}`,
          excerpt: `Demand ${demand.sku} × ${demand.units} ≤ $${demand.maxPricePerUnit}/u by ${demand.deliveryBy}`,
        },
      ],
    });

    const { offers, note } = await runDiscovery(config, log, run.correlationId, demand, controller.signal);
    const normalized = await maybeNormalizeOffers(config, log, run.correlationId, offers);

    assertTransition("SOURCING", "SHORTLISTED");
    run.state = "SHORTLISTED";
    run.artifacts.candidates = normalized;
    run.artifacts.lastSourcingNote = note;
    await runsRepo.saveRun(redis, run);
    await maybePersistResearchArtifacts(config, log, run.correlationId, normalized);

    log.info("run_state_transition", {
      correlationId: run.correlationId,
      runId,
      state: run.state,
      candidates: normalized.length,
    });

    await appendCited(config, log, buildSourcingCited(run, note));

    const ranking = await rankVendorOffers(config, log, run.correlationId, demand, normalized);
    run.artifacts.ranking = ranking;
    await runsRepo.saveRun(redis, run);
    await appendCited(config, log, buildRankingCited(run, ranking));
    log.info("ranking_persisted", {
      correlationId: run.correlationId,
      runId,
      provider: ranking.provider,
    });
  } catch (e) {
    log.error("orchestrator_failed", { runId, err: String(e) });
    const run = await runsRepo.getRun(redis, runId);
    if (run && canTransition(run.state, "ESCALATED")) {
      assertTransition(run.state, "ESCALATED");
      run.state = "ESCALATED";
      run.artifacts.lastSourcingNote = String(e);
      await runsRepo.saveRun(redis, run);
    }
  } finally {
    activeRuns.delete(runId);
  }
}

export async function ensureDemandLoaded(deps: OrchestratorDeps, demandId: string): Promise<DemandRecord | null> {
  return demandsRepo.getDemand(deps.redis, demandId);
}
