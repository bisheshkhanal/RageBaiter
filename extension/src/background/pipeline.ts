import {
  type TweetAnalysis,
  type UserProfile,
  type InterventionDecision,
} from "./decision-engine.js";
import type { PoliticalVectorPayload, AnalyzeResultPayload } from "../messaging/protocol.js";
import { createPhase1Fetcher } from "./phase1-fetcher.js";
import { createPhase2Fetcher, type Phase2FetchResult } from "./phase2-fetcher.js";
import { logger } from "../lib/logger.js";

type Phase1Analysis = NonNullable<Awaited<ReturnType<ReturnType<typeof createPhase1Fetcher>>>>;

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
  fetchPhase1?: (tweetId: string, tweetText: string) => Promise<Phase1Analysis | null>;
  fetchPhase2?: (
    tweetId: string,
    tweetText: string,
    phase1: Phase1Analysis
  ) => Promise<Phase2FetchResult>;
  fetchBackendAnalysis?: (
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
      const { decision } = await this._evaluateDecision(input, cached);

      if (!decision.shouldIntervene) {
        return { tweetId: input.tweetId, stage: "decision", decision };
      }

      let phase2Result: Phase2FetchResult | undefined;
      if (this._deps.fetchPhase2) {
        const phase1ForPhase2: Phase1Analysis = {
          tweetVector: cached.tweetVector,
          fallacies: cached.fallacies,
          topic: cached.topic,
          confidence: cached.confidence,
        };
        phase2Result = await this._deps.fetchPhase2(
          input.tweetId,
          input.tweetText,
          phase1ForPhase2
        );
      }

      return this._runDecisionAndInject(input, cached, decision, phase2Result);
    }

    await this._semaphore.acquire();
    let analysis: AnalyzeResultPayload | null;
    try {
      if (this._deps.fetchPhase1) {
        const phase1Result = await this._deps.fetchPhase1(input.tweetId, input.tweetText);
        analysis = phase1Result
          ? {
              tweetId: input.tweetId,
              topic: phase1Result.topic,
              confidence: phase1Result.confidence,
              tweetVector: phase1Result.tweetVector,
              fallacies: [...phase1Result.fallacies],
            }
          : null;
      } else if (this._deps.fetchBackendAnalysis) {
        analysis = await this._deps.fetchBackendAnalysis(input.tweetId, input.tweetText);
      } else {
        analysis = null;
      }
    } finally {
      this._semaphore.release();
    }

    if (!analysis) {
      return { tweetId: input.tweetId, stage: "backend_analyze", error: "Phase 1 returned null" };
    }

    this._cache.set(input.tweetId, analysis);

    const { decision } = await this._evaluateDecision(input, analysis);

    if (!decision.shouldIntervene) {
      return { tweetId: input.tweetId, stage: "decision", decision };
    }

    let phase2Result: Phase2FetchResult | undefined;
    if (this._deps.fetchPhase2) {
      const phase1ForPhase2: Phase1Analysis = {
        tweetVector: analysis.tweetVector,
        fallacies: analysis.fallacies,
        topic: analysis.topic,
        confidence: analysis.confidence,
      };
      phase2Result = await this._deps.fetchPhase2(input.tweetId, input.tweetText, phase1ForPhase2);
    }

    return this._runDecisionAndInject(input, analysis, decision, phase2Result);
  }

  private async _evaluateDecision(
    input: TweetInput,
    analysis: AnalyzeResultPayload
  ): Promise<{ decision: InterventionDecision; isDemoHost: boolean }> {
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

    return { decision, isDemoHost };
  }

  private async _runDecisionAndInject(
    input: TweetInput,
    analysis: AnalyzeResultPayload,
    decision: InterventionDecision,
    phase2Result?: Phase2FetchResult
  ): Promise<PipelineResult> {
    if (!decision.shouldIntervene) {
      return { tweetId: input.tweetId, stage: "decision", decision };
    }

    if (phase2Result && "quotaExhausted" in phase2Result) {
      const quota = phase2Result.quota;
      const message = `Phase 2 quota exhausted (${quota.used}/${quota.limit}), resets ${quota.resetsAt}`;
      logger.warn(`Skipping intervention for ${input.tweetId}:`, message);
      return { tweetId: input.tweetId, stage: "decision", decision, error: message };
    }

    if (phase2Result && !phase2Result.ok) {
      logger.warn(`Phase 2 failed for ${input.tweetId}:`, phase2Result.error);
      return {
        tweetId: input.tweetId,
        stage: "decision",
        decision,
        error: `Phase 2 failed: ${phase2Result.error}`,
      };
    }

    const phase2Analysis = phase2Result?.ok
      ? phase2Result.analysis
      : {
          counterArgument: analysis.counterArgument,
          logicFailure: analysis.logicFailure,
          claim: analysis.claim,
          mechanism: analysis.mechanism,
          dataCheck: analysis.dataCheck,
          socraticChallenge: analysis.socraticChallenge,
        };

    const interventionLevel = decision.level;
    const interventionReason = decision.action;

    try {
      await this._deps.sendInterventionToTab(input.tabId, {
        tweetId: input.tweetId,
        level: interventionLevel,
        reason: interventionReason,
        counterArgument: phase2Analysis.counterArgument,
        logicFailure: phase2Analysis.logicFailure,
        claim: phase2Analysis.claim,
        mechanism: phase2Analysis.mechanism,
        dataCheck: phase2Analysis.dataCheck,
        socraticChallenge: phase2Analysis.socraticChallenge,
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
  const fetchPhase1 = createPhase1Fetcher({
    getBackendUrl,
    getHeaders,
    timeoutMs,
  });
  const fetchPhase2 = createPhase2Fetcher({
    getBackendUrl,
    getHeaders,
    timeoutMs,
  });

  return async (tweetId: string, tweetText: string): Promise<AnalyzeResultPayload | null> => {
    const phase1 = await fetchPhase1(tweetId, tweetText);
    if (!phase1) {
      return null;
    }

    const base: AnalyzeResultPayload = {
      tweetId,
      topic: phase1.topic,
      confidence: phase1.confidence,
      tweetVector: phase1.tweetVector,
      fallacies: [...phase1.fallacies],
    };

    const phase2 = await fetchPhase2(tweetId, tweetText, phase1);

    if ("quotaExhausted" in phase2) {
      logger.warn(
        `Phase 2 quota exhausted in legacy fetcher for ${tweetId}: ${phase2.quota.used}/${phase2.quota.limit}`
      );
      return base;
    }

    if (!phase2.ok) {
      logger.warn(`Phase 2 failed in legacy fetcher for ${tweetId}:`, phase2.error);
      return base;
    }

    return {
      ...base,
      counterArgument: phase2.analysis.counterArgument,
      logicFailure: phase2.analysis.logicFailure,
      claim: phase2.analysis.claim,
      mechanism: phase2.analysis.mechanism,
      dataCheck: phase2.analysis.dataCheck,
      socraticChallenge: phase2.analysis.socraticChallenge,
    };
  };
};
