import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { DemandRecord } from "../models/demand.js";
import * as demandsRepo from "../repos/demands.js";
import * as runsRepo from "../repos/runs.js";
import { assertTransition, canTransition } from "../state-machine.js";
import type { RedisClient } from "../redis/client.js";
import { maybeNormalizeOffers } from "../integrations/nexla.js";
import { maybePersistResearchArtifacts } from "../integrations/optional-storage.js";
import {
  appendCited,
  buildFulfillmentInitCited,
  buildNegotiationCited,
  buildPaymentCited,
  buildRankingCited,
  buildSourcingCited,
} from "./cited.js";
import { runDiscovery } from "./discovery.js";
import { rankVendorOffers } from "../llm/ranking.js";
import { attemptPaymentRails } from "../payments.js";
import { keys } from "../redis/keys.js";
import { persistNegotiationTranscript, simulateNegotiation } from "./negotiation.js";

export type OrchestratorDeps = {
  config: Config;
  log: Logger;
  redis: RedisClient;
};

const activeRuns = new Set<string>();

/**
 * After **SHORTLISTED** + ranking: negotiation (SIMULATION) → selection → payment stubs → fulfillment tracking.
 */
async function executePostRankingPipeline(deps: OrchestratorDeps, runId: string): Promise<void> {
  const { config, log, redis } = deps;
  const run = await runsRepo.getRun(redis, runId);
  if (!run?.artifacts.ranking) throw new Error("post_ranking_missing_ranking");
  if (run.state !== "SHORTLISTED") {
    log.warn("post_ranking_wrong_state", { runId, state: run.state });
    return;
  }
  const demand = await demandsRepo.getDemand(redis, run.demandId);
  if (!demand) throw new Error("post_ranking_missing_demand");

  const ranking = run.artifacts.ranking;
  const candidates = run.artifacts.candidates;

  assertTransition(run.state, "NEGOTIATING");
  run.state = "NEGOTIATING";
  await runsRepo.saveRun(redis, run);
  await appendCited(config, log, {
    title: `Negotiation started (SIMULATION) — ${run.id}`,
    runId: run.id,
    correlationId: run.correlationId,
    phase: "NEGOTIATING",
    decision: `Bounded negotiation (max ${config.NEGOTIATION_MAX_ROUNDS} rounds). No email; transcript list: \`${keys.runNegotiationLog(run.id)}\`.`,
    sources: [
      {
        url: `internal://run/${run.id}/negotiation`,
        excerpt: "SIMULATION: in-process counteroffers between top-ranked vendors.",
      },
    ],
  });

  const neg = simulateNegotiation(ranking, candidates, config.NEGOTIATION_MAX_ROUNDS);
  await persistNegotiationTranscript(redis, log, run.correlationId, run.id, neg.rounds);
  run.artifacts.negotiation = neg;
  await runsRepo.saveRun(redis, run);

  assertTransition("NEGOTIATING", "SELECTED");
  run.state = "SELECTED";
  await runsRepo.saveRun(redis, run);
  await appendCited(config, log, buildNegotiationCited(run, neg));

  const selected = candidates.find((c) => c.vendorId === neg.selectedVendorId);
  if (!selected) throw new Error("post_ranking_selected_vendor_missing");
  const amount = Math.round(demand.units * selected.pricePerUnit * 100) / 100;
  const orderId = `order:${run.id}`;
  const attempts = await attemptPaymentRails(config, log, redis, {
    orderId,
    correlationId: run.correlationId,
    amount,
    currency: "USD",
  });
  run.artifacts.payment = { attempts, orderId, amount, currency: "USD" };

  assertTransition("SELECTED", "PAYMENT_SUBMITTED");
  run.state = "PAYMENT_SUBMITTED";
  await runsRepo.saveRun(redis, run);
  await appendCited(config, log, buildPaymentCited(run, run.artifacts.payment));

  assertTransition("PAYMENT_SUBMITTED", "FULFILLMENT_TRACKING");
  run.state = "FULFILLMENT_TRACKING";
  run.artifacts.fulfillment = {
    phase: "PREPARING",
    delayCount: 0,
    simulation: true,
    events: [
      {
        at: new Date().toISOString(),
        note: "SIMULATION: carrier assigned; use POST /demo/advance-shipment to progress or inject delays.",
      },
    ],
  };
  await runsRepo.saveRun(redis, run);
  await appendCited(config, log, buildFulfillmentInitCited(run));

  log.info("close_loop_through_fulfillment", {
    correlationId: run.correlationId,
    runId,
    selectedVendorId: neg.selectedVendorId,
    orderId,
  });
}

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

    try {
      await executePostRankingPipeline(deps, runId);
    } catch (e2) {
      log.error("post_ranking_pipeline_failed", { runId, err: String(e2) });
      const r2 = await runsRepo.getRun(redis, runId);
      if (r2 && canTransition(r2.state, "ESCALATED")) {
        assertTransition(r2.state, "ESCALATED");
        r2.state = "ESCALATED";
        r2.artifacts.lastSourcingNote = String(e2);
        await runsRepo.saveRun(redis, r2);
      }
    }
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
