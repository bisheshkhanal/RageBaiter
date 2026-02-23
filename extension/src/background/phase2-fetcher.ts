import type { Phase2Analysis, Phase1Analysis, ByokProvider } from "@ragebaiter/shared";
import { getAllByokKeys, getPrimaryByokProvider } from "../lib/llm-config.js";
import { logger } from "../lib/logger.js";

export type Phase2FetcherOptions = {
  getBackendUrl: () => string;
  getHeaders: () => Promise<Record<string, string>>;
  timeoutMs?: number;
};

type Phase2ApiResponse =
  | {
      success: true;
      analysis: {
        counterArgument: string;
        logicFailure: string;
        claim: string;
        mechanism: string;
        dataCheck: string;
        socraticChallenge: string;
      };
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
        quota?: {
          used: number;
          limit: number;
          resetsAt: string;
        };
      };
    };

export type QuotaExhaustedResult = {
  quotaExhausted: true;
  quota: {
    used: number;
    limit: number;
    resetsAt: string;
  };
};

export type Phase2FetchResult =
  | { ok: true; analysis: Phase2Analysis }
  | { ok: false; error: string }
  | QuotaExhaustedResult;

export const createPhase2Fetcher = (
  options: Phase2FetcherOptions
): ((
  tweetId: string,
  tweetText: string,
  phase1Result: Phase1Analysis
) => Promise<Phase2FetchResult>) => {
  const timeoutMs = options.timeoutMs ?? 30000;

  return async (
    tweetId: string,
    tweetText: string,
    phase1Result: Phase1Analysis
  ): Promise<Phase2FetchResult> => {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const backendUrl = options.getBackendUrl();
      const headers = await options.getHeaders();

      const byokKeys = await getAllByokKeys();
      const primaryProvider = await getPrimaryByokProvider();
      let apiKey: string | undefined;
      let provider: ByokProvider | undefined;

      if (primaryProvider) {
        apiKey = byokKeys[primaryProvider];
        provider = primaryProvider;
      }

      const response = await fetch(`${backendUrl}/api/analyze/phase2`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          tweetId,
          tweetText,
          phase1Result: {
            tweetVector: phase1Result.tweetVector,
            fallacies: phase1Result.fallacies,
            topic: phase1Result.topic,
            confidence: phase1Result.confidence,
          },
          provider,
          apiKey,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        logger.warn(`Phase 2 backend ${response.status} for ${tweetId}: ${errorText}`);
        return { ok: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = (await response.json()) as Phase2ApiResponse;

      if (!data.success) {
        if (data.error.code === "QUOTA_EXHAUSTED" && data.error.quota) {
          return {
            quotaExhausted: true,
            quota: data.error.quota,
          };
        }
        return { ok: false, error: data.error.message };
      }

      return {
        ok: true,
        analysis: {
          counterArgument: data.analysis.counterArgument,
          logicFailure: data.analysis.logicFailure,
          claim: data.analysis.claim,
          mechanism: data.analysis.mechanism,
          dataCheck: data.analysis.dataCheck,
          socraticChallenge: data.analysis.socraticChallenge,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Phase 2 fetch failed for ${tweetId}:`, message);
      return { ok: false, error: message };
    } finally {
      globalThis.clearTimeout(timer);
    }
  };
};
