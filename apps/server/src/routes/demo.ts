import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { RedisClient } from "../redis/client.js";
import { advanceShipmentSimulation } from "../services/fulfillment.js";

const advanceBodySchema = z.object({
  runId: z.string().min(1),
  kind: z.enum(["progress", "delay"]),
});

export function createDemoRouter(config: Config, log: Logger, redis: RedisClient) {
  const r = Router();

  /** **SIMULATION** — advance mock carrier or record a delay (escalates if delays exceed config). */
  r.post("/advance-shipment", async (req: Request, res: Response) => {
    const parsed = advanceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }
    const { runId, kind } = parsed.data;
    const out = await advanceShipmentSimulation(config, log, redis, runId, kind);
    if (!out.ok) {
      res.status(out.status).json({ error: out.error });
      return;
    }
    res.json({ ok: true, run: out.run });
  });

  return r;
}
