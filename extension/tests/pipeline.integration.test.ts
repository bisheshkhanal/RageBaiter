import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PipelineOrchestrator,
  AnalysisCache,
  Semaphore,
  type PipelineDeps,
  type PipelineConfig,
  type TweetInput,
} from "../src/background/pipeline.js";
import { createDecisionEngine } from "../src/background/decision-engine.js";
import type { AnalyzeResultPayload } from "../src/messaging/protocol.js";

const POLITICAL_TWEET: TweetInput = {
  tweetId: "tweet-political-1",
  tweetText: "The president signed new legislation on immigration policy and tax reform",
  authorHandle: "politico",
  timestamp: "2026-02-15T12:00:00.000Z",
  tabId: 1,
  tabUrl: "https://x.com/home",
};

const NON_POLITICAL_TWEET: TweetInput = {
  tweetId: "tweet-casual-1",
  tweetText: "Just had the best pizza in town, highly recommend!",
  authorHandle: "foodie",
  timestamp: "2026-02-15T12:01:00.000Z",
  tabId: 1,
  tabUrl: "https://x.com/home",
};

const BACKEND_ANALYSIS: AnalyzeResultPayload = {
  tweetId: "tweet-political-1",
  topic: "Immigration Policy",
  confidence: 0.92,
  tweetVector: { social: 0.1, economic: -0.2, populist: 0.3 },
  fallacies: ["Ad Hominem"],
};

const DEFAULT_USER_PROFILE = {
  userVector: { social: 0, economic: 0, populist: 0 },
};

const DEFAULT_CONFIG: PipelineConfig = {
  maxConcurrency: 5,
  backendUrl: "http://localhost:3001",
  backendTimeoutMs: 10_000,
  politicalSensitivity: "medium",
};

const createMockDeps = (overrides: Partial<PipelineDeps> = {}): PipelineDeps => ({
  getConfig: () => DEFAULT_CONFIG,
  getUserProfile: async () => DEFAULT_USER_PROFILE,
  evaluateTweet: createDecisionEngine({ now: () => 1_000 }).evaluateTweet,
  keywordFilter: (text: string, sensitivity: "low" | "medium" | "high") => {
    const terms = [
      "president",
      "legislation",
      "immigration",
      "policy",
      "tax",
      "election",
      "vote",
      "congress",
    ];
    const lower = text.toLowerCase();
    const matched = terms.filter((t) => lower.includes(t));
    const threshold = sensitivity === "high" ? 1 : sensitivity === "low" ? 3 : 2;
    return {
      isPolitical: matched.length >= threshold,
      matchedKeywords: matched,
      confidence: Math.min(1, matched.length * 0.2),
    };
  },
  sendInterventionToTab: vi.fn(async () => undefined),
  isExtensionActiveOnUrl: async () => true,
  fetchBackendAnalysis: vi.fn(async () => BACKEND_ANALYSIS),
  ...overrides,
});

