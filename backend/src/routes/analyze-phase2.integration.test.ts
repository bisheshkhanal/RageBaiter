import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authMiddleware } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";
import { createBearerAuthHeader, TEST_AUTH_ID } from "../test-helpers/auth.js";
import { loadTestEnv } from "../test-helpers/env.js";
import { createAnalyzePhase2Routes } from "./analyze-phase2.js";

loadTestEnv();

const authServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

const quotaServiceMock = vi.hoisted(() => ({
  incrementQuota: vi.fn(),
}));

const phase2CacheMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

const analyzerMock = vi.hoisted(() => vi.fn());

vi.mock("../services/supabase-auth.js", () => ({
  getSupabaseAuthService: () => authServiceMock,
}));

vi.mock("../services/quota-service.js", () => ({
  quotaService: quotaServiceMock,
}));

vi.mock("../services/phase2-cache.js", () => ({
  phase2CacheService: phase2CacheMock,
}));

vi.mock("../services/phase2-analyzer.js", () => ({
  createPhase2Analyzer: () => analyzerMock,
}));

const createTestApp = (): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();
  app.use("/api/*", authMiddleware);
  app.route(
    "/api/analyze/phase2",
    createAnalyzePhase2Routes({
      quota: quotaServiceMock,
      cache: phase2CacheMock,
      analyzer: analyzerMock,
    })
  );
  return app;
};

const validPhase1Result = {
  tweetVector: { social: 0.5, economic: -0.3, populist: 0.2 },
  fallacies: ["Appeal to Authority"],
  topic: "politics",
  confidence: 0.85,
};

const validRequestBody = {
  tweetId: "tweet-123",
  tweetText: "Sample tweet text for analysis",
  phase1Result: validPhase1Result,
};

const mockAuthenticatedUser = () => {
  authServiceMock.getSession.mockResolvedValue({
    error: undefined,
    user: { id: TEST_AUTH_ID, email: "test@example.com" },
  });
};

describe("/api/analyze/phase2 integration", () => {
  beforeEach(() => {
    authServiceMock.getSession.mockReset();
    quotaServiceMock.incrementQuota.mockReset();
    phase2CacheMock.get.mockReset();
    phase2CacheMock.set.mockReset();
    analyzerMock.mockReset();
  });

  it("rejects unauthenticated requests with 401 UNAUTHORIZED", async () => {
    const app = createTestApp();

    const response = await app.request(
      new Request("http://localhost/api/analyze/phase2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validRequestBody),
      })
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBe("Missing or invalid authentication credentials");
  });

  it("rejects requests with invalid JSON body", async () => {
    const app = createTestApp();
    mockAuthenticatedUser();

    const response = await app.request(
      new Request("http://localhost/api/analyze/phase2", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: "not valid json",
      })
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
      success: boolean;
    };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INVALID_JSON");
  });

  it("rejects requests with missing required fields", async () => {
    const app = createTestApp();
    mockAuthenticatedUser();

    const response = await app.request(
      new Request("http://localhost/api/analyze/phase2", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tweetId: "tweet-123" }),
      })
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
      success: boolean;
    };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns QUOTA_EXHAUSTED when quota is depleted", async () => {
    const app = createTestApp();
    mockAuthenticatedUser();
    quotaServiceMock.incrementQuota.mockResolvedValue({
      success: false,
      analysesUsed: 50,
      limit: 50,
      resetsAt: "2026-04-01T00:00:00.000Z",
    });

    const response = await app.request(
      new Request("http://localhost/api/analyze/phase2", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validRequestBody),
      })
    );
    const body = (await response.json()) as {
      error: {
        code: string;
        message: string;
        quota: { used: number; limit: number; resetsAt: string };
      };
      success: boolean;
    };

    expect(response.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("QUOTA_EXHAUSTED");
    expect(body.error.message).toContain("Monthly analysis quota exhausted");
    expect(body.error.quota).toEqual({
      used: 50,
      limit: 50,
      resetsAt: "2026-04-01T00:00:00.000Z",
    });
    expect(quotaServiceMock.incrementQuota).toHaveBeenCalledTimes(1);
    expect(quotaServiceMock.incrementQuota).toHaveBeenCalledWith(TEST_AUTH_ID);
  });

  it("returns cached analysis on cache hit", async () => {
    const app = createTestApp();
    mockAuthenticatedUser();
    quotaServiceMock.incrementQuota.mockResolvedValue({
      success: true,
      analysesUsed: 10,
      limit: 50,
      resetsAt: "2026-04-01T00:00:00.000Z",
    });
    phase2CacheMock.get.mockResolvedValue({
      analysis: {
        socraticChallenge: "Cached question",
        counterArgument: "Cached counter",
      },
    });

    const response = await app.request(
      new Request("http://localhost/api/analyze/phase2", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validRequestBody),
      })
    );
    const body = (await response.json()) as {
      success: boolean;
      analysis: { socraticChallenge: string; counterArgument: string };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.analysis.socraticChallenge).toBe("Cached question");
    expect(analyzerMock).toHaveBeenCalledTimes(0);
  });

  it("calls analyzer and caches result on cache miss", async () => {
    const app = createTestApp();
    mockAuthenticatedUser();
    quotaServiceMock.incrementQuota.mockResolvedValue({
      success: true,
      analysesUsed: 10,
      limit: 50,
      resetsAt: "2026-04-01T00:00:00.000Z",
    });
    phase2CacheMock.get.mockResolvedValue(null);
    analyzerMock.mockResolvedValue({
      socraticChallenge: "New question",
      counterArgument: "New counter",
    });

    const response = await app.request(
      new Request("http://localhost/api/analyze/phase2", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validRequestBody),
      })
    );
    const body = (await response.json()) as {
      success: boolean;
      analysis: { socraticChallenge: string; counterArgument: string };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.analysis.socraticChallenge).toBe("New question");
    expect(analyzerMock).toHaveBeenCalledTimes(1);
    expect(phase2CacheMock.set).toHaveBeenCalledTimes(1);
  });

  it("bypasses quota check when BYOK key is provided", async () => {
    const app = createTestApp();
    mockAuthenticatedUser();
    phase2CacheMock.get.mockResolvedValue(null);
    analyzerMock.mockResolvedValue({
      socraticChallenge: "BYOK question",
      counterArgument: "BYOK counter",
    });

    const response = await app.request(
      new Request("http://localhost/api/analyze/phase2", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validRequestBody,
          apiKey: "sk-test-key",
          provider: "openai",
        }),
      })
    );
    const body = (await response.json()) as {
      success: boolean;
      analysis: { socraticChallenge: string };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(quotaServiceMock.incrementQuota).toHaveBeenCalledTimes(0);
  });

  it("passes auth UUID directly to quota service (no raw Number coercion)", async () => {
    const app = createTestApp();
    mockAuthenticatedUser();
    quotaServiceMock.incrementQuota.mockResolvedValue({
      success: true,
      analysesUsed: 10,
      limit: 50,
      resetsAt: "2026-04-01T00:00:00.000Z",
    });
    phase2CacheMock.get.mockResolvedValue({
      analysis: { socraticChallenge: "Test" },
    });

    await app.request(
      new Request("http://localhost/api/analyze/phase2", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validRequestBody),
      })
    );

    const receivedAuthId = quotaServiceMock.incrementQuota.mock.calls[0]?.[0];
    expect(typeof receivedAuthId).toBe("string");
    expect(receivedAuthId).toBe(TEST_AUTH_ID);
    expect(Number.isNaN(Number(receivedAuthId))).toBe(true);
  });
});
