type PoliticalVector = {
  social: number;
  economic: number;
  populist: number;
};

type InterventionLevel = "none" | "low" | "medium" | "critical";

export type TweetAnalysis = {
  tweetId: string;
  topic: string;
  confidence: number;
  tweetVector: PoliticalVector;
  fallacies: string[];
};

export type DecisionThresholds = {
  echoChamberMaxDistance: number;
  mildBiasMaxDistance: number;
};

export type DecisionConfigOverrides = {
  thresholds?: Partial<DecisionThresholds>;
  cooldownMs?: number;
  fallacyWeights?: Record<string, number>;
};

export type UserProfile = {
  userVector: PoliticalVector;
  decisionConfig?: DecisionConfigOverrides;
};

export type DecisionLog = {
  tree: string;
  fields: {
    topic: string;
    biasScore: number;
    userBias: number;
    distance: number;
    fallacyCount: number;
    weightedFallacyScore: number;
    weightedFallacyCount: number;
    decision: InterventionLevel;
    action: string;
    cooldownActive: boolean;
  };
};

export type InterventionDecision = {
  level: InterventionLevel;
  shouldIntervene: boolean;
  distance: number;
  fallacyCount: number;
  weightedFallacyScore: number;
  weightedFallacyCount: number;
  severityBand: "none" | "low" | "medium" | "high";
  cooldown: {
    active: boolean;
    remainingMs: number;
    lastInterventionAt: number | null;
    wouldHaveTriggeredLevel: InterventionLevel | null;
  };
  action: string;
  log: DecisionLog;
};

type DecisionEngine = {
  evaluateTweet: (tweetAnalysis: TweetAnalysis, userProfile: UserProfile) => InterventionDecision;
  resetCooldown: () => void;
};

type DecisionEngineOptions = {
  now?: () => number;
  initialLastInterventionAt?: number | null;
};

const DEFAULT_THRESHOLDS: DecisionThresholds = {
  echoChamberMaxDistance: 0.2,
  mildBiasMaxDistance: 0.4,
};

const DEFAULT_COOLDOWN_MS = 30_000;

const DEFAULT_FALLACY_WEIGHT = 0.5;

const PRD_FALLACY_WEIGHTS: Record<string, number> = {
  "Ad Hominem": 0.8,
  Strawman: 0.9,
  "False Dilemma": 0.7,
  "Appeal to Authority": 0.5,
  "Hasty Generalization": 0.6,
  "Slippery Slope": 0.6,
  "Red Herring": 0.5,
  "Appeal to Emotion": 0.7,
  Bandwagon: 0.4,
  Whataboutism: 0.8,
  "Tu Quoque": 0.7,
  "Loaded Question": 0.6,
};

const clampToUnit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-1, Math.min(1, value));
};

const toSafeVector = (vector: PoliticalVector): PoliticalVector => {
  return {
    social: clampToUnit(vector.social),
    economic: clampToUnit(vector.economic),
    populist: clampToUnit(vector.populist),
  };
};

const euclideanDistance = (a: PoliticalVector, b: PoliticalVector): number => {
  const ds = a.social - b.social;
  const de = a.economic - b.economic;
  const dp = a.populist - b.populist;
  return Math.sqrt(ds * ds + de * de + dp * dp);
};

const averageAbsoluteBias = (vector: PoliticalVector): number => {
  const sum = Math.abs(vector.social) + Math.abs(vector.economic) + Math.abs(vector.populist);
  return Number((sum / 3).toFixed(3));
};

const toRounded = (value: number): number => Number(value.toFixed(3));

const normalizeFallacyName = (name: string): string => name.trim().replace(/\s+/g, " ");

const getFallacyWeight = (fallacyName: string, weights: Record<string, number>): number => {
  const normalized = normalizeFallacyName(fallacyName);
  return weights[normalized] ?? DEFAULT_FALLACY_WEIGHT;
};

const toWeightedCountContribution = (weight: number): number => {
  return 0.5 + weight / 2;
};

const resolveThresholds = (overrides?: Partial<DecisionThresholds>): DecisionThresholds => {
  return {
    echoChamberMaxDistance:
      overrides?.echoChamberMaxDistance ?? DEFAULT_THRESHOLDS.echoChamberMaxDistance,
    mildBiasMaxDistance: overrides?.mildBiasMaxDistance ?? DEFAULT_THRESHOLDS.mildBiasMaxDistance,
  };
};

const resolveFallacyWeights = (overrides?: Record<string, number>): Record<string, number> => {
  if (!overrides) {
    return PRD_FALLACY_WEIGHTS;
  }

  return {
    ...PRD_FALLACY_WEIGHTS,
    ...overrides,
  };
};

const resolveLevelByThreshold = (
  distance: number,
  fallacyCount: number,
  thresholds: DecisionThresholds
): InterventionLevel => {
  if (distance < thresholds.echoChamberMaxDistance && fallacyCount > 0) {
    return "critical";
  }

  if (distance < thresholds.echoChamberMaxDistance && fallacyCount === 0) {
    return "low";
  }

  if (
    distance >= thresholds.echoChamberMaxDistance &&
    distance <= thresholds.mildBiasMaxDistance &&
    fallacyCount > 1
  ) {
    return "medium";
  }

  if (distance > thresholds.mildBiasMaxDistance) {
    return "none";
  }

  return "none";
};