describe("PipelineOrchestrator integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs full pipeline for political tweet: filter -> backend -> decision -> inject", async () => {
    const deps = createMockDeps();
    const orchestrator = new PipelineOrchestrator(deps);

    const result = await orchestrator.processTweet(POLITICAL_TWEET);

    expect(result.tweetId).toBe("tweet-political-1");
    expect(result.stage).toBe("injected");
    expect(result.decision).toBeDefined();
    expect(result.decision?.shouldIntervene).toBe(true);
    expect(deps.fetchBackendAnalysis).toHaveBeenCalledWith(
      "tweet-political-1",
      POLITICAL_TWEET.tweetText
    );
    expect(deps.sendInterventionToTab).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        tweetId: "tweet-political-1",
        level: expect.any(String),
      }),
      undefined
    );
  });

  it("stops at keyword_filter for non-political tweet (no backend call)", async () => {
    const deps = createMockDeps();
    const orchestrator = new PipelineOrchestrator(deps);

    const result = await orchestrator.processTweet(NON_POLITICAL_TWEET);

    expect(result.tweetId).toBe("tweet-casual-1");
    expect(result.stage).toBe("keyword_filter");
    expect(result.decision).toBeUndefined();
    expect(deps.fetchBackendAnalysis).not.toHaveBeenCalled();
    expect(deps.sendInterventionToTab).not.toHaveBeenCalled();
  });

  it("returns cache_hit on second call for same tweet", async () => {
    const deps = createMockDeps();
    const orchestrator = new PipelineOrchestrator(deps);

    await orchestrator.processTweet(POLITICAL_TWEET);
    const second = await orchestrator.processTweet(POLITICAL_TWEET);

    expect(deps.fetchBackendAnalysis).toHaveBeenCalledTimes(1);
    expect(second.stage).not.toBe("keyword_filter");
    expect(orchestrator.cacheSize).toBe(1);
  });

  it("isolates failure: backend error does not crash pipeline", async () => {
    const deps = createMockDeps({
      fetchBackendAnalysis: vi.fn(async () => null),
    });
    const orchestrator = new PipelineOrchestrator(deps);

    const result = await orchestrator.processTweet(POLITICAL_TWEET);

    expect(result.tweetId).toBe("tweet-political-1");
    expect(result.stage).toBe("backend_analyze");
    expect(result.error).toBe("Backend returned null");
    expect(deps.sendInterventionToTab).not.toHaveBeenCalled();
  });

  it("isolates failure: injection error does not throw", async () => {
    const deps = createMockDeps({
      sendInterventionToTab: vi.fn(async () => {
        throw new Error("Tab closed");
      }),
    });
    const orchestrator = new PipelineOrchestrator(deps);

    const result = await orchestrator.processTweet(POLITICAL_TWEET);

    expect(result.tweetId).toBe("tweet-political-1");
    expect(result.stage).toBe("decision");
    expect(result.error).toBe("Tab closed");
    expect(result.decision?.shouldIntervene).toBe(true);
  });

  it("skips tweet when site is not active", async () => {
    const deps = createMockDeps({
      isExtensionActiveOnUrl: async () => false,
    });
    const orchestrator = new PipelineOrchestrator(deps);

    const result = await orchestrator.processTweet(POLITICAL_TWEET);

    expect(result.stage).toBe("skipped");
    expect(deps.fetchBackendAnalysis).not.toHaveBeenCalled();
  });

  it("deduplicates in-flight tweets", async () => {
    let resolveBackend: ((v: AnalyzeResultPayload | null) => void) | undefined;
    const deps = createMockDeps({
      fetchBackendAnalysis: vi.fn(
        () =>
          new Promise<AnalyzeResultPayload | null>((resolve) => {
            resolveBackend = resolve;
          })
      ),
    });
    const orchestrator = new PipelineOrchestrator(deps);

    const first = orchestrator.processTweet(POLITICAL_TWEET);
    const second = orchestrator.processTweet(POLITICAL_TWEET);

    const secondResult = await second;
    expect(secondResult.stage).toBe("skipped");

    resolveBackend?.(BACKEND_ANALYSIS);
    const firstResult = await first;
    expect(firstResult.stage).toBe("injected");
    expect(deps.fetchBackendAnalysis).toHaveBeenCalledTimes(1);
  });

  it("respects decision engine cooldown across tweets", async () => {
    let nowMs = 1_000;
    const engine = createDecisionEngine({ now: () => nowMs });
    const deps = createMockDeps({
      evaluateTweet: (a, p) => engine.evaluateTweet(a, p),
    });
    const orchestrator = new PipelineOrchestrator(deps);

    const first = await orchestrator.processTweet(POLITICAL_TWEET);
    expect(first.decision?.shouldIntervene).toBe(true);

    nowMs = 2_000;
    const secondTweet = { ...POLITICAL_TWEET, tweetId: "tweet-political-2" };
    const deps2 = createMockDeps({
      evaluateTweet: (a, p) => engine.evaluateTweet(a, p),
    });
    const orchestrator2 = new PipelineOrchestrator(deps2);
    const second = await orchestrator2.processTweet(secondTweet);

    expect(second.decision?.shouldIntervene).toBe(false);
  });
});

