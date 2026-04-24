/**
 * Exact lifecycle for vendor ops runs.
 */
export const RunStates = [
  "DEMAND_RECEIVED",
  "SOURCING",
  "SHORTLISTED",
  "NEGOTIATING",
  "SELECTED",
  "PAYMENT_SUBMITTED",
  "FULFILLMENT_TRACKING",
  "COMPLETED",
  "ESCALATED",
] as const;

export type RunState = (typeof RunStates)[number];

const transitions: Record<RunState, RunState[]> = {
  DEMAND_RECEIVED: ["SOURCING"],
  SOURCING: ["SHORTLISTED", "ESCALATED"],
  SHORTLISTED: ["NEGOTIATING", "ESCALATED"],
  NEGOTIATING: ["SELECTED", "ESCALATED"],
  SELECTED: ["PAYMENT_SUBMITTED", "ESCALATED"],
  PAYMENT_SUBMITTED: ["FULFILLMENT_TRACKING", "ESCALATED"],
  FULFILLMENT_TRACKING: ["COMPLETED", "ESCALATED"],
  COMPLETED: [],
  ESCALATED: [],
};

export function assertTransition(from: RunState, to: RunState): void {
  const allowed = transitions[from];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid state transition: ${from} -> ${to}`);
  }
}

export function canTransition(from: RunState, to: RunState): boolean {
  return transitions[from].includes(to);
}
