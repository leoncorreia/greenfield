import { z } from "zod";

/**
 * Structured ranking output — validated after every LLM response.
 */
export const vendorRankingOutputSchema = z.object({
  rankedVendorIds: z.array(z.string()).min(1),
  rationale: z.string().min(1).max(16_000),
  highlights: z
    .array(
      z.object({
        vendorId: z.string(),
        excerpt: z.string().max(2000),
      }),
    )
    .optional(),
  anomalies: z.array(z.string()).optional(),
});

export type VendorRankingOutput = z.infer<typeof vendorRankingOutputSchema>;

export function parseVendorRankingOutput(raw: unknown): VendorRankingOutput {
  return vendorRankingOutputSchema.parse(raw);
}
