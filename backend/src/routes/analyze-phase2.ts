import type { ByokProvider, Phase1Analysis, Phase2Request } from "@ragebaiter/shared";
import { Hono } from "hono";

import { createPhase2Analyzer } from "../services/phase2-analyzer.js";
import { phase2CacheService } from "../services/phase2-cache.js";
import { quotaService } from "../services/quota-service.js";

type AnalyzePhase2RoutesOptions = {
  analyzer?: ReturnType<typeof createPhase2Analyzer>;
  cache?: Pick<typeof phase2CacheService, "get" | "set">;
  quota?: Pick<typeof quotaService, "incrementQuota">;
};

type InvalidErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "ANALYSIS_FAILED"
  | "INTERNAL_ERROR";

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const isByokProvider = (value: unknown): value is ByokProvider => {
  return value === "openai" || value === "anthropic" || value === "google";
};

const parsePhase1 = (value: unknown): Phase1Analysis | null => {
  if (!isObject(value)) {
    return null;
  }

  const tweetVector = value.tweetVector;
  if (!isObject(tweetVector)) {
    return null;
  }

  const social = tweetVector.social;
  const economic = tweetVector.economic;
  const populist = tweetVector.populist;
  if (!isFiniteNumber(social) || !isFiniteNumber(economic) || !isFiniteNumber(populist)) {
    return null;
  }

  const fallacies = value.fallacies;
  if (!Array.isArray(fallacies) || !fallacies.every((item) => typeof item === "string")) {
    return null;
  }

  const topic = value.topic;
  const confidence = value.confidence;
  if (typeof topic !== "string" || topic.trim().length === 0 || !isFiniteNumber(confidence)) {
    return null;
  }

  return {
    tweetVector: {
      social,
      economic,
      populist,
    },
    fallacies,
    topic,
    confidence,
  };
};

const parseRequest = (value: unknown): Phase2Request | null => {
  if (!isObject(value)) {
    return null;
  }

  const tweetId = typeof value.tweetId === "string" ? value.tweetId.trim() : "";
  const tweetText = typeof value.tweetText === "string" ? value.tweetText.trim() : "";
  const phase1Result = parsePhase1(value.phase1Result);
  const providerRaw = value.provider;
  const apiKeyRaw = value.apiKey;

  if (tweetId.length === 0 || tweetText.length === 0 || !phase1Result) {
    return null;
  }

  if (providerRaw !== undefined && !isByokProvider(providerRaw)) {
    return null;
  }

  if (apiKeyRaw !== undefined && typeof apiKeyRaw !== "string") {
    return null;
  }

  const provider = providerRaw;
  const apiKey = typeof apiKeyRaw === "string" ? apiKeyRaw.trim() : undefined;

  return {
    tweetId,
    tweetText,
    phase1Result,
    ...(provider ? { provider } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
};

const invalidResponse = (code: InvalidErrorCode, message: string) => {
  return {
    success: false,
    error: {
      code,
      message,
    },
  };
};

export const createAnalyzePhase2Routes = (options: AnalyzePhase2RoutesOptions = {}) => {
  const analyzePhase2Routes = new Hono<{ Variables: { authId?: string } }>();
  const analyzer = options.analyzer ?? createPhase2Analyzer();
  const cache = options.cache ?? phase2CacheService;
  const quota = options.quota ?? quotaService;

  analyzePhase2Routes.post("/", async (c) => {
    const authId = c.get("authId");
    if (typeof authId !== "string" || authId.length === 0) {
      return c.json(invalidResponse("UNAUTHORIZED", "Authentication required"), 401);
    }

    const body = (await c.req.json().catch(() => null)) as unknown;
    if (body === null) {
      return c.json(invalidResponse("INVALID_JSON", "Request body must be valid JSON"), 400);
    }

    const parsed = parseRequest(body);
    if (!parsed) {
      return c.json(
        invalidResponse(
          "INVALID_REQUEST",
          "Request must include tweetId, tweetText, and a valid phase1Result"
        ),
        400
      );
    }

    const userId = authId;
    const byokKey = parsed.apiKey?.trim();
    const hasByokKey = typeof byokKey === "string" && byokKey.length > 0;
    const provider = parsed.provider;

    if (!hasByokKey) {
      const quotaResult = await quota.incrementQuota(userId);
      if (!quotaResult.success) {
        return c.json(
          {
            success: false,
            error: {
              code: "QUOTA_EXHAUSTED",
              message: "Monthly analysis quota exhausted. Bring your own key or wait for reset.",
              quota: {
                used: quotaResult.analysesUsed,
                limit: quotaResult.limit,
                resetsAt: quotaResult.resetsAt,
              },
            },
          },
          429
        );
      }
    }

    const cached = await cache.get(parsed.tweetId, userId);
    if (cached) {
      return c.json({ success: true, analysis: cached.analysis }, 200);
    }

    const analysis = await analyzer(
      parsed.tweetId,
      parsed.tweetText,
      parsed.phase1Result,
      hasByokKey ? byokKey : undefined,
      provider
    );

    if (!analysis) {
      return c.json(
        invalidResponse("ANALYSIS_FAILED", "Could not generate phase 2 analysis for this tweet"),
        502
      );
    }

    await cache.set(
      parsed.tweetId,
      userId,
      analysis,
      hasByokKey ? (provider ?? "byok") : "internal"
    );

    return c.json({ success: true, analysis }, 200);
  });

  return analyzePhase2Routes;
};

export const analyzePhase2Routes = createAnalyzePhase2Routes();

export default analyzePhase2Routes;
