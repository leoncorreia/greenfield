import { Router } from "express";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { RedisClient } from "../redis/client.js";
import { attemptPaymentRails } from "../payments.js";

export function createPaymentsRouter(config: Config, log: Logger, redis: RedisClient) {
  const r = Router();

  r.post("/simulate", async (req, res) => {
    if (config.NODE_ENV !== "development") {
      res.status(403).json({ error: "forbidden_outside_development" });
      return;
    }
    const orderId = String(req.body?.orderId ?? "");
    const correlationId = String(req.body?.correlationId ?? "dev-sim");
    if (!orderId) {
      res.status(400).json({ error: "orderId_required" });
      return;
    }
    const amount = Number(req.body?.amount ?? 1);
    const currency = String(req.body?.currency ?? "USD");
    const attempts = await attemptPaymentRails(config, log, redis, {
      orderId,
      correlationId,
      amount,
      currency,
    });
    res.json({ attempts });
  });

  return r;
}
