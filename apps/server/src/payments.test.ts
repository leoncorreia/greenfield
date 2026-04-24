import { describe, expect, it, vi } from "vitest";
import type { RedisClient } from "./redis/client.js";
import { attemptPaymentRails, claimPaymentIdempotency } from "./payments.js";
import type { Config } from "./config.js";
import { createLogger } from "./logger.js";

function fakeRedis(): RedisClient {
  const keys = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, val: string, ...args: unknown[]) => {
      const nx = args.includes("NX");
      if (nx && keys.has(key)) return null;
      keys.set(key, val);
      return "OK";
    }),
  } as unknown as RedisClient;
}

const baseConfig = {
  NODE_ENV: "development",
  PORT: 8080,
  LOG_LEVEL: "info",
  REDIS_URL: "redis://localhost",
  PUBLIC_BASE_URL: "http://127.0.0.1:8080",
  CITED_MD_PATH: "./cited.md",
  AUTO_START_RUN: false,
  WEB_DISCOVERY_ENABLED: false,
  WEB_DISCOVERY_MAX_PAGES: 10,
  WEB_DISCOVERY_RATE_MS: 0,
  WEB_DISCOVERY_SEED_URLS: undefined,
  LLM_PROVIDER: "none",
  OPENAI_BASE_URL: undefined,
  OPENAI_API_KEY: undefined,
  OPENAI_MODEL: "gpt-4o-mini",
  AWS_REGION: undefined,
  AWS_BEDROCK_MODEL_ID: undefined,
  NEXLA_API_KEY: undefined,
  NEXLA_BASE_URL: undefined,
  GHOST_ADMIN_API_KEY: undefined,
  GHOST_CONTENT_API_URL: undefined,
  TIGERDATA_DATABASE_URL: undefined,
  X402_ENDPOINT: undefined,
  CDP_ENDPOINT: undefined,
  MPP_ENDPOINT: undefined,
  AGENTIC_MARKET_ENDPOINT: undefined,
  RUN_INTEGRATION_TESTS: false,
} satisfies Config;

describe("payment idempotency", () => {
  it("claimPaymentIdempotency only allows first claim", async () => {
    const redis = fakeRedis();
    const a = await claimPaymentIdempotency(redis, "order-1", "x402");
    const b = await claimPaymentIdempotency(redis, "order-1", "x402");
    expect(a).toBe(true);
    expect(b).toBe(false);
  });

  it("attemptPaymentRails skips HTTP when endpoints unset", async () => {
    const redis = fakeRedis();
    const log = createLogger(baseConfig);
    const attempts = await attemptPaymentRails(baseConfig, log, redis, {
      orderId: "order-xyz",
      correlationId: "cid",
      amount: 42,
      currency: "USD",
    });
    expect(attempts.length).toBe(4);
    expect(attempts.every((a) => a.status === "skipped")).toBe(true);
  });
});
