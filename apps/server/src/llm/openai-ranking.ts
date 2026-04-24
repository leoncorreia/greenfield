import type { Config } from "../config.js";
import type { Logger } from "../logger.js";

/** Official GMI Inference Engine chat base (OpenAI-compatible). Override with `GMI_BASE_URL` if needed. */
export const GMI_DEFAULT_CHAT_BASE = "https://api.gmi-serving.com/v1";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

export type ChatCompletionsRankingParams = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Log label only */
  providerLabel: string;
};

/**
 * OpenAI-compatible `POST /chat/completions` with JSON response format (works for OpenAI, GMI Cloud, and similar gateways).
 */
export async function callChatCompletionsRanking(
  log: Logger,
  correlationId: string,
  params: ChatCompletionsRankingParams,
  userPrompt: string,
): Promise<string> {
  const base = params.baseUrl.replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const body = {
    model: params.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system" as const,
        content:
          "You are a procurement analyst. Output a single JSON object only, matching the user schema. No prose outside JSON.",
      },
      { role: "user" as const, content: userPrompt },
    ],
  };
  log.debug("chat_completions_ranking_request", {
    correlationId,
    url,
    model: params.model,
    provider: params.providerLabel,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`${params.providerLabel} HTTP ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as ChatCompletionResponse;
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${params.providerLabel} empty content`);
  return text;
}

export function resolveOpenAiRankingParams(config: Config): ChatCompletionsRankingParams | null {
  if (!config.OPENAI_API_KEY?.trim()) return null;
  const baseUrl = (config.OPENAI_BASE_URL ?? "https://api.openai.com/v1").trim();
  return {
    baseUrl,
    apiKey: config.OPENAI_API_KEY.trim(),
    model: config.OPENAI_MODEL,
    providerLabel: "openai",
  };
}

const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

/**
 * GMI Cloud: same wire protocol as OpenAI. Prefer `GMI_*`; `OPENAI_*` is accepted as fallback for shared secrets files.
 * Model: `GMI_MODEL`, else `OPENAI_MODEL` if it was changed from the OpenAI default (avoids sending `gpt-4o-mini` to GMI by mistake).
 */
export function resolveGmiRankingParams(config: Config): ChatCompletionsRankingParams | null {
  const apiKey = (config.GMI_API_KEY ?? config.OPENAI_API_KEY)?.trim();
  if (!apiKey) return null;
  const baseUrl = (config.GMI_BASE_URL ?? config.OPENAI_BASE_URL ?? GMI_DEFAULT_CHAT_BASE).trim();
  const explicit = config.GMI_MODEL?.trim();
  const openaiModel = config.OPENAI_MODEL.trim();
  const reusedOpenAi =
    openaiModel && openaiModel !== OPENAI_DEFAULT_MODEL ? openaiModel : "";
  const model = explicit || reusedOpenAi;
  if (!model) return null;
  return {
    baseUrl,
    apiKey,
    model,
    providerLabel: "gmi",
  };
}
