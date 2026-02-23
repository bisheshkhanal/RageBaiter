import { VECTOR_MAX, VECTOR_MIN } from "./constants.js";
function clampValue(value) {
    return Math.max(VECTOR_MIN, Math.min(VECTOR_MAX, value));
}
export function clampVector(v) {
    return {
        social: clampValue(v.social),
        economic: clampValue(v.economic),
        populist: clampValue(v.populist),
    };
}
export function euclideanDistance(a, b) {
    const ds = a.social - b.social;
    const de = a.economic - b.economic;
    const dp = a.populist - b.populist;
    return Math.sqrt(ds * ds + de * de + dp * dp);
}
export function evaluateThresholds(distance, config) {
    if (distance < config.echoChamber)
        return "critical";
    if (distance < config.mildBias)
        return "medium";
    if (distance >= config.diverseExposure)
        return "none";
    return "low";
}
/**
 * Drift user vector toward or away from tweet vector.
 * Uses unit-direction scaling from PRD Appendix A.
 * Safe for zero-distance (identical vectors): returns user vector unchanged.
 */
export function driftVector(userVector, tweetVector, direction, magnitude) {
    const dist = euclideanDistance(userVector, tweetVector);
    if (dist === 0 || magnitude === 0) {
        return userVector;
    }
    const sign = direction === "away" ? 1 : -1;
    const scale = (sign * magnitude) / dist;
    return clampVector({
        social: userVector.social + scale * (userVector.social - tweetVector.social),
        economic: userVector.economic + scale * (userVector.economic - tweetVector.economic),
        populist: userVector.populist + scale * (userVector.populist - tweetVector.populist),
    });
}
//# sourceMappingURL=vector-math.js.map