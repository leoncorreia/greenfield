export const keys = {
  demand: (id: string) => `demand:${id}`,
  run: (id: string) => `run:${id}`,
  runCandidates: (id: string) => `run:${id}:candidates`,
  /** Redis list of JSON negotiation round entries (SIMULATION). */
  runNegotiationLog: (id: string) => `run:${id}:negotiation`,
  latestRun: () => `meta:latestRun`,
};
