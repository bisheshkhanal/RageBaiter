import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { authMiddleware } from "../middleware/auth.js";
import { SupabaseCacheRepository } from "../services/supabase-cache-repository.js";
import { TweetAnalysisCacheService } from "../services/tweet-analysis-cache.js";
import type { AppEnv } from "../types.js";
import { createBearerAuthHeader, TEST_AUTH_ID } from "../test-helpers/auth.js";
import { cleanupTestData, countRows } from "../test-helpers/supabase.js";
import { loadTestEnv } from "../test-helpers/env.js";
import { createAnalyzeRoutes } from "./analyze.js";

loadTestEnv();

const createTestApp = (service: TweetAnalysisCacheService): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();
  app.use("/api/*", authMiddleware);
  app.route("/api/analyze", createAnalyzeRoutes({ cacheService: service }));
  return app;
};

describe("POST /api/analyze integration", () => {
  afterEach(async () => {
    await cleanupTestData(TEST_AUTH_ID, "test-analyze-");
  });

  it("writes analysis on first request and reads from cache on second request", async () => {
    const repository = SupabaseCacheRepository.fromEnv();
    if (!repository) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for integration tests"
      );
    }

    const tweetId = `test-analyze-${Date.now()}`;
    const payload = {
      tweetId,
      tweetText: "Integration test analyze tweet",
    };

    const firstUpstream = vi.fn(async (_tweetId: string, tweetText: string) => ({
      tweetText,
      tweetVector: { social: 0.45, economic: -0.25, populist: 0.15 },
      fallacies: ["False Dilemma"],
      topic: "integration",
      confidence: 0.92,
      counterArgument: "Counter",
      logicFailure: "Logic",
      claim: "Claim",
      mechanism: "Mechanism",
      dataCheck: "Data",
      socraticChallenge: "Question",
    }));

    const firstService = new TweetAnalysisCacheService(repository, firstUpstream, {
      ttlMs: 24 * 60 * 60 * 1000,
    });

    const firstApp = createTestApp(firstService);
    const firstResponse = await firstApp.request(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
    );
    const firstBody = (await firstResponse.json()) as {
      source: string;
      analysis: {
        tweet_vector: { social: number; economic: number; populist: number };
      };
    };

    expect(firstResponse.status).toBe(200);
    expect(firstBody.source).toBe("llm");
    expect(firstBody.analysis.tweet_vector.social).toBe(0.45);
    expect(firstUpstream).toHaveBeenCalledTimes(1);
    expect(await countRows("analyzed_tweets", { tweet_id: `eq.${tweetId}` })).toBe(1);

    const secondUpstream = vi.fn(async () => ({
      tweetText: "Should not be used",
      tweetVector: { social: -1, economic: -1, populist: -1 },
      fallacies: [],
      topic: "nope",
      confidence: 0.1,
    }));

    const secondService = new TweetAnalysisCacheService(repository, secondUpstream, {
      ttlMs: 24 * 60 * 60 * 1000,
    });

    const secondApp = createTestApp(secondService);
    const secondResponse = await secondApp.request(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
    );
    const secondBody = (await secondResponse.json()) as {
      source: string;
      analysis: {
        tweet_vector: { social: number; economic: number; populist: number };
      };
    };

    expect(secondResponse.status).toBe(200);
    expect(secondBody.source).toBe("cache");
    expect(secondBody.analysis.tweet_vector.social).toBe(0.45);
    expect(secondUpstream).toHaveBeenCalledTimes(0);
    expect(await countRows("analyzed_tweets", { tweet_id: `eq.${tweetId}` })).toBe(1);
  });
});