describe("Semaphore", () => {
  it("allows up to max concurrent acquisitions", async () => {
    const sem = new Semaphore(2);

    await sem.acquire();
    await sem.acquire();

    expect(sem.current).toBe(2);

    let thirdAcquired = false;
    const thirdPromise = sem.acquire().then(() => {
      thirdAcquired = true;
    });

    await new Promise((r) => globalThis.setTimeout(r, 10));
    expect(thirdAcquired).toBe(false);

    sem.release();
    await thirdPromise;
    expect(thirdAcquired).toBe(true);
    expect(sem.current).toBe(2);
  });

  it("processes queued waiters in FIFO order", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    const order: number[] = [];
    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));

    sem.release();
    await p1;
    sem.release();
    await p2;

    expect(order).toEqual([1, 2]);
  });
});

describe("AnalysisCache", () => {
  it("stores and retrieves entries", () => {
    const cache = new AnalysisCache();
    cache.set("t1", BACKEND_ANALYSIS);

    expect(cache.get("t1")).toEqual(BACKEND_ANALYSIS);
    expect(cache.size).toBe(1);
  });

  it("returns null for missing entries", () => {
    const cache = new AnalysisCache();
    expect(cache.get("nonexistent")).toBeNull();
  });

  it("clears all entries", () => {
    const cache = new AnalysisCache();
    cache.set("t1", BACKEND_ANALYSIS);
    cache.set("t2", { ...BACKEND_ANALYSIS, tweetId: "t2" });
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe("processBatch concurrency", () => {
  it("processes up to maxConcurrency tweets in parallel", async () => {
    let concurrentCount = 0;
    let maxObservedConcurrency = 0;

    const deps = createMockDeps({
      fetchBackendAnalysis: vi.fn(async (tweetId: string) => {
        concurrentCount++;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, concurrentCount);
        await new Promise((r) => globalThis.setTimeout(r, 20));
        concurrentCount--;
        return { ...BACKEND_ANALYSIS, tweetId };
      }),
    });

    const config: PipelineConfig = { ...DEFAULT_CONFIG, maxConcurrency: 3 };
    const orchestrator = new PipelineOrchestrator({ ...deps, getConfig: () => config });

    const tweets: TweetInput[] = Array.from({ length: 6 }, (_, i) => ({
      ...POLITICAL_TWEET,
      tweetId: `batch-${i}`,
    }));

    const results = await orchestrator.processBatch(tweets);

    expect(results).toHaveLength(6);
    expect(maxObservedConcurrency).toBeLessThanOrEqual(3);
    expect(results.every((r) => r.error === undefined || r.stage === "decision")).toBe(true);
  });

  it("isolates individual failures in batch without affecting others", async () => {
    let callCount = 0;
    const deps = createMockDeps({
      fetchBackendAnalysis: vi.fn(async (tweetId: string) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Simulated backend crash");
        }
        return { ...BACKEND_ANALYSIS, tweetId };
      }),
    });
    const orchestrator = new PipelineOrchestrator(deps);

    const tweets: TweetInput[] = Array.from({ length: 4 }, (_, i) => ({
      ...POLITICAL_TWEET,
      tweetId: `fail-batch-${i}`,
    }));

    const results = await orchestrator.processBatch(tweets);

    expect(results).toHaveLength(4);
    const errors = results.filter((r) => r.error !== undefined);
    const successes = results.filter((r) => r.error === undefined);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(successes.length).toBeGreaterThanOrEqual(2);
  });
});
