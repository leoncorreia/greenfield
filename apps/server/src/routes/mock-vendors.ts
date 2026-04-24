import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";

/**
 * In-repo mock vendor JSON (SIMULATION). Not real marketplaces.
 */
export function mockVendorRouter(): Router {
  const r = createRouter();

  r.get("/vendor-a", (req: Request, res: Response) => {
    const sku = String(req.query.sku ?? "UNKNOWN");
    const units = Number(req.query.units ?? 1);
    res.json({
      vendorId: "vendor-a",
      vendorName: "Acme Mock Supply",
      sku,
      pricePerUnit: 9.25 + (units > 500 ? 0.5 : 0),
      moq: 50,
      leadTimeDays: 10,
      simulation: true,
      note: `Quote adjusted for requested units ${units}`,
    });
  });

  r.get("/vendor-b", (req: Request, res: Response) => {
    const sku = String(req.query.sku ?? "UNKNOWN");
    res.json({
      vendorId: "vendor-b",
      vendorName: "Beta Mock Components",
      sku,
      pricePerUnit: 11.0,
      moq: 100,
      leadTimeDays: 21,
      simulation: true,
    });
  });

  return r;
}
