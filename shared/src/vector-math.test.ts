import { describe, expect, it } from "vitest";

import { DEFAULT_THRESHOLDS, DRIFT_MAGNITUDE_AWAY, DRIFT_MAGNITUDE_TOWARD } from "./constants.js";
import type { PoliticalVector, ThresholdConfig } from "./types.js";
import { clampVector, driftVector, euclideanDistance, evaluateThresholds } from "./vector-math.js";

const ORIGIN: PoliticalVector = { social: 0, economic: 0, populist: 0 };

describe("clampVector", () => {
  it("should return the same vector when all values are within [-1, 1]", () => {
    const v: PoliticalVector = { social: 0.5, economic: -0.3, populist: 0.9 };
    expect(clampVector(v)).toEqual(v);
  });

  it("should clamp values exceeding +1 down to 1", () => {
    const v: PoliticalVector = { social: 1.5, economic: 2.0, populist: 100 };
    expect(clampVector(v)).toEqual({ social: 1, economic: 1, populist: 1 });
  });

  it("should clamp values below -1 up to -1", () => {
    const v: PoliticalVector = { social: -1.5, economic: -99, populist: -2 };
    expect(clampVector(v)).toEqual({
      social: -1,
      economic: -1,
      populist: -1,
    });
  });

  it("should handle mixed in-range and out-of-range values", () => {
    const v: PoliticalVector = { social: -2, economic: 0.5, populist: 3 };
    expect(clampVector(v)).toEqual({ social: -1, economic: 0.5, populist: 1 });
  });

  it("should preserve exact boundary values -1 and 1", () => {
    const v: PoliticalVector = { social: -1, economic: 1, populist: -1 };
    expect(clampVector(v)).toEqual(v);
  });
});

describe("euclideanDistance", () => {
  it("should return 0 for identical vectors", () => {
    const v: PoliticalVector = { social: 0.3, economic: -0.7, populist: 0.1 };
    expect(euclideanDistance(v, v)).toBe(0);
  });

  it("should return 0 for two origin vectors", () => {
    expect(euclideanDistance(ORIGIN, ORIGIN)).toBe(0);
  });

  it("should return sqrt(12) for opposite corners [-1,-1,-1] to [1,1,1]", () => {
    const a: PoliticalVector = { social: -1, economic: -1, populist: -1 };
    const b: PoliticalVector = { social: 1, economic: 1, populist: 1 };
    expect(euclideanDistance(a, b)).toBeCloseTo(Math.sqrt(12), 10);
  });

  it("should return sqrt(3) for opposite corners of unit cube [0,0,0] to [1,1,1]", () => {
    const b: PoliticalVector = { social: 1, economic: 1, populist: 1 };
    expect(euclideanDistance(ORIGIN, b)).toBeCloseTo(Math.sqrt(3), 10);
  });

  it("should be symmetric: d(a,b) === d(b,a)", () => {
    const a: PoliticalVector = { social: 0.3, economic: -0.5, populist: 0.8 };
    const b: PoliticalVector = { social: -0.2, economic: 0.7, populist: -0.1 };
    expect(euclideanDistance(a, b)).toBe(euclideanDistance(b, a));
  });

  it("should always be non-negative", () => {
    const a: PoliticalVector = { social: -1, economic: -1, populist: -1 };
    const b: PoliticalVector = { social: 1, economic: 1, populist: 1 };
    expect(euclideanDistance(a, b)).toBeGreaterThanOrEqual(0);
  });

  it("should satisfy triangle inequality: d(a,c) <= d(a,b) + d(b,c)", () => {
    const a: PoliticalVector = { social: -0.8, economic: 0.3, populist: 0.5 };
    const b: PoliticalVector = { social: 0.1, economic: -0.4, populist: 0.2 };
    const c: PoliticalVector = { social: 0.7, economic: 0.9, populist: -0.6 };
    const dAC = euclideanDistance(a, c);
    const dAB = euclideanDistance(a, b);
    const dBC = euclideanDistance(b, c);
    expect(dAC).toBeLessThanOrEqual(dAB + dBC + 1e-10);
  });

  it("should compute correct distance for single-axis difference", () => {
    const a: PoliticalVector = { social: 0, economic: 0, populist: 0 };
    const b: PoliticalVector = { social: 0.5, economic: 0, populist: 0 };
    expect(euclideanDistance(a, b)).toBeCloseTo(0.5, 10);
  });

  it("should handle negative coordinates", () => {
    const a: PoliticalVector = { social: -0.5, economic: -0.5, populist: -0.5 };
    const b: PoliticalVector = { social: 0.5, economic: 0.5, populist: 0.5 };
    expect(euclideanDistance(a, b)).toBeCloseTo(Math.sqrt(3), 10);
  });
});

describe("evaluateThresholds", () => {
  const config: ThresholdConfig = DEFAULT_THRESHOLDS;

  it("should return 'critical' when distance < echoChamber (0.2)", () => {
    expect(evaluateThresholds(0, config)).toBe("critical");
    expect(evaluateThresholds(0.1, config)).toBe("critical");
    expect(evaluateThresholds(0.19, config)).toBe("critical");
  });

  it("should return 'medium' when echoChamber <= distance < mildBias", () => {
    expect(evaluateThresholds(0.2, config)).toBe("medium");
    expect(evaluateThresholds(0.3, config)).toBe("medium");
    expect(evaluateThresholds(0.39, config)).toBe("medium");
  });

  it("should return 'none' when distance >= diverseExposure (0.4)", () => {
    expect(evaluateThresholds(0.4, config)).toBe("none");
    expect(evaluateThresholds(0.5, config)).toBe("none");
    expect(evaluateThresholds(2.0, config)).toBe("none");
  });

  it("should classify exact boundary 0.2 as 'medium'", () => {
    expect(evaluateThresholds(0.2, config)).toBe("medium");
  });

  it("should classify exact boundary 0.4 as 'none'", () => {
    expect(evaluateThresholds(0.4, config)).toBe("none");
  });

  it("should respect custom thresholds", () => {
    const custom: ThresholdConfig = {
      echoChamber: 0.1,
      mildBias: 0.3,
      diverseExposure: 0.3,
    };
    expect(evaluateThresholds(0.05, custom)).toBe("critical");
    expect(evaluateThresholds(0.15, custom)).toBe("medium");
    expect(evaluateThresholds(0.3, custom)).toBe("none");
  });
});

