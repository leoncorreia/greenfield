import { Router, type Request, type Response } from "express";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import { readLatestCited } from "../services/cited.js";

export function createReportsRouter(config: Config, log: Logger) {
  const r = Router();

  r.get("/latest", async (_req: Request, res: Response) => {
    try {
      const cited = await readLatestCited(config);
      res.json({
        path: cited.path,
        updatedHint: cited.updatedHint,
        markdown: cited.text,
      });
    } catch (e) {
      log.error("reports_latest_failed", { err: String(e) });
      res.status(500).json({ error: "read_failed" });
    }
  });

  return r;
}
