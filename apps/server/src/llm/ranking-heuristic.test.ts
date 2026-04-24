import { describe, expect, it } from "vitest";
import { rankOffersHeuristic } from "./ranking.js";
import type { DemandRecord } from "../models/demand.js";
import type { NormalizedOffer } from "../models/run.js";

const demand: DemandRecord = {
  id: "d1",
  sku: "X",
  units: 100,
  maxPricePerUnit: 15,
  deliveryBy: "2026-06-01",
  createdAt: "t",
};

const offers: NormalizedOffer[] = [
  {
    vendorId: "a",
    vendorName: "Cheap slow",
    sku: "X",
    pricePerUnit: 9,
    moq: 10,
    leadTimeDays: 30,
    sourceUrl: "http://example.com/a",
    simulation: true,
  },
  {
    vendorId: "b",
    vendorName: "Pricey fast",
    sku: "X",
    pricePerUnit: 14,
    moq: 50,
    leadTimeDays: 5,
    sourceUrl: "http://example.com/b",
    simulation: true,
  },
];

describe("rankOffersHeuristic", () => {
  it("orders by effective score", () => {
    const r = rankOffersHeuristic(demand, offers);
    expect(r.rankedVendorIds[0]).toBe("a");
  });
});
