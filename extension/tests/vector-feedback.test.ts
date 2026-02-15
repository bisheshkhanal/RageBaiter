import { describe, expect, it } from "vitest";

import { applyFeedbackDrift } from "../src/lib/vector-feedback.js";

describe("vector feedback drift", () => {
  it("moves vector toward tweet vector for agreed feedback", () => {
    const result = applyFeedbackDrift(
      { social: 0, economic: 0.2, populist: -0.4 },
      { social: 0.8, economic: -0.5, populist: -0.6 },
      "agreed"
    );

    expect(result.after.social).toBeGreaterThan(result.before.social);
    expect(result.after.economic).toBeLessThan(result.before.economic);
    expect(result.after.populist).toBeLessThan(result.before.populist);
  });

  it("moves vector away from tweet vector for dismissed feedback", () => {
    const result = applyFeedbackDrift(
      { social: 0.3, economic: -0.2, populist: 0.1 },
      { social: 0.9, economic: -0.5, populist: 0.5 },
      "dismissed"
    );

    expect(result.after.social).toBeLessThan(result.before.social);
    expect(result.after.economic).toBeGreaterThan(result.before.economic);
    expect(result.after.populist).toBeLessThan(result.before.populist);
  });

  it("respects caps and does not overshoot toward target", () => {
    const result = applyFeedbackDrift(
      { social: 0.98, economic: -0.98, populist: 0.02 },
      { social: 1, economic: -1, populist: 0 },
      "agreed"
    );

    expect(result.after.social).toBe(1);
    expect(result.after.economic).toBe(-1);
    expect(result.after.populist).toBe(0);
  });

  it("caps away drift at vector boundaries", () => {
    const result = applyFeedbackDrift(
      { social: 1, economic: -1, populist: 1 },
      { social: 1, economic: -1, populist: 1 },
      "dismissed"
    );

    expect(result.after.social).toBe(1);
    expect(result.after.economic).toBe(-1);
    expect(result.after.populist).toBe(1);
  });
});
