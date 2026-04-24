import type { RedisClient } from "../redis/client.js";
import type { Logger } from "../logger.js";
import type { NormalizedOffer, NegotiationArtifact, NegotiationRoundEntry, VendorRankingArtifact } from "../models/run.js";
import { keys } from "../redis/keys.js";

/**
 * Simulated multi-party negotiation (no email). Max `maxRounds` alternating messages between top-two ranked vendors.
 */
export function simulateNegotiation(
  ranking: VendorRankingArtifact,
  candidates: NormalizedOffer[],
  maxRounds: number,
): NegotiationArtifact {
  const ids = ranking.rankedVendorIds.filter((id) => candidates.some((c) => c.vendorId === id));
  if (ids.length === 0) {
    throw new Error("negotiation_no_ranked_candidates");
  }
  if (ids.length === 1) {
    const only = candidates.find((c) => c.vendorId === ids[0])!;
    return {
      rounds: [],
      maxRounds: 0,
      selectedVendorId: only.vendorId,
      summary: `Single vendor **SIMULATION** — auto-selected ${only.vendorName} (${only.vendorId}).`,
    };
  }

  const a = candidates.find((c) => c.vendorId === ids[0])!;
  const b = candidates.find((c) => c.vendorId === ids[1])!;
  const rounds: NegotiationRoundEntry[] = [];
  const n = maxRounds;
  for (let r = 1; r <= n; r++) {
    const from = r % 2 === 1 ? a : b;
    const to = r % 2 === 1 ? b : a;
    const adjusted = (from.pricePerUnit * (1 - 0.004 * r)).toFixed(2);
    rounds.push({
      round: r,
      fromVendorId: from.vendorId,
      toVendorId: to.vendorId,
      message: `**SIMULATION** Round ${r}: ${from.vendorName} proposes $${adjusted}/u to ${to.vendorName} (counter-thread stored in Redis).`,
      simulation: true,
    });
  }
  return {
    rounds,
    maxRounds: n,
    selectedVendorId: ids[0],
    summary: `**SIMULATION** Completed ${n} negotiation round(s). Selected ranked vendor **${a.vendorName}** (${a.vendorId}) per policy.`,
  };
}

export async function persistNegotiationTranscript(
  redis: RedisClient,
  log: Logger,
  correlationId: string,
  runId: string,
  rounds: NegotiationRoundEntry[],
): Promise<void> {
  const k = keys.runNegotiationLog(runId);
  await redis.del(k);
  if (rounds.length === 0) {
    log.info("negotiation_transcript_empty", { correlationId, runId });
    return;
  }
  const payloads = rounds.map((r) => JSON.stringify(r));
  await redis.rpush(k, ...payloads);
  log.info("negotiation_transcript_persisted", { correlationId, runId, rounds: rounds.length });
}
