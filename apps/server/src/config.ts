import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8080),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  PUBLIC_BASE_URL: z.string().url().default("http://127.0.0.1:8080"),
  CITED_MD_PATH: z.string().default("./cited.md"),
  /** If set and the directory exists (e.g. `apps/web/dist`), the API also serves the Vite SPA for one-URL demos. */
  STATIC_WEB_ROOT: z.string().optional(),
  AUTO_START_RUN: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),

  WEB_DISCOVERY_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  WEB_DISCOVERY_MAX_PAGES: z.coerce.number().min(1).max(50).default(10),
  WEB_DISCOVERY_RATE_MS: z.coerce.number().min(0).default(750),
  WEB_DISCOVERY_SEED_URLS: z.string().optional(),

  LLM_PROVIDER: z.enum(["none", "openai", "bedrock", "gmi"]).default("none"),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  /** GMI Cloud Inference Engine (OpenAI-compatible). See https://docs.gmicloud.ai/inference-engine/api-reference/llm-api-reference */
  GMI_API_KEY: z.string().optional(),
  GMI_BASE_URL: z.string().url().optional(),
  GMI_MODEL: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_BEDROCK_MODEL_ID: z.string().optional(),

  NEXLA_API_KEY: z.string().optional(),
  NEXLA_BASE_URL: z.string().optional(),
  GHOST_ADMIN_API_KEY: z.string().optional(),
  GHOST_CONTENT_API_URL: z.string().optional(),
  TIGERDATA_DATABASE_URL: z.string().optional(),

  X402_ENDPOINT: z.string().optional(),
  CDP_ENDPOINT: z.string().optional(),
  MPP_ENDPOINT: z.string().optional(),
  AGENTIC_MARKET_ENDPOINT: z.string().optional(),

  NEGOTIATION_MAX_ROUNDS: z.coerce.number().int().min(1).max(5).default(5),
  /** Escalate fulfillment when delay count exceeds this (e.g. 3 means 4+ delays escalate). */
  FULFILLMENT_ESCALATE_AFTER_DELAYS: z.coerce.number().int().min(1).max(20).default(3),

  RUN_INTEGRATION_TESTS: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) {
    const v = env[key];
    if (v !== undefined && v.trim() === "") {
      delete env[key];
    }
  }
  if (!env.PUBLIC_BASE_URL?.trim() && env.RENDER_EXTERNAL_URL?.trim()) {
    env.PUBLIC_BASE_URL = env.RENDER_EXTERNAL_URL.trim();
  }
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  return parsed.data;
}
