import type { Phase1Analysis, PoliticalVector } from "@ragebaiter/shared";
import { logger } from "../lib/logger.js";

export type Phase1FetcherOptions = {
  getBackendUrl: () => string;
  getHeaders: () => Promise<Record<string, string>>;
  timeoutMs?: number;
};

type Phase1ApiResponse = {
  tweet_id: string;
  analysis: {
    tweet_vector: { social: number; economic: number; populist: number };
    fallacies: string[];
    topic: string;
    confidence: number;
  } | null;
  source: string;
  latency_ms: number;
};

export const createPhase1Fetcher = (
  options: Phase1FetcherOptions
): ((tweetId: string, tweetText: string) => Promise<Phase1Analysis | null>) => {
  const timeoutMs = options.timeoutMs ?? 15000;

  return async (tweetId: string, tweetText: string): Promise<Phase1Analysis | null> => {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const backendUrl = options.getBackendUrl();
      const headers = await options.getHeaders();
      const response = await fetch(`${backendUrl}/api/analyze/phase1`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ tweetId, tweetText }),
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn(`Phase 1 backend ${response.status} for ${tweetId}`);
        return null;
      }

      const data = (await response.json()) as Phase1ApiResponse;
      if (!data.analysis) {
        return null;
      }

      const tweetVector: PoliticalVector = {
        social: data.analysis.tweet_vector.social,
        economic: data.analysis.tweet_vector.economic,
        populist: data.analysis.tweet_vector.populist,
      };

      return {
        tweetVector,
        fallacies: data.analysis.fallacies,
        topic: data.analysis.topic,
        confidence: data.analysis.confidence,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Phase 1 fetch failed for ${tweetId}:`, message);
      return null;
    } finally {
      globalThis.clearTimeout(timer);
    }
  };
};
