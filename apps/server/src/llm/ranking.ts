import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { DemandRecord } from "../models/demand.js";
import type { NormalizedOffer, VendorRankingArtifact } from "../models/run.js";
import { parseVendorRankingOutput, type VendorRankingOutput } from "./ranking-schema.js";
import { callChatCompletionsRanking, resolveGmiRankingParams, resolveOpenAiRankingParams } from "./openai-ranking.js";
import { callBedrockRanking } from "./bedrock-ranking.js";

function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  const body = fence ? fence[1].trim() : trimmed;
  return JSON.parse(body) as unknown;
}

function rankingPrompt(demand: DemandRecord, offers: NormalizedOffer[]): string {
  const lines = offers.map(
    (o) =>
      `- vendorId=${o.vendorId} name=${o.vendorName} sku=${o.sku} pricePerUnit=${o.pricePerUnit} moq=${o.moq} leadTimeDays=${o.leadTimeDays} sourceUrl=${o.sourceUrl} simulation=${o.simulation ?? false}`,
  );
  return [
    `You rank suppliers for a procurement agent. Respond with JSON only (no markdown) matching this shape:`,
    `{"rankedVendorIds":["..."],"rationale":"...","highlights":[{"vendorId":"...","excerpt":"..."}],"anomalies":["optional"]}`,
    ``,
    `Demand: sku=${demand.sku} units=${demand.units} maxPricePerUnit=${demand.maxPricePerUnit} deliveryBy=${demand.deliveryBy}`,
    `Candidates:`,
    ...lines,
    ``,
    `Rules: rankedVendorIds must include every vendorId exactly once, best first. Cite concrete numbers from candidates in rationale and highlights. Flag anomalies (e.g. price above max, MOQ above units) in anomalies.`,
  ].join("\n");
}

export function rankOffersHeuristic(demand: DemandRecord, offers: NormalizedOffer[]): VendorRankingOutput {
  const scored = offers.map((o) => {
    const priceOk = o.pricePerUnit <= demand.maxPricePerUnit;
    const moqOk = o.moq <= demand.units;
    const priceScore = o.pricePerUnit;
    const leadScore = o.leadTimeDays * 0.05;
    const moqPenalty = moqOk ? 0 : 50;
    const pricePenalty = priceOk ? 0 : 100;
    const score = priceScore + leadScore + moqPenalty + pricePenalty;
    return { o, score, priceOk, moqOk };
  });
  scored.sort((a, b) => a.score - b.score);
  const rankedVendorIds = scored.map((s) => s.o.vendorId);
  const anomalies: string[] = [];
  for (const s of scored) {
    if (!s.priceOk) anomalies.push(`${s.o.vendorId}: price ${s.o.pricePerUnit} exceeds max ${demand.maxPricePerUnit}`);
    if (!s.moqOk) anomalies.push(`${s.o.vendorId}: MOQ ${s.o.moq} exceeds demand units ${demand.units}`);
  }
  const rationale = `Heuristic rank (LLM_PROVIDER=none): sorted by effective score (price + 0.05×lead + penalties for MOQ/units and price cap). Top pick: ${scored[0]?.o.vendorName ?? "n/a"}.`;
  const highlights = scored.slice(0, 3).map((s) => ({
    vendorId: s.o.vendorId,
    excerpt: `${s.o.vendorName}: $${s.o.pricePerUnit}/u, MOQ ${s.o.moq}, ${s.o.leadTimeDays}d`,
  }));
  return { rankedVendorIds, rationale, highlights, anomalies: anomalies.length ? anomalies : undefined };
}