describe("driftVector", () => {
  it("should move user vector away from tweet vector when direction is 'away'", () => {
    const user: PoliticalVector = { social: 0, economic: 0, populist: 0 };
    const tweet: PoliticalVector = { social: 0.5, economic: 0, populist: 0 };
    const result = driftVector(user, tweet, "away", DRIFT_MAGNITUDE_AWAY);

    expect(result.social).toBeLessThan(user.social);
    expect(result.economic).toBe(user.economic);
    expect(result.populist).toBe(user.populist);
  });

  it("should move user vector toward tweet vector when direction is 'toward'", () => {
    const user: PoliticalVector = { social: 0, economic: 0, populist: 0 };
    const tweet: PoliticalVector = { social: 0.5, economic: 0, populist: 0 };
    const result = driftVector(user, tweet, "toward", DRIFT_MAGNITUDE_TOWARD);

    expect(result.social).toBeGreaterThan(user.social);
    expect(result.economic).toBe(user.economic);
    expect(result.populist).toBe(user.populist);
  });

  it("should return user vector unchanged when vectors are identical (zero distance)", () => {
    const v: PoliticalVector = { social: 0.3, economic: -0.5, populist: 0.8 };
    const result = driftVector(v, v, "away", DRIFT_MAGNITUDE_AWAY);
    expect(result).toEqual(v);
  });

  it("should return user vector unchanged when magnitude is 0", () => {
    const user: PoliticalVector = { social: 0.3, economic: -0.5, populist: 0.8 };
    const tweet: PoliticalVector = { social: -0.2, economic: 0.7, populist: -0.1 };
    const result = driftVector(user, tweet, "away", 0);
    expect(result).toEqual(user);
  });

  it("should clamp result to [-1, 1] when drift would exceed bounds", () => {
    const user: PoliticalVector = { social: 0.99, economic: 0.99, populist: 0.99 };
    const tweet: PoliticalVector = { social: -1, economic: -1, populist: -1 };
    const result = driftVector(user, tweet, "away", 0.5);

    expect(result.social).toBeLessThanOrEqual(1);
    expect(result.economic).toBeLessThanOrEqual(1);
    expect(result.populist).toBeLessThanOrEqual(1);
    expect(result.social).toBeGreaterThanOrEqual(-1);
    expect(result.economic).toBeGreaterThanOrEqual(-1);
    expect(result.populist).toBeGreaterThanOrEqual(-1);
  });

  it("should always produce a result within [-1, 1] bounds", () => {
    const user: PoliticalVector = { social: -0.95, economic: 0.95, populist: -0.8 };
    const tweet: PoliticalVector = { social: 0.9, economic: -0.9, populist: 0.7 };

    const awayResult = driftVector(user, tweet, "away", 1.0);
    expect(awayResult.social).toBeGreaterThanOrEqual(-1);
    expect(awayResult.social).toBeLessThanOrEqual(1);
    expect(awayResult.economic).toBeGreaterThanOrEqual(-1);
    expect(awayResult.economic).toBeLessThanOrEqual(1);
    expect(awayResult.populist).toBeGreaterThanOrEqual(-1);
    expect(awayResult.populist).toBeLessThanOrEqual(1);

    const towardResult = driftVector(user, tweet, "toward", 1.0);
    expect(towardResult.social).toBeGreaterThanOrEqual(-1);
    expect(towardResult.social).toBeLessThanOrEqual(1);
    expect(towardResult.economic).toBeGreaterThanOrEqual(-1);
    expect(towardResult.economic).toBeLessThanOrEqual(1);
    expect(towardResult.populist).toBeGreaterThanOrEqual(-1);
    expect(towardResult.populist).toBeLessThanOrEqual(1);
  });

  it("should drift in correct direction along all axes for multi-axis difference", () => {
    const user: PoliticalVector = { social: 0, economic: 0, populist: 0 };
    const tweet: PoliticalVector = { social: 0.5, economic: 0.5, populist: 0.5 };

    const awayResult = driftVector(user, tweet, "away", 0.1);
    expect(awayResult.social).toBeLessThan(0);
    expect(awayResult.economic).toBeLessThan(0);
    expect(awayResult.populist).toBeLessThan(0);

    const towardResult = driftVector(user, tweet, "toward", 0.1);
    expect(towardResult.social).toBeGreaterThan(0);
    expect(towardResult.economic).toBeGreaterThan(0);
    expect(towardResult.populist).toBeGreaterThan(0);
  });

  it("should produce small changes with default PRD magnitudes", () => {
    const user: PoliticalVector = { social: 0.3, economic: -0.2, populist: 0.5 };
    const tweet: PoliticalVector = { social: 0.25, economic: -0.15, populist: 0.45 };

    const result = driftVector(user, tweet, "away", DRIFT_MAGNITUDE_AWAY);
    const drift = euclideanDistance(user, result);
    expect(drift).toBeCloseTo(DRIFT_MAGNITUDE_AWAY, 10);
  });
});
