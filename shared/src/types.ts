/** Position in 3D political space. Each axis: [-1, +1]. */
export interface PoliticalVector {
  readonly social: number;
  readonly economic: number;
  readonly populist: number;
}

/** Distance thresholds for echo-chamber classification (PRD Appendix A). */
export interface ThresholdConfig {
  readonly echoChamber: number;
  readonly mildBias: number;
  readonly diverseExposure: number;
}

export type InterventionLevel = "none" | "low" | "medium" | "critical";

export type DriftDirection = "toward" | "away";