function sanitizeRankingToCandidates(
  parsed: VendorRankingOutput,
  offers: NormalizedOffer[],
): VendorRankingOutput {
  const ids = new Set(offers.map((o) => o.vendorId));
  const ordered: string[] = [];
  for (const id of parsed.rankedVendorIds) {
    if (ids.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  for (const o of offers) {
    if (!ordered.includes(o.vendorId)) ordered.push(o.vendorId);
  }
  return { ...parsed, rankedVendorIds: ordered };
}

function toArtifact(
  provider: VendorRankingArtifact["provider"],
  parsed: VendorRankingOutput,
  offers: NormalizedOffer[],
): VendorRankingArtifact {
  const byId = new Map(offers.map((o) => [o.vendorId, o]));
  const citedHighlights = (parsed.highlights ?? []).map((h) => {
    const o = byId.get(h.vendorId);
    return {
      vendorId: h.vendorId,
      excerpt: h.excerpt,
      sourceUrl: o?.sourceUrl ?? `internal://vendor/${h.vendorId}`,
    };
  });
  return {
    provider,
    rankedVendorIds: parsed.rankedVendorIds,
    rationale: parsed.rationale,
    anomalies: parsed.anomalies,
    citedHighlights,
  };
}

export async function rankVendorOffers(
  config: Config,
  log: Logger,
  correlationId: string,
  demand: DemandRecord,
  offers: NormalizedOffer[],
): Promise<VendorRankingArtifact> {
  if (!offers.length) {
    return {
      provider: "none",
      rankedVendorIds: [],
      rationale: "No candidates to rank.",
      citedHighlights: [],
    };
  }

  if (config.LLM_PROVIDER === "none") {
    const parsed = rankOffersHeuristic(demand, offers);
    log.info("ranking_heuristic", { correlationId, count: offers.length });
    return toArtifact("none", parsed, offers);
  }

  const prompt = rankingPrompt(demand, offers);

  if (config.LLM_PROVIDER === "openai") {
    const p = resolveOpenAiRankingParams(config);
    if (!p) {
      log.warn("ranking_openai_missing_key_fallback", { correlationId });
      return toArtifact("none", rankOffersHeuristic(demand, offers), offers);
    }
    try {
      const rawText = await callChatCompletionsRanking(log, correlationId, p, prompt);
      const json = extractJsonValue(rawText);
      const parsed = sanitizeRankingToCandidates(parseVendorRankingOutput(json), offers);
      log.info("ranking_openai_ok", { correlationId });
      return toArtifact("openai", parsed, offers);
    } catch (e) {
      log.error("ranking_openai_failed", { correlationId, err: String(e) });
      return toArtifact("none", rankOffersHeuristic(demand, offers), offers);
    }
  }

  if (config.LLM_PROVIDER === "gmi") {
    const p = resolveGmiRankingParams(config);
    if (!p) {
      log.warn("ranking_gmi_missing_config_fallback", {
        correlationId,
        hint: "Set GMI_API_KEY and GMI_MODEL (or OPENAI_MODEL to a GMI model id). Optional: GMI_BASE_URL.",
      });
      return toArtifact("none", rankOffersHeuristic(demand, offers), offers);
    }
    try {
      const rawText = await callChatCompletionsRanking(log, correlationId, p, prompt);
      const json = extractJsonValue(rawText);
      const parsed = sanitizeRankingToCandidates(parseVendorRankingOutput(json), offers);
      log.info("ranking_gmi_ok", { correlationId, model: p.model });
      return toArtifact("gmi", parsed, offers);
    } catch (e) {
      log.error("ranking_gmi_failed", { correlationId, err: String(e) });
      return toArtifact("none", rankOffersHeuristic(demand, offers), offers);
    }
  }

  if (config.LLM_PROVIDER === "bedrock") {
    if (!config.AWS_REGION || !config.AWS_BEDROCK_MODEL_ID) {
      log.warn("ranking_bedrock_missing_config_fallback", { correlationId });
      return toArtifact("none", rankOffersHeuristic(demand, offers), offers);
    }
    try {
      const rawText = await callBedrockRanking(config, log, correlationId, prompt);
      const json = extractJsonValue(rawText);
      const parsed = sanitizeRankingToCandidates(parseVendorRankingOutput(json), offers);
      log.info("ranking_bedrock_ok", { correlationId });
      return toArtifact("bedrock", parsed, offers);
    } catch (e) {
      log.error("ranking_bedrock_failed", { correlationId, err: String(e) });
      return toArtifact("none", rankOffersHeuristic(demand, offers), offers);
    }
  }

  return toArtifact("none", rankOffersHeuristic(demand, offers), offers);
}
