import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("integration (env gated)", () => {
  it("skipped unless RUN_INTEGRATION_TESTS=true", async () => {
    const config = loadConfig();
    if (!config.RUN_INTEGRATION_TESTS) {
      expect(true).toBe(true);
      return;
    }
    const res = await fetch(`http://127.0.0.1:${config.PORT}/health`);
    expect(res.ok).toBe(true);
  });
});
