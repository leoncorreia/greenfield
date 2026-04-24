import { describe, expect, it } from "vitest";
import { parseVendorRankingOutput, vendorRankingOutputSchema } from "./ranking-schema.js";

describe("vendorRankingOutputSchema", () => {
  it("parses valid LLM-shaped JSON", () => {
    const raw = {
      rankedVendorIds: ["b", "a"],
      rationale: "B wins on lead time.",
      highlights: [{ vendorId: "b", excerpt: "$11 MOQ 100" }],
      anomalies: ["a: price above cap"],
    };
    const parsed = parseVendorRankingOutput(raw);
    expect(parsed.rankedVendorIds).toEqual(["b", "a"]);
    expect(parsed.anomalies?.[0]).toContain("price");
  });

  it("rejects empty rankedVendorIds", () => {
    expect(() =>
      vendorRankingOutputSchema.parse({
        rankedVendorIds: [],
        rationale: "x",
      }),
    ).toThrow();
  });
});
