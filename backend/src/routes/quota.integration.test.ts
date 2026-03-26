import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authMiddleware } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";
import { createBearerAuthHeader, TEST_AUTH_ID } from "../test-helpers/auth.js";
import { loadTestEnv } from "../test-helpers/env.js";
import { createQuotaRoutes } from "./quota.js";

loadTestEnv();

const authServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

const quotaServiceMock = vi.hoisted(() => ({
  getQuotaStatus: vi.fn(),
}));

vi.mock("../services/supabase-auth.js", () => ({
  getSupabaseAuthService: () => authServiceMock,
}));

vi.mock("../services/quota-service.js", () => ({
  quotaService: quotaServiceMock,
}));

const createTestApp = (): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();
  app.use("/api/*", authMiddleware);
  app.route("/api/quota", createQuotaRoutes());
  return app;
};

describe("/api/quota integration", () => {
  beforeEach(() => {
    authServiceMock.getSession.mockReset();
    quotaServiceMock.getQuotaStatus.mockReset();
  });

  it("rejects unauthenticated requests with 401 UNAUTHORIZED", async () => {
    const app = createTestApp();

    const response = await app.request(new Request("http://localhost/api/quota"));
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid authentication credentials",
      },
    });
  });

  it("returns quota status contract for authenticated users", async () => {
    const app = createTestApp();
    authServiceMock.getSession.mockResolvedValue({
      error: undefined,
      user: { id: TEST_AUTH_ID, email: "test@example.com" },
    });
    quotaServiceMock.getQuotaStatus.mockResolvedValue({
      used: 15,
      limit: 50,
      remaining: 35,
      resetsAt: "2026-04-01T00:00:00.000Z",
      hasOwnKey: false,
    });

    const response = await app.request(
      new Request("http://localhost/api/quota", {
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
        },
      })
    );
    const body = (await response.json()) as {
      used: number;
      limit: number;
      remaining: number;
      resetsAt: string;
      hasOwnKey: boolean;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      used: 15,
      limit: 50,
      remaining: 35,
      resetsAt: "2026-04-01T00:00:00.000Z",
      hasOwnKey: false,
    });
    expect(quotaServiceMock.getQuotaStatus).toHaveBeenCalledTimes(1);
    expect(quotaServiceMock.getQuotaStatus).toHaveBeenCalledWith(TEST_AUTH_ID);
  });

  it("returns quota status with zero remaining when exhausted", async () => {
    const app = createTestApp();
    authServiceMock.getSession.mockResolvedValue({
      error: undefined,
      user: { id: TEST_AUTH_ID, email: "test@example.com" },
    });
    quotaServiceMock.getQuotaStatus.mockResolvedValue({
      used: 50,
      limit: 50,
      remaining: 0,
      resetsAt: "2026-04-01T00:00:00.000Z",
      hasOwnKey: false,
    });

    const response = await app.request(
      new Request("http://localhost/api/quota", {
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
        },
      })
    );
    const body = (await response.json()) as {
      used: number;
      limit: number;
      remaining: number;
      resetsAt: string;
      hasOwnKey: boolean;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      used: 50,
      limit: 50,
      remaining: 0,
      resetsAt: "2026-04-01T00:00:00.000Z",
      hasOwnKey: false,
    });
  });

  it("passes auth UUID directly to quota service (no raw Number coercion)", async () => {
    const app = createTestApp();
    authServiceMock.getSession.mockResolvedValue({
      error: undefined,
      user: { id: TEST_AUTH_ID, email: "test@example.com" },
    });
    quotaServiceMock.getQuotaStatus.mockResolvedValue({
      used: 1,
      limit: 50,
      remaining: 49,
      resetsAt: "2026-04-01T00:00:00.000Z",
      hasOwnKey: false,
    });

    await app.request(
      new Request("http://localhost/api/quota", {
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
        },
      })
    );

    const receivedAuthId = quotaServiceMock.getQuotaStatus.mock.calls[0]?.[0];
    expect(typeof receivedAuthId).toBe("string");
    expect(receivedAuthId).toBe(TEST_AUTH_ID);
    expect(Number.isNaN(Number(receivedAuthId))).toBe(true);
  });
});

describe("authenticated quota journey (login -> /quota access)", () => {
  const TEST_API_KEY = "test-backend-internal-api-key";

  beforeEach(() => {
    authServiceMock.getSession.mockReset();
    quotaServiceMock.getQuotaStatus.mockReset();
  });

  it("proves login tokens enable quota-backed feature access after authentication", async () => {
    const app = createTestApp();
    const loginAccessToken = "login-access-token-xyz";

    authServiceMock.getSession.mockResolvedValue({
      error: undefined,
      user: { id: TEST_AUTH_ID, email: "test@example.com" },
    });
    quotaServiceMock.getQuotaStatus.mockResolvedValue({
      used: 5,
      limit: 50,
      remaining: 45,
      resetsAt: "2026-04-01T00:00:00.000Z",
      hasOwnKey: false,
    });

    const response = await app.request(
      new Request("http://localhost/api/quota", {
        headers: {
          Authorization: `Bearer ${loginAccessToken}`,
          "x-api-key": TEST_API_KEY,
        },
      })
    );
    const body = (await response.json()) as {
      used: number;
      limit: number;
      remaining: number;
      resetsAt: string;
      hasOwnKey: boolean;
    };

    expect(response.status).toBe(200);
    expect(body.used).toBe(5);
    expect(body.limit).toBe(50);
    expect(body.remaining).toBe(45);
    expect(quotaServiceMock.getQuotaStatus).toHaveBeenCalledWith(TEST_AUTH_ID);
  });
});
