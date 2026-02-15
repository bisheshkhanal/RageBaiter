import type { TweetAnalysis } from "./tweet-analysis-cache.js";

const FALLACY_CATALOG = ["Strawman", "Ad Hominem", "False Dilemma", "Appeal to Authority"] as const;

const normalizeToAxis = (value: number): number => {
  const normalized = ((value % 2001) - 1000) / 1000;
  return Math.max(-1, Math.min(1, Number(normalized.toFixed(3))));
};

const hash = (input: string): number => {
  let acc = 0;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    acc = (acc * 31 + code) % 2_147_483_647;
  }

  return acc;
};

export const deterministicAnalyzeTweet = async (
  tweetId: string,
  tweetText: string
): Promise<Omit<TweetAnalysis, "analyzedAt" | "expiresAt">> => {
  const combined = `${tweetId}:${tweetText}`;
  const hashValue = hash(combined);
  const social = normalizeToAxis(hashValue);
  const economic = normalizeToAxis(hashValue * 7);
  const populist = normalizeToAxis(hashValue * 13);
  const confidence = 0.5 + (hashValue % 50) / 100;

  const selectedFallacy = FALLACY_CATALOG[hashValue % FALLACY_CATALOG.length] ?? "Strawman";
  const fallacies = [selectedFallacy];

  return {
    tweetText,
    tweetVector: {
      social,
      economic,
      populist,
    },
    fallacies,
    topic: `deterministic-topic-${hashValue % 10}`,
    confidence: Number(confidence.toFixed(2)),
  };
};
