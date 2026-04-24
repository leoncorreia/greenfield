import type { Config } from "../config.js";
import type { Logger } from "../logger.js";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

export async function callOpenAiRanking(
  config: Config,
  log: Logger,
  correlationId: string,
  userPrompt: string,
): Promise<string> {
  const base = (config.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const body = {
    model: config.OPENAI_MODEL,
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
  log.debug("openai_ranking_request", { correlationId, url, model: config.OPENAI_MODEL });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.OPENAI_API_KEY!}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as ChatCompletionResponse;
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI empty content");
  return text;
}
