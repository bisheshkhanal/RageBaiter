import { Hono } from "hono";

import { createPhase1Analyzer } from "../services/phase1-analyzer.js";
import { createPhase1CacheService, type Phase1CacheService } from "../services/phase1-cache.js";

type AnalyzePhase1RequestBody = {
  tweetId?: unknown;
  tweetText?: unknown;
};

type AnalyzePhase1RoutesOptions = {
  analyzer?: ReturnType<typeof createPhase1Analyzer>;
  cacheService?: Phase1CacheService;
};

type Phase1Analyzer = ReturnType<typeof createPhase1Analyzer>;
type ResolvedPhase1Analysis = NonNullable<Awaited<ReturnType<Phase1Analyzer>>>;

const parseBody = (
  body: AnalyzePhase1RequestBody
): { tweetId: string; tweetText: string } | null => {
  if (typeof body.tweetId !== "string" || body.tweetId.trim().length === 0) {
    return null;
  }

  if (typeof body.tweetText !== "string" || body.tweetText.trim().length === 0) {
    return null;
  }

  return {
    tweetId: body.tweetId,
    tweetText: body.tweetText,
  };
};

const toResponse = (
  tweetId: string,
  analysis: ResolvedPhase1Analysis,
  source: "cache" | "llm",
  latencyMs: number
) => {
  return {
    tweet_id: tweetId,
    analysis: {
      tweet_vector: {
        social: analysis.tweetVector.social,
        economic: analysis.tweetVector.economic,
        populist: analysis.tweetVector.populist,
      },
      fallacies: analysis.fallacies,
      topic: analysis.topic,
      confidence: analysis.confidence,
    },
    source,
    latency_ms: latencyMs,
  };
};

export const createAnalyzePhase1Routes = (options: AnalyzePhase1RoutesOptions = {}) => {
  const analyzePhase1Routes = new Hono();
  const phase1Analyzer = options.analyzer ?? createPhase1Analyzer();
  const phase1Cache = options.cacheService ?? createPhase1CacheService();

  analyzePhase1Routes.post("/", async (c) => {
    const startedAt = Date.now();
    const body = (await c.req.json().catch(() => null)) as AnalyzePhase1RequestBody | null;
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

    const cached = await phase1Cache.get(parsed.tweetId);
    if (cached) {
      return c.json(
        toResponse(cached.tweetId, cached.analysis, "cache", Date.now() - startedAt),
        200
      );
    }

    const analysis = await phase1Analyzer(parsed.tweetId, parsed.tweetText);
    if (!analysis) {
      return c.json(
        {
          error: {
            code: "ANALYSIS_UNAVAILABLE",
            message: "Unable to generate phase1 analysis",
          },
        },
        503
      );
    }

    await phase1Cache.set(parsed.tweetId, parsed.tweetText, analysis);

    return c.json(toResponse(parsed.tweetId, analysis, "llm", Date.now() - startedAt), 200);
  });

  return analyzePhase1Routes;
};

export const analyzePhase1Routes = createAnalyzePhase1Routes();
