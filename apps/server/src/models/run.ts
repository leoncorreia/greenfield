import { z } from "zod";
import type { RunState } from "../state-machine.js";

export const normalizedOfferSchema = z.object({
  vendorId: z.string(),
  vendorName: z.string(),
  sku: z.string(),
  pricePerUnit: z.number(),
  moq: z.number().int().nonnegative(),
  leadTimeDays: z.number().int().nonnegative(),
  sourceUrl: z.string().url(),
  simulation: z.boolean().optional(),
});

export type NormalizedOffer = z.infer<typeof normalizedOfferSchema>;

export type VendorRankingArtifact = {
  provider: "none" | "openai" | "bedrock";
  rankedVendorIds: string[];
  rationale: string;
  anomalies?: string[];
  citedHighlights: { vendorId: string; excerpt: string; sourceUrl: string }[];
};

export type RunArtifacts = {
  candidates: NormalizedOffer[];
  ranking?: VendorRankingArtifact;
  lastSourcingNote?: string;
};

export type RunRecord = {
  id: string;
  correlationId: string;
  demandId: string;
  state: RunState;
  createdAt: string;
  updatedAt: string;
  artifacts: RunArtifacts;
};
