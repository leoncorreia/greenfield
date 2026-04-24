import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { FulfillmentPhase, RunRecord } from "../models/run.js";
import * as runsRepo from "../repos/runs.js";
import { assertTransition, canTransition } from "../state-machine.js";
import type { RedisClient } from "../redis/client.js";
import { appendCited, type CitedSection } from "./cited.js";

export type AdvanceKind = "progress" | "delay";

function nextFulfillmentPhase(p: FulfillmentPhase): FulfillmentPhase | null {
  switch (p) {
    case "PREPARING":
      return "IN_TRANSIT";
    case "IN_TRANSIT":
      return "OUT_FOR_DELIVERY";
    case "OUT_FOR_DELIVERY":
      return "DELIVERED";
    case "DELIVERED":
      return null;
    default:
      return null;
  }
}

function buildAdvanceCited(run: RunRecord, note: string): CitedSection {
  const f = run.artifacts.fulfillment;
  return {
    title: `Fulfillment update — ${run.id}`,
    runId: run.id,
    correlationId: run.correlationId,
    phase: run.state,
    decision: note,
    sources: f
      ? [
          {
            url: `internal://run/${run.id}/fulfillment`,
            excerpt: `phase=${f.phase} delays=${f.delayCount}`,
          },
        ]
      : [{ url: `internal://run/${run.id}/fulfillment`, excerpt: note }],
  };
}

/**
 * **SIMULATION** — advance carrier state or record a delay. Escalates if `delayCount` exceeds config threshold.
 */
export async function advanceShipmentSimulation(
  config: Config,
  log: Logger,
  redis: RedisClient,
  runId: string,
  kind: AdvanceKind,
): Promise<{ ok: true; run: RunRecord } | { ok: false; error: string; status: number }> {
  const run = await runsRepo.getRun(redis, runId);
  if (!run) return { ok: false, error: "run_not_found", status: 404 };
  if (run.state !== "FULFILLMENT_TRACKING") {
    return { ok: false, error: "run_not_in_fulfillment", status: 409 };
  }
  const f = run.artifacts.fulfillment;
  if (!f) return { ok: false, error: "fulfillment_missing", status: 409 };

  const threshold = config.FULFILLMENT_ESCALATE_AFTER_DELAYS;
  const now = new Date().toISOString();

  if (kind === "delay") {
    f.delayCount += 1;
    f.events.push({ at: now, note: `SIMULATION: carrier delay recorded (#${f.delayCount}).` });
    if (f.delayCount > threshold && canTransition(run.state, "ESCALATED")) {
      assertTransition(run.state, "ESCALATED");
      run.state = "ESCALATED";
      await runsRepo.saveRun(redis, run);
      await appendCited(
        config,
        log,
        buildAdvanceCited(
          run,
          `Escalated: delay count **${f.delayCount}** exceeds threshold **${threshold}** (SIMULATION).`,
        ),
      );
      log.warn("fulfillment_escalated_delays", { runId, delayCount: f.delayCount, correlationId: run.correlationId });
      return { ok: true, run };
    }
    await runsRepo.saveRun(redis, run);
    await appendCited(
      config,
      log,
      buildAdvanceCited(run, `Delay recorded; count=${f.delayCount} (threshold ${threshold}).`),
    );
    return { ok: true, run };
  }

  const next = nextFulfillmentPhase(f.phase);
  if (next === null) {
    if (canTransition(run.state, "COMPLETED")) {
      assertTransition(run.state, "COMPLETED");
      run.state = "COMPLETED";
      f.events.push({ at: now, note: "SIMULATION: marked delivered; closing run." });
      await runsRepo.saveRun(redis, run);
      await appendCited(config, log, buildAdvanceCited(run, "Order **COMPLETED** (SIMULATION fulfillment)."));
      log.info("fulfillment_completed", { runId, correlationId: run.correlationId });
    }
    return { ok: true, run };
  }

  f.phase = next;
  f.events.push({ at: now, note: `SIMULATION: phase advanced to **${next}**.` });
  await runsRepo.saveRun(redis, run);
  await appendCited(config, log, buildAdvanceCited(run, `Shipment phase → **${next}**.`));
  log.info("fulfillment_progress", { runId, phase: f.phase, correlationId: run.correlationId });
  return { ok: true, run };
}
