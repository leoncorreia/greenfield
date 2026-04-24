import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { DemandRecord } from "../models/demand.js";
import type { NormalizedOffer } from "../models/run.js";
import { isUrlAllowedByRobots } from "./robots.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const mockQuoteSchema = {
  vendorId: true,
  vendorName: true,
  sku: true,
  pricePerUnit: true,
  moq: true,
  leadTimeDays: true,
} as const;

async function fetchJson(url: string, signal: AbortSignal, log: Logger, correlationId: string): Promise<unknown> {
  log.debug("discovery_fetch", { correlationId, url });
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json", "User-Agent": "GreenfieldVendorOps/0.1 (+https://github.com)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<unknown>;
}

function normalizeMockPayload(raw: unknown, sourceUrl: string): NormalizedOffer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(mockQuoteSchema)) {
    if (!(k in o)) return null;
  }
  return {
    vendorId: String(o.vendorId),
    vendorName: String(o.vendorName),
    sku: String(o.sku),
    pricePerUnit: Number(o.pricePerUnit),
    moq: Number(o.moq),
    leadTimeDays: Number(o.leadTimeDays),
    sourceUrl,
    simulation: true as const,
  };
}

/**
 * Mock path: call in-repo JSON quote endpoints (labeled simulation).
 */
export async function discoverFromMocks(
  config: Config,
  log: Logger,
  correlationId: string,
  demand: DemandRecord,
  signal: AbortSignal,
): Promise<NormalizedOffer[]> {
  const base = config.PUBLIC_BASE_URL.replace(/\/$/, "");
  const urls = [
    `${base}/mock/vendor-a?sku=${encodeURIComponent(demand.sku)}&units=${demand.units}`,
    `${base}/mock/vendor-b?sku=${encodeURIComponent(demand.sku)}&units=${demand.units}`,
  ];
  const out: NormalizedOffer[] = [];
  for (const url of urls) {
    await sleep(config.WEB_DISCOVERY_RATE_MS);
    const raw = await fetchJson(url, signal, log, correlationId);
    const n = normalizeMockPayload(raw, url);
    if (n) out.push(n);
  }
  return out;
}

/**
 * Bounded public fetch: seed URLs only; robots.txt + max pages + rate limit.
 * Extracts coarse "signals" from JSON responses or `<title>` for audit — no paywalls.
 */
export async function discoverFromWeb(
  config: Config,
  log: Logger,
  correlationId: string,
  demand: DemandRecord,
  signal: AbortSignal,
): Promise<{ offers: NormalizedOffer[]; note: string }> {
  const seeds =
    config.WEB_DISCOVERY_SEED_URLS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  if (!seeds.length) {
    log.warn("web_discovery_no_seeds", { correlationId });
    return { offers: [], note: "WEB_DISCOVERY_ENABLED but WEB_DISCOVERY_SEED_URLS empty — no pages fetched." };
  }

  const max = config.WEB_DISCOVERY_MAX_PAGES;
  const offers: NormalizedOffer[] = [];
  let pages = 0;

  for (const seed of seeds) {
    if (pages >= max) break;
    await sleep(config.WEB_DISCOVERY_RATE_MS);
    const allowed = await isUrlAllowedByRobots(seed, signal);
    if (!allowed) {
      log.info("web_discovery_robots_disallow", { correlationId, seed });
      continue;
    }
    pages += 1;
    const res = await fetch(seed, {
      signal,
      headers: { "User-Agent": "GreenfieldVendorOps/0.1 (+https://github.com)" },
    });
    if (!res.ok) {
      log.warn("web_discovery_fetch_failed", { correlationId, seed, status: res.status });
      continue;
    }
    const ct = res.headers.get("content-type") ?? "";
    const url = res.url;
    if (ct.includes("application/json")) {
      const raw = (await res.json()) as unknown;
      const n = normalizeMockPayload(raw, url);
      if (n) {
        offers.push({ ...n, simulation: false });
        continue;
      }
    }
    const html = await res.text();
    const title = html.match(/<title>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? "(no title)";
    offers.push({
      vendorId: `web:${pages}`,
      vendorName: title.slice(0, 120),
      sku: demand.sku,
      pricePerUnit: demand.maxPricePerUnit * 0.95,
      moq: 1,
      leadTimeDays: 14,
      sourceUrl: url,
      simulation: true,
    });
  }

  const note =
    offers.length === 0
      ? `Web discovery scanned ${pages} page(s); no normalizable offers (see logs).`
      : `Web discovery normalized ${offers.length} offer(s) from ${pages} page(s) (bounded pipeline).`;

  return { offers, note };
}

export async function runDiscovery(
  config: Config,
  log: Logger,
  correlationId: string,
  demand: DemandRecord,
  signal: AbortSignal,
): Promise<{ offers: NormalizedOffer[]; note: string }> {
  if (config.WEB_DISCOVERY_ENABLED) {
    return discoverFromWeb(config, log, correlationId, demand, signal);
  }
  const offers = await discoverFromMocks(config, log, correlationId, demand, signal);
  return {
    offers,
    note: `Mock vendor discovery (${offers.length} quotes). **SIMULATION**: in-repo JSON vendors only.`,
  };
}
