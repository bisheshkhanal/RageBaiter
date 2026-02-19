import {
  type TweetAnalysis,
  type UserProfile,
  type InterventionDecision,
} from "./decision-engine.js";
import type { PoliticalVectorPayload, AnalyzeResultPayload } from "../messaging/protocol.js";
import { logger } from "../lib/logger.js";

export type PipelineConfig = {
  maxConcurrency: number;
  backendUrl: string;
  backendTimeoutMs: number;
  politicalSensitivity: "low" | "medium" | "high";
};

export type TweetInput = {
  tweetId: string;
  tweetText: string;
  authorHandle: string;
  timestamp: string;
  tabId: number;
  tabUrl?: string;
};

export type PipelineResult = {
  tweetId: string;
  stage: "keyword_filter" | "cache_hit" | "backend_analyze" | "decision" | "injected" | "skipped";
  decision?: InterventionDecision;
  error?: string;
};

export type CacheEntry = {
  tweetId: string;
  analysis: AnalyzeResultPayload;
  cachedAt: number;
};

type BackendAnalyzeResponse = {
  tweet_id: string;
  analysis: {
    tweet_text: string;
    tweet_vector: PoliticalVectorPayload;
    fallacies: string[];
    topic: string;
    confidence: number;
    counter_argument?: string;
    logic_failure?: string;
    claim?: string;
    mechanism?: string;
    data_check?: string;
    socratic_challenge?: string;
    analyzed_at: string;
    expires_at: string;
  } | null;
  source: string;
  latency_ms: number;
};

export class Semaphore {
  private _current = 0;
  private _queue: Array<() => void> = [];

  constructor(private readonly _max: number) {}

  get current(): number {
    return this._current;
  }

  get max(): number {
    return this._max;
  }

  async acquire(): Promise<void> {
    if (this._current < this._max) {
      this._current++;
      return;
    }

    return new Promise<void>((resolve) => {
      this._queue.push(() => {
        this._current++;
        resolve();
      });
    });
  }

  release(): void {
    this._current--;

    const next = this._queue.shift();
    if (next) {
      next();
    }
  }
}

const MAX_CACHE_SIZE = 500;
const CACHE_TTL_MS = 5 * 60 * 1000;

export class AnalysisCache {
  private _entries = new Map<string, CacheEntry>();

  get(tweetId: string): AnalyzeResultPayload | null {
    const entry = this._entries.get(tweetId);
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      this._entries.delete(tweetId);
      return null;
    }

    this._entries.delete(tweetId);
    this._entries.set(tweetId, entry);
    return entry.analysis;
  }

  set(tweetId: string, analysis: AnalyzeResultPayload): void {
    this._entries.delete(tweetId);
    this._entries.set(tweetId, { tweetId, analysis, cachedAt: Date.now() });

    if (this._entries.size > MAX_CACHE_SIZE) {
      const oldest = this._entries.keys().next().value;
      if (typeof oldest === "string") {
        this._entries.delete(oldest);
      }
    }
  }

  get size(): number {
    return this._entries.size;
  }

  clear(): void {
    this._entries.clear();
  }
}

export type KeywordFilterResult = {
  isPolitical: boolean;
  matchedKeywords: string[];
  confidence: number;
};

export type PipelineDeps = {
  getConfig: () => PipelineConfig;
  getUserProfile: () => Promise<UserProfile>;
  evaluateTweet: (analysis: TweetAnalysis, profile: UserProfile) => InterventionDecision;
  keywordFilter: (text: string, sensitivity: "low" | "medium" | "high") => KeywordFilterResult;
  sendInterventionToTab: (
    tabId: number,
    payload: {
      tweetId: string;
      level: string;
      reason: string;
      counterArgument?: string | undefined;
      logicFailure?: string | undefined;
      claim?: string | undefined;
      mechanism?: string | undefined;
      dataCheck?: string | undefined;
      socraticChallenge?: string | undefined;
      tweetVector?: PoliticalVectorPayload;
    },
    messageId?: string
  ) => Promise<void>;
  isExtensionActiveOnUrl: (url: string) => Promise<boolean>;
  fetchBackendAnalysis: (
    tweetId: string,
    tweetText: string
  ) => Promise<AnalyzeResultPayload | null>;
};

export class PipelineOrchestrator {
  private readonly _semaphore: Semaphore;
  private readonly _cache: AnalysisCache;
  private readonly _deps: PipelineDeps;
  private readonly _inFlight = new Set<string>();

  constructor(deps: PipelineDeps, cache?: AnalysisCache) {
    this._deps = deps;
    this._cache = cache ?? new AnalysisCache();
    this._semaphore = new Semaphore(deps.getConfig().maxConcurrency);
  }

  get inFlightCount(): number {
    return this._inFlight.size;
  }

  get cacheSize(): number {
    return this._cache.size;
  }

