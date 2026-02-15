import { Hono } from "hono";

import { geminiAnalyzeTweet } from "../services/gemini-analyzer.js";
import {
  NoopCacheRepository,
  SupabaseCacheRepository,
} from "../services/supabase-cache-repository.js";
import {
  TweetAnalysisCacheService,
  type AnalyzeCacheRepository,
  type AnalyzeResult,
} from "../services/tweet-analysis-cache.js";

type AnalyzeRequestBody = {
  tweetId?: unknown;
  tweetText?: unknown;
};

type AnalyzeRoutesOptions = {
  cacheService?: TweetAnalysisCacheService;
};

const readTtlMs = (): number | undefined => {
  const rawValue = process.env.ANALYZE_CACHE_TTL_MS;
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.floor(parsed);
};

const createRepository = (): AnalyzeCacheRepository => {
  return SupabaseCacheRepository.fromEnv() ?? new NoopCacheRepository();
};

const buildDefaultService = (): TweetAnalysisCacheService => {
  const ttlMs = readTtlMs();

  return new TweetAnalysisCacheService(createRepository(), geminiAnalyzeTweet, {
    maxEntries: 100,
    ...(ttlMs !== undefined ? { ttlMs } : {}),
  });
};

const parseBody = (body: AnalyzeRequestBody): { tweetId: string; tweetText: string } | null => {
  if (typeof body.tweetId !== "string" || body.tweetId.length === 0) {
    return null;
  }

  if (typeof body.tweetText !== "string" || body.tweetText.length === 0) {
    return null;
  }

  return {
    tweetId: body.tweetId,
    tweetText: body.tweetText,
  };
};

const toResponse = (result: AnalyzeResult, latencyMs: number) => {
  return {
    tweet_id: result.analyzedTweet.tweetId,
    analysis: {
      tweet_text: result.analyzedTweet.analysis.tweetText,
      tweet_vector: result.analyzedTweet.analysis.tweetVector,
      fallacies: result.analyzedTweet.analysis.fallacies,
      topic: result.analyzedTweet.analysis.topic,
      confidence: result.analyzedTweet.analysis.confidence,
      counter_argument: result.analyzedTweet.analysis.counterArgument ?? "",
      logic_failure: result.analyzedTweet.analysis.logicFailure ?? "",
      claim: result.analyzedTweet.analysis.claim ?? "",
      mechanism: result.analyzedTweet.analysis.mechanism ?? "",
      data_check: result.analyzedTweet.analysis.dataCheck ?? "",
      socratic_challenge: result.analyzedTweet.analysis.socraticChallenge ?? "",
      analyzed_at: new Date(result.analyzedTweet.analysis.analyzedAt).toISOString(),
      expires_at: new Date(result.analyzedTweet.analysis.expiresAt).toISOString(),
    },
    source: result.source,
    latency_ms: latencyMs,
  };
};

export const createAnalyzeRoutes = (options: AnalyzeRoutesOptions = {}): Hono => {
  const analyzeRoutes = new Hono();
  const cacheService = options.cacheService ?? buildDefaultService();

  analyzeRoutes.post("/", async (c) => {
    const startedAt = Date.now();
    const body = (await c.req.json().catch(() => null)) as AnalyzeRequestBody | null;
    const parsed = body ? parseBody(body) : null;

    if (!parsed) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Request must include non-empty tweetId and tweetText",
          },
        },
        400
      );
    }

    const result = await cacheService.analyze(parsed.tweetId, parsed.tweetText);
    const latencyMs = Date.now() - startedAt;

    if (!result) {
      return c.json(
        {
          tweet_id: parsed.tweetId,
          analysis: null,
          source: "llm",
          latency_ms: latencyMs,
        },
        200
      );
    }

    return c.json(toResponse(result, latencyMs), 200);
  });

  return analyzeRoutes;
};

export const analyzeRoutes = createAnalyzeRoutes();
