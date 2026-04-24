import { appendFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type {
  NegotiationArtifact,
  PaymentArtifact,
  RunRecord,
  VendorRankingArtifact,
} from "../models/run.js";

export type CitedSection = {
  title: string;
  runId: string;
  correlationId: string;
  phase: string;
  decision: string;
  sources: { url: string; excerpt: string }[];
};

function formatSection(s: CitedSection): string {
  const lines = [
    `## ${s.title}`,
    `_Run_: \`${s.runId}\` · _Correlation_: \`${s.correlationId}\` · _Phase_: **${s.phase}**`,
    "",
    "**Decision**",
    s.decision,
    "",
    "**Sources**",
  ];
  for (const src of s.sources) {
    lines.push(`- ${src.url}`);
    lines.push(`  > ${src.excerpt.replace(/\s+/g, " ").slice(0, 400)}`);
  }
  lines.push("", "---", "");
  return lines.join("\n");
}

export async function appendCited(
  config: Config,
  log: Logger,
  section: CitedSection,
): Promise<void> {
  const path = config.CITED_MD_PATH;
  try {
    await mkdir(dirname(path), { recursive: true });
  } catch {
    // ignore if dirname is "."
  }
  const body = formatSection(section);
  await appendFile(path, body, { encoding: "utf8" });
  log.info("cited_appended", {
    correlationId: section.correlationId,
    phase: section.phase,
    path,
  });
}

export async function readLatestCited(config: Config): Promise<{ path: string; text: string; updatedHint: string }> {
  const { readFile, stat } = await import("fs/promises");
  const path = config.CITED_MD_PATH;
  try {
    const [text, st] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    return {
      path,
      text,
      updatedHint: st.mtime.toISOString(),
    };
  } catch {
    return {
      path,
      text: "_No cited.md yet._\n",
      updatedHint: "never",
    };
  }
}

export function buildSourcingCited(run: RunRecord, note: string): CitedSection {
  const sources = run.artifacts.candidates.map((c) => ({
    url: c.sourceUrl,
    excerpt: `${c.vendorName}: $${c.pricePerUnit}/u, MOQ ${c.moq}, lead ${c.leadTimeDays}d`,
  }));
  return {
    title: `Sourcing complete — ${run.id}`,
    runId: run.id,
    correlationId: run.correlationId,
    phase: run.state,
    decision: note,
    sources: sources.length ? sources : [{ url: internalRunRef(run), excerpt: note }],
  };
}

function internalRunRef(run: RunRecord): string {
  return `internal://run/${run.id}/sourcing`;
}

export function buildNegotiationCited(run: RunRecord, n: NegotiationArtifact): CitedSection {
  const sources = n.rounds.map((r) => ({
    url: `internal://negotiation/${run.id}/round-${r.round}`,
    excerpt: r.message,
  }));
  return {
    title: `Negotiation complete (SIMULATION) — ${run.id}`,
    runId: run.id,
    correlationId: run.correlationId,
    phase: "SELECTED",
    decision: `${n.summary}\n\n**Selected vendorId:** \`${n.selectedVendorId}\``,
    sources: sources.length
      ? sources
      : [{ url: internalRunRef(run), excerpt: "Single-vendor path; no multi-party rounds." }],
  };
}

export function buildPaymentCited(run: RunRecord, p: PaymentArtifact): CitedSection {
  const lines = p.attempts.map((a) => `- **${a.provider}**: ${a.status}${a.detail ? ` — ${a.detail}` : ""}`).join("\n");
  return {
    title: `Payment rail attempts — ${run.id}`,
    runId: run.id,
    correlationId: run.correlationId,
    phase: "PAYMENT_SUBMITTED",
    decision: `Order \`${p.orderId}\` · amount **${p.amount} ${p.currency}** (stub rails; no real settlement).\n\n${lines}`,
    sources: [{ url: `internal://payment/${p.orderId}`, excerpt: "Env-driven POST stubs only." }],
  };
}

export function buildFulfillmentInitCited(run: RunRecord): CitedSection {
  const f = run.artifacts.fulfillment;
  const excerpt = f ? `phase=${f.phase}, delays=${f.delayCount}` : "fulfillment artifact missing";
  return {
    title: `Fulfillment tracking started (SIMULATION) — ${run.id}`,
    runId: run.id,
    correlationId: run.correlationId,
    phase: "FULFILLMENT_TRACKING",
    decision:
      "Carrier + tracking are **SIMULATION**. Use `POST /demo/advance-shipment` with `{ \"runId\", \"kind\": \"progress\" | \"delay\" }` to move the story.",
    sources: [{ url: `internal://fulfillment/${run.id}`, excerpt }],
  };
}

export function buildRankingCited(run: RunRecord, ranking: VendorRankingArtifact): CitedSection {
  const sources = ranking.citedHighlights.map((h) => ({
    url: h.sourceUrl,
    excerpt: `${h.vendorId}: ${h.excerpt}`,
  }));
  const decisionParts = [
    `**Provider**: \`${ranking.provider}\``,
    `**Order**: ${ranking.rankedVendorIds.join(" → ")}`,
    "",
    ranking.rationale,
  ];
  if (ranking.anomalies?.length) {
    decisionParts.push("", "**Anomalies**", ...ranking.anomalies.map((a) => `- ${a}`));
  }
  return {
    title: `LLM / heuristic ranking — ${run.id}`,
    runId: run.id,
    correlationId: run.correlationId,
    phase: "SHORTLISTED",
    decision: decisionParts.join("\n"),
    sources: sources.length ? sources : [{ url: internalRunRef(run), excerpt: "No per-vendor highlights returned." }],
  };
}
