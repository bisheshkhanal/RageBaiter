export const sharedWorkspaceReady = true;

export type {
  DriftDirection,
  InterventionLevel,
  PoliticalVector,
  ThresholdConfig,
} from "./types.js";

export {
  DEFAULT_THRESHOLDS,
  DRIFT_MAGNITUDE_AWAY,
  DRIFT_MAGNITUDE_TOWARD,
  VECTOR_MAX,
  VECTOR_MIN,
} from "./constants.js";

export { clampVector, driftVector, euclideanDistance, evaluateThresholds } from "./vector-math.js";

export {
  POLITICAL_KEYWORDS,
  isPolitical,
  type PoliticalDetectionResult,
  type PoliticalSensitivity,
} from "./political-keyword-filter.js";
