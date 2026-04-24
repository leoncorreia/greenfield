import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";

export async function callBedrockRanking(
  config: Config,
  log: Logger,
  correlationId: string,
  userPrompt: string,
): Promise<string> {
  const region = config.AWS_REGION!;
  const modelId = config.AWS_BEDROCK_MODEL_ID!;
  const client = new BedrockRuntimeClient({ region });
  log.debug("bedrock_ranking_request", { correlationId, region, modelId });
  const cmd = new ConverseCommand({
    modelId,
    messages: [
      {
        role: "user",
        content: [
          {
            text:
              "Return ONLY valid JSON (no markdown fences) for supplier ranking as described:\n\n" + userPrompt,
          },
        ],
      },
    ],
    inferenceConfig: {
      maxTokens: 4096,
      temperature: 0.2,
    },
  });
  const out = await client.send(cmd);
  const blocks = out.output?.message?.content;
  const text = blocks?.map((b) => ("text" in b ? b.text : "")).join("") ?? "";
  if (!text.trim()) throw new Error("Bedrock empty content");
  return text;
}