const resolveSeverityBand = (weightedFallacyScore: number): "none" | "low" | "medium" | "high" => {
  if (weightedFallacyScore <= 0) {
    return "none";
  }

  if (weightedFallacyScore < 0.9) {
    return "low";
  }

  if (weightedFallacyScore < 1.6) {
    return "medium";
  }

  return "high";
};

const buildDecisionLog = (input: {
  topic: string;
  biasScore: number;
  userBias: number;
  distance: number;
  fallacyCount: number;
  weightedFallacyScore: number;
  weightedFallacyCount: number;
  level: InterventionLevel;
  action: string;
  cooldownActive: boolean;
}): DecisionLog => {
  const tree =
    `Tweet Detected -> Topic: ${input.topic} -> Bias Score: ${input.biasScore.toFixed(3)} -> ` +
    `User Bias: ${input.userBias.toFixed(3)} -> Distance: ${input.distance.toFixed(3)} -> ${input.action}`;

  return {
    tree,
    fields: {
      topic: input.topic,
      biasScore: input.biasScore,
      userBias: input.userBias,
      distance: input.distance,
      fallacyCount: input.fallacyCount,
      weightedFallacyScore: input.weightedFallacyScore,
      weightedFallacyCount: input.weightedFallacyCount,
      decision: input.level,
      action: input.action,
      cooldownActive: input.cooldownActive,
    },
  };
};

export const createDecisionEngine = (options: DecisionEngineOptions = {}): DecisionEngine => {
  const now = options.now ?? (() => Date.now());
  let lastInterventionAt = options.initialLastInterventionAt ?? null;

  const evaluateTweet = (
    tweetAnalysis: TweetAnalysis,
    userProfile: UserProfile
  ): InterventionDecision => {
    const thresholds = resolveThresholds(userProfile.decisionConfig?.thresholds);
    const cooldownMs = userProfile.decisionConfig?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    const fallacyWeights = resolveFallacyWeights(userProfile.decisionConfig?.fallacyWeights);

    const tweetVector = toSafeVector(tweetAnalysis.tweetVector);
    const userVector = toSafeVector(userProfile.userVector);
    const distance = toRounded(euclideanDistance(tweetVector, userVector));

    const weightedFallacyScore = toRounded(
      tweetAnalysis.fallacies.reduce((sum, fallacy) => {
        return sum + getFallacyWeight(fallacy, fallacyWeights);
      }, 0)
    );

    const weightedFallacyCount = toRounded(
      tweetAnalysis.fallacies.reduce((sum, fallacy) => {
        const weight = getFallacyWeight(fallacy, fallacyWeights);
        return sum + toWeightedCountContribution(weight);
      }, 0)
    );

    const fallacyCount = tweetAnalysis.fallacies.length;
    const baseLevel = resolveLevelByThreshold(distance, fallacyCount, thresholds);
    const currentNow = now();

    const elapsedSinceLast =
      lastInterventionAt === null || !Number.isFinite(lastInterventionAt)
        ? Number.POSITIVE_INFINITY
        : currentNow - lastInterventionAt;

    const cooldownActive = baseLevel !== "none" && elapsedSinceLast < cooldownMs;
    const remainingMs = cooldownActive ? Math.max(0, cooldownMs - elapsedSinceLast) : 0;
    const finalLevel: InterventionLevel = cooldownActive ? "none" : baseLevel;

    if (!cooldownActive && baseLevel !== "none") {
      lastInterventionAt = currentNow;
    }

    const biasScore = averageAbsoluteBias(tweetVector);
    const userBias = averageAbsoluteBias(userVector);
    const action = cooldownActive
      ? `SKIP_COOLDOWN(${baseLevel.toUpperCase()})`
      : finalLevel === "none"
        ? "NO_INTERVENTION"
        : `${finalLevel.toUpperCase()}_INTERVENTION`;

    return {
      level: finalLevel,
      shouldIntervene: finalLevel !== "none",
      distance,
      fallacyCount,
      weightedFallacyScore,
      weightedFallacyCount,
      severityBand: resolveSeverityBand(weightedFallacyScore),
      cooldown: {
        active: cooldownActive,
        remainingMs,
        lastInterventionAt,
        wouldHaveTriggeredLevel: cooldownActive ? baseLevel : null,
      },
      action,
      log: buildDecisionLog({
        topic: tweetAnalysis.topic,
        biasScore,
        userBias,
        distance,
        fallacyCount,
        weightedFallacyScore,
        weightedFallacyCount,
        level: finalLevel,
        action,
        cooldownActive,
      }),
    };
  };

  const resetCooldown = (): void => {
    lastInterventionAt = null;
  };

  return {
    evaluateTweet,
    resetCooldown,
  };
};

const defaultEngine = createDecisionEngine();

export const evaluateTweet = defaultEngine.evaluateTweet;
