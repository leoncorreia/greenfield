import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { NormalizedOffer } from "../models/run.js";

/**
 * Optional Nexla-style normalization. If keys absent, passthrough with log.
 */
export async function maybeNormalizeOffers(
  config: Config,
  log: Logger,
  correlationId: string,
  offers: NormalizedOffer[],
): Promise<NormalizedOffer[]> {
  if (!config.NEXLA_API_KEY || !config.NEXLA_BASE_URL) {
    log.info("nexla_skipped_passthrough", { correlationId, count: offers.length });
    return offers;
  }
  log.info("nexla_normalize_stub", { correlationId, count: offers.length });
  return offers;
}