  async processTweet(input: TweetInput): Promise<PipelineResult> {
    if (this._inFlight.has(input.tweetId)) {
      return { tweetId: input.tweetId, stage: "skipped" };
    }

    this._inFlight.add(input.tweetId);

    try {
      return await this._executePipeline(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Unhandled error for tweet ${input.tweetId}:`, message);
      return { tweetId: input.tweetId, stage: "keyword_filter", error: message };
    } finally {
      this._inFlight.delete(input.tweetId);
    }
  }

  async processBatch(inputs: TweetInput[]): Promise<PipelineResult[]> {
    return Promise.all(inputs.map((input) => this.processTweet(input)));
  }

  private async _executePipeline(input: TweetInput): Promise<PipelineResult> {
    const config = this._deps.getConfig();

    if (input.tabUrl) {
      const active = await this._deps.isExtensionActiveOnUrl(input.tabUrl);
      if (!active) {
        return { tweetId: input.tweetId, stage: "skipped" };
      }
    }

    const detection = this._deps.keywordFilter(input.tweetText, config.politicalSensitivity);
    if (!detection.isPolitical) {
      return { tweetId: input.tweetId, stage: "keyword_filter" };
    }

    const cached = this._cache.get(input.tweetId);
    if (cached) {
      return this._runDecisionAndInject(input, cached);
    }

    await this._semaphore.acquire();
    let analysis: AnalyzeResultPayload | null;
    try {
      analysis = await this._deps.fetchBackendAnalysis(input.tweetId, input.tweetText);
    } finally {
      this._semaphore.release();
    }

    if (!analysis) {
      return { tweetId: input.tweetId, stage: "backend_analyze", error: "Backend returned null" };
    }

    this._cache.set(input.tweetId, analysis);

    return this._runDecisionAndInject(input, analysis);
  }

  private async _runDecisionAndInject(
    input: TweetInput,
    analysis: AnalyzeResultPayload
  ): Promise<PipelineResult> {
    const tweetAnalysis: TweetAnalysis = {
      tweetId: input.tweetId,
      topic: analysis.topic,
      confidence: analysis.confidence,
      tweetVector: analysis.tweetVector,
      fallacies: analysis.fallacies,
    };

    const profile = await this._deps.getUserProfile();

    const isDemoHost = (() => {
      if (!input.tabUrl) {
        return false;
      }

      try {
        const parsed = new URL(input.tabUrl);
        return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      } catch {
        return false;
      }
    })();

    const demoProfile: typeof profile = isDemoHost
      ? {
          ...profile,
          decisionConfig: {
            ...profile.decisionConfig,
            thresholds: {
              echoChamberMaxDistance: 0.8,
              mildBiasMaxDistance: 1.4,
            },
            cooldownMs: 0,
          },
        }
      : profile;

    const decision = this._deps.evaluateTweet(tweetAnalysis, demoProfile);

    if (!decision.shouldIntervene && !isDemoHost) {
      return { tweetId: input.tweetId, stage: "decision", decision };
    }

    if (!decision.shouldIntervene && isDemoHost) {
      return { tweetId: input.tweetId, stage: "decision", decision };
    }

    const interventionLevel = decision.level;
    const interventionReason = decision.action;

    try {
      await this._deps.sendInterventionToTab(input.tabId, {
        tweetId: input.tweetId,
        level: interventionLevel,
        reason: interventionReason,
        counterArgument: analysis.counterArgument,
        logicFailure: analysis.logicFailure,
        claim: analysis.claim,
        mechanism: analysis.mechanism,
        dataCheck: analysis.dataCheck,
        socraticChallenge: analysis.socraticChallenge,
        tweetVector: analysis.tweetVector,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Injection failed for ${input.tweetId}:`, message);
      return {
        tweetId: input.tweetId,
        stage: "decision",
        decision,
        error: message,
      };
    }

    return {
      tweetId: input.tweetId,
      stage: "injected",
      decision,
    };
  }
}

// ---------------------------------------------------------------------------
// Default backend fetch helper
// ---------------------------------------------------------------------------

export const createBackendFetcher = (
  getBackendUrl: () => string,
  getHeaders: () => Promise<Record<string, string>>,
  timeoutMs: number
): ((tweetId: string, tweetText: string) => Promise<AnalyzeResultPayload | null>) => {
  return async (tweetId: string, tweetText: string): Promise<AnalyzeResultPayload | null> => {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const backendUrl = getBackendUrl();
      const headers = await getHeaders();
      const response = await fetch(`${backendUrl}/api/analyze`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ tweetId, tweetText }),
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn(`Backend ${response.status} for ${tweetId}`);
        return null;
      }

      const data = (await response.json()) as BackendAnalyzeResponse;
      if (!data.analysis) {
        return null;
      }

      return {
        tweetId: data.tweet_id,
        topic: data.analysis.topic,
        confidence: data.analysis.confidence,
        tweetVector: data.analysis.tweet_vector,
        fallacies: data.analysis.fallacies,
        counterArgument: data.analysis.counter_argument,
        logicFailure: data.analysis.logic_failure,
        claim: data.analysis.claim,
        mechanism: data.analysis.mechanism,
        dataCheck: data.analysis.data_check,
        socraticChallenge: data.analysis.socratic_challenge,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Fetch failed for ${tweetId}:`, message);
      return null;
    } finally {
      globalThis.clearTimeout(timer);
    }
  };
};
