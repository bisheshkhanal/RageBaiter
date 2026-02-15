import { describe, expect, it, vi } from "vitest";

import { createAnalyzeRoutes } from "./analyze.js";
import {
  TweetAnalysisCacheService,
  type AnalyzeCacheRepository,
  type StoredAnalyzedTweet,
} from "../services/tweet-analysis-cache.js";

class InMemoryRepository implements AnalyzeCacheRepository {
  private readonly rows = new Map<string, StoredAnalyzedTweet>();

  public async getByTweetId(tweetId: string): Promise<StoredAnalyzedTweet | null> {
    return this.rows.get(tweetId) ?? null;
  }

  public async upsert(record: StoredAnalyzedTweet): Promise<void> {
    this.rows.set(record.tweetId, record);
  }
}

describe("POST /api/analyze integration", () => {
  it("follows miss -> write -> hit with cache metadata", async () => {
    const repository = new InMemoryRepository();
    const upstream = vi.fn(async (_tweetId: string, tweetText: string) => {
      return {
        tweetText,
        tweetVector: {
          social: 0.2,
          economic: 0.1,
          populist: -0.1,
        },
        fallacies: ["False Dilemma"],
        topic: "topic-3",
        confidence: 0.73,
      };
    });

    const service = new TweetAnalysisCacheService(repository, upstream, {
      ttlMs: 24 * 60 * 60 * 1000,
    });
    const app = createAnalyzeRoutes({ cacheService: service });

    const payload = {
      tweetId: "tweet-100",
      tweetText: "This is a political tweet",
    };

    const first = await app.request(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
    );
    const firstBody = (await first.json()) as Record<string, unknown>;

    const second = await app.request(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
    );
    const secondBody = (await second.json()) as Record<string, unknown>;

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.source).toBe("llm");
    expect(secondBody.source).toBe("cache");
    expect(typeof firstBody.latency_ms).toBe("number");
    expect(typeof secondBody.latency_ms).toBe("number");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("returns fallback payload when upstream analyzer returns null", async () => {
    const repository = new InMemoryRepository();
    const upstream = vi.fn(async () => null);
    const service = new TweetAnalysisCacheService(repository, upstream, {
      ttlMs: 24 * 60 * 60 * 1000,
    });
    const app = createAnalyzeRoutes({ cacheService: service });

    const response = await app.request(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tweetId: "tweet-fallback",
          tweetText: "This could not be analyzed",
        }),
      })
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.tweet_id).toBe("tweet-fallback");
    expect(body.analysis).toBeNull();
    expect(body.source).toBe("llm");
    expect(typeof body.latency_ms).toBe("number");
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
