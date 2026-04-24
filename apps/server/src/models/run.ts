import { z } from "zod";
import type { PaymentAttempt } from "../payments.js";
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
  provider: "none" | "openai" | "bedrock" | "gmi";
  rankedVendorIds: string[];
  rationale: string;
  anomalies?: string[];
  citedHighlights: { vendorId: string; excerpt: string; sourceUrl: string }[];
};

export type NegotiationRoundEntry = {
  round: number;
  fromVendorId: string;
  toVendorId: string;
  message: string;
  simulation: true;
};

export type NegotiationArtifact = {
  rounds: NegotiationRoundEntry[];
  maxRounds: number;
  selectedVendorId: string;
  summary: string;
};

export type PaymentArtifact = {
  attempts: PaymentAttempt[];
  orderId: string;
  amount: number;
  currency: string;
};

export type FulfillmentPhase = "PREPARING" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED";

export type FulfillmentArtifact = {
  phase: FulfillmentPhase;
  delayCount: number;
  simulation: true;
  events: { at: string; note: string }[];
};

export type RunArtifacts = {
  candidates: NormalizedOffer[];
  ranking?: VendorRankingArtifact;
  negotiation?: NegotiationArtifact;
  payment?: PaymentArtifact;
  fulfillment?: FulfillmentArtifact;
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
