export const keys = {
  demand: (id: string) => `demand:${id}`,
  run: (id: string) => `run:${id}`,
  runCandidates: (id: string) => `run:${id}:candidates`,
  latestRun: () => `meta:latestRun`,
};
