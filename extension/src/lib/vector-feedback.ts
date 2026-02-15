import type { PoliticalVectorPayload } from "../messaging/protocol.js";

export type FeedbackType = "acknowledged" | "agreed" | "dismissed";

export type DriftResult = {
  before: PoliticalVectorPayload;
  after: PoliticalVectorPayload;
  appliedDelta: PoliticalVectorPayload;
};

const VECTOR_CAP_MIN = -1;
const VECTOR_CAP_MAX = 1;
const BASE_DRIFT_STEP = 0.04;
const DISTANCE_DRIFT_SCALE = 0.18;
const PER_EVENT_DRIFT_CAP = 0.2;

const clampToCap = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value > VECTOR_CAP_MAX) {
    return VECTOR_CAP_MAX;
  }

  if (value < VECTOR_CAP_MIN) {
    return VECTOR_CAP_MIN;
  }

  return value;
};

const nextStep = (distance: number): number => {
  const resolvedDistance = Math.max(0, Math.abs(distance));
  return Math.min(PER_EVENT_DRIFT_CAP, BASE_DRIFT_STEP + resolvedDistance * DISTANCE_DRIFT_SCALE);
};

const driftToward = (current: number, target: number): number => {
  const clampedCurrent = clampToCap(current);
  const clampedTarget = clampToCap(target);
  const delta = clampedTarget - clampedCurrent;

  if (delta === 0) {
    return clampedCurrent;
  }

  const step = nextStep(delta);

  if (delta > 0) {
    return clampToCap(Math.min(clampedCurrent + step, clampedTarget));
  }

  return clampToCap(Math.max(clampedCurrent - step, clampedTarget));
};

const driftAway = (current: number, target: number): number => {
  const clampedCurrent = clampToCap(current);
  const clampedTarget = clampToCap(target);
  const relativeDirection = clampedCurrent - clampedTarget;
  const direction =
    relativeDirection === 0
      ? clampedTarget === 0
        ? 1
        : -Math.sign(clampedTarget)
      : Math.sign(relativeDirection);
  const step = nextStep(relativeDirection);

  return clampToCap(clampedCurrent + direction * step);
};

const toSafeVector = (vector: PoliticalVectorPayload): PoliticalVectorPayload => ({
  social: clampToCap(vector.social),
  economic: clampToCap(vector.economic),
  populist: clampToCap(vector.populist),
});

export const applyFeedbackDrift = (
  currentVector: PoliticalVectorPayload,
  tweetVector: PoliticalVectorPayload,
  feedbackType: FeedbackType
): DriftResult => {
  const before = toSafeVector(currentVector);
  const target = toSafeVector(tweetVector);

  if (feedbackType === "acknowledged") {
    return {
      before,
      after: before,
      appliedDelta: {
        social: 0,
        economic: 0,
        populist: 0,
      },
    };
  }

  const drift = feedbackType === "agreed" ? driftToward : driftAway;

  const after = toSafeVector({
    social: drift(before.social, target.social),
    economic: drift(before.economic, target.economic),
    populist: drift(before.populist, target.populist),
  });

  return {
    before,
    after,
    appliedDelta: {
      social: Number((after.social - before.social).toFixed(6)),
      economic: Number((after.economic - before.economic).toFixed(6)),
      populist: Number((after.populist - before.populist).toFixed(6)),
    },
  };
};
