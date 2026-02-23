import type { DriftDirection, InterventionLevel, PoliticalVector, ThresholdConfig } from "./types.js";
export declare function clampVector(v: PoliticalVector): PoliticalVector;
export declare function euclideanDistance(a: PoliticalVector, b: PoliticalVector): number;
export declare function evaluateThresholds(distance: number, config: ThresholdConfig): InterventionLevel;
/**
 * Drift user vector toward or away from tweet vector.
 * Uses unit-direction scaling from PRD Appendix A.
 * Safe for zero-distance (identical vectors): returns user vector unchanged.
 */
export declare function driftVector(userVector: PoliticalVector, tweetVector: PoliticalVector, direction: DriftDirection, magnitude: number): PoliticalVector;
//# sourceMappingURL=vector-math.d.ts.map