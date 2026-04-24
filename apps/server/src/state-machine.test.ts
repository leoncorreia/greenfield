import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./state-machine.js";

describe("state machine", () => {
  it("allows DEMAND_RECEIVED -> SOURCING", () => {
    expect(canTransition("DEMAND_RECEIVED", "SOURCING")).toBe(true);
    expect(() => assertTransition("DEMAND_RECEIVED", "SOURCING")).not.toThrow();
  });

  it("allows SOURCING -> SHORTLISTED", () => {
    expect(canTransition("SOURCING", "SHORTLISTED")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("DEMAND_RECEIVED", "SHORTLISTED")).toBe(false);
    expect(() => assertTransition("DEMAND_RECEIVED", "SHORTLISTED")).toThrow();
  });

  it("allows terminal COMPLETED to have no outgoing", () => {
    expect(canTransition("COMPLETED", "ESCALATED")).toBe(false);
  });
});
