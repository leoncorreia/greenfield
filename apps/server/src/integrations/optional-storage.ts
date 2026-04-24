import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { NormalizedOffer } from "../models/run.js";

/**
 * Ghost / TigerData hooks: if keys absent, skip with structured log.
 */
export async function maybePersistResearchArtifacts(
  config: Config,
  log: Logger,
  correlationId: string,
  offers: NormalizedOffer[],
): Promise<void> {
  if (!config.GHOST_ADMIN_API_KEY && !config.GHOST_CONTENT_API_URL) {
    log.info("ghost_skipped", { correlationId, offers: offers.length });
  } else {
    log.info("ghost_persist_stub", { correlationId, offers: offers.length });
  }
  if (!config.TIGERDATA_DATABASE_URL) {
    log.info("tigerdata_skipped", { correlationId });
  } else {
    log.info("tigerdata_persist_stub", { correlationId });
  }
}
