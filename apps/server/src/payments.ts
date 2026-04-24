import type { RedisClient } from "./redis/client.js";
import type { Config } from "./config.js";
import type { Logger } from "./logger.js";

export type PaymentAttempt = {
  provider: "x402" | "cdp" | "mpp" | "agentic_market";
  orderId: string;
  status: "skipped" | "mock_ok" | "http_error" | "network_error";
  httpStatus?: number;
  detail?: string;
};

function idempotencyKey(orderId: string, provider: PaymentAttempt["provider"]): string {
  return `idem:payment:${provider}:${orderId}`;
}

/**
 * Returns true if this is the first time we record this (orderId, provider) pair.
 */
export async function claimPaymentIdempotency(
  redis: RedisClient,
  orderId: string,
  provider: PaymentAttempt["provider"],
): Promise<boolean> {
  const key = idempotencyKey(orderId, provider);
  const res = await redis.set(key, "1", "EX", 60 * 60 * 24 * 30, "NX");
  return res === "OK";
}

async function postStub(
  url: string | undefined,
  body: Record<string, unknown>,
  log: Logger,
  correlationId: string,
  provider: string,
): Promise<Pick<PaymentAttempt, "status" | "httpStatus" | "detail">> {
  if (!url) {
    log.info("payment_stub_skipped_no_endpoint", { correlationId, provider });
    return { status: "skipped", detail: "endpoint unset" };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { status: "http_error", httpStatus: res.status, detail: t.slice(0, 500) };
    }
    return { status: "mock_ok", httpStatus: res.status };
  } catch (e) {
    return { status: "network_error", detail: String(e) };
  }
}

/**
 * Env-driven payment rail stubs. Safe: no secrets in code; idempotent per orderId.
 */
export async function attemptPaymentRails(
  config: Config,
  log: Logger,
  redis: RedisClient,
  input: { orderId: string; correlationId: string; amount: number; currency: string },
): Promise<PaymentAttempt[]> {
  const { orderId, correlationId, amount, currency } = input;
  const attempts: PaymentAttempt[] = [];

  const providers: { id: PaymentAttempt["provider"]; url?: string }[] = [
    { id: "x402", url: config.X402_ENDPOINT },
    { id: "cdp", url: config.CDP_ENDPOINT },
    { id: "mpp", url: config.MPP_ENDPOINT },
    { id: "agentic_market", url: config.AGENTIC_MARKET_ENDPOINT },
  ];

  for (const p of providers) {
    const first = await claimPaymentIdempotency(redis, orderId, p.id);
    if (!first) {
      log.info("payment_idempotent_skip", { correlationId, provider: p.id, orderId });
      attempts.push({ provider: p.id, orderId, status: "skipped", detail: "idempotent replay" });
      continue;
    }
    const body = { orderId, amount, currency, correlationId, stub: true };
    const r = await postStub(p.url, body, log, correlationId, p.id);
    attempts.push({ provider: p.id, orderId, ...r });
  }

  return attempts;
}
