import type { ThresholdConfig } from "./types.js";

export const VECTOR_MIN = -1;
export const VECTOR_MAX = 1;

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  echoChamber: 0.2,
  mildBias: 0.4,
  diverseExposure: 0.4,
} as const;

export const DRIFT_MAGNITUDE_AWAY = 0.02;
export const DRIFT_MAGNITUDE_TOWARD = 0.01;
