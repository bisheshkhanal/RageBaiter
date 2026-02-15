import { describe, expect, it, vi } from "vitest";

import {
  TweetAnalysisCacheService,
  type AnalyzeCacheRepository,
  type StoredAnalyzedTweet,
} from "./tweet-analysis-cache.js";

class InMemoryRepository implements AnalyzeCacheRepository {
  private readonly records = new Map<string, StoredAnalyzedTweet>();

  public async getByTweetId(tweetId: string): Promise<StoredAnalyzedTweet | null> {
    return this.records.get(tweetId) ?? null;
  }

  public async upsert(record: StoredAnalyzedTweet): Promise<void> {
    this.records.set(record.tweetId, record);
  }
}

const createAnalyzer = () => {
  const spy = vi.fn(async (_tweetId: string, tweetText: string) => {
    return {
      tweetText,
      tweetVector: {
        social: 0.1,
        economic: -0.2,
        populist: 0.3,
      },
      fallacies: ["Strawman"],
      topic: "topic-1",
      confidence: 0.88,
    };
  });

  return spy;
};

describe("TweetAnalysisCacheService", () => {
  it("returns llm on miss, then cache on hit", async () => {
    const analyzer = createAnalyzer();
    const service = new TweetAnalysisCacheService(new InMemoryRepository(), analyzer);

    const miss = await service.analyze("tweet-1", "hello world");
    const hit = await service.analyze("tweet-1", "hello world");

    if (!miss || !hit) {
      throw new Error("Expected cache service to return analysis");
    }
    expect(miss.source).toBe("llm");
    expect(hit.source).toBe("cache");
    expect(analyzer).toHaveBeenCalledTimes(1);
  });

  it("treats expired entries as miss and re-analyzes", async () => {
    const analyzer = createAnalyzer();
    let now = 1000;
    const service = new TweetAnalysisCacheService(new InMemoryRepository(), analyzer, {
      ttlMs: 100,
      now: () => now,
    });

    const first = await service.analyze("tweet-2", "body");
    now = 1201;
    const second = await service.analyze("tweet-2", "body");

    if (!first || !second) {
      throw new Error("Expected cache service to return analysis");
    }
    expect(first.source).toBe("llm");
    expect(second.source).toBe("llm");
    expect(analyzer).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent requests to one upstream call", async () => {
    let release: (() => void) | undefined;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });

    const analyzer = vi.fn(async (_tweetId: string, tweetText: string) => {
      await blocker;
      return {
        tweetText,
        tweetVector: {
          social: 0,
          economic: 0,
          populist: 0,
        },
        fallacies: ["Ad Hominem"],
        topic: "topic-2",
        confidence: 0.5,
      };
    });

    const service = new TweetAnalysisCacheService(new InMemoryRepository(), analyzer);
    const first = service.analyze("tweet-3", "same");
    const second = service.analyze("tweet-3", "same");

    release?.();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    if (!firstResult || !secondResult) {
      throw new Error("Expected cache service to return analysis");
    }
    expect(firstResult.source).toBe("llm");
    expect(secondResult.source).toBe("llm");
    expect(analyzer).toHaveBeenCalledTimes(1);
  });

  it("degrades gracefully when repository fails", async () => {
    const failingRepository: AnalyzeCacheRepository = {
      getByTweetId: vi.fn(async () => {
        throw new Error("db unavailable");
      }),
      upsert: vi.fn(async () => {
        throw new Error("db unavailable");
      }),
    };

    const analyzer = createAnalyzer();
    const service = new TweetAnalysisCacheService(failingRepository, analyzer);

    const first = await service.analyze("tweet-4", "text");
    const second = await service.analyze("tweet-4", "text");

    if (!first || !second) {
      throw new Error("Expected cache service to return analysis");
    }
    expect(first.source).toBe("llm");
    expect(second.source).toBe("cache");
    expect(analyzer).toHaveBeenCalledTimes(1);
  });

  it("evicts least recently used entries when max size is reached", async () => {
    const noPersistenceRepository: AnalyzeCacheRepository = {
      getByTweetId: vi.fn(async () => null),
      upsert: vi.fn(async () => {
        return;
      }),
    };

    const analyzer = createAnalyzer();
    const service = new TweetAnalysisCacheService(noPersistenceRepository, analyzer, {
      maxEntries: 1,
    });

    await service.analyze("tweet-a", "a");
    await service.analyze("tweet-b", "b");
    const afterEviction = await service.analyze("tweet-a", "a");

    if (!afterEviction) {
      throw new Error("Expected cache service to return analysis");
    }
    expect(afterEviction.source).toBe("llm");
    expect(analyzer).toHaveBeenCalledTimes(3);
    expect(service.memorySize()).toBe(1);
  });
});
