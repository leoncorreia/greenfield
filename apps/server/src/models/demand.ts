import { z } from "zod";

export const demandSchema = z.object({
  sku: z.string().min(1),
  units: z.number().int().positive(),
  maxPricePerUnit: z.number().positive(),
  deliveryBy: z.string().min(1),
});

export type DemandPayload = z.infer<typeof demandSchema>;

export type DemandRecord = DemandPayload & {
  id: string;
  createdAt: string;
};
