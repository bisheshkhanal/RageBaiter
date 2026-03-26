import { describe, expect, it, vi, beforeEach } from "vitest";

import { QuotaService, createQuotaService } from "./quota-service.js";
import type { UserIdentityServiceInterface } from "./user-identity-service.js";

const AUTH_UUID = "22222222-2222-2222-2222-222222222222";
const INTERNAL_USER_ID = 99;

const createMockUserIdentity = (): UserIdentityServiceInterface => ({
  resolveUserId: vi.fn(async (authId: string) => {
    if (authId === AUTH_UUID) {
      return INTERNAL_USER_ID;
    }
    throw new Error(`User not found for auth id: ${authId}`);
  }),
  tryResolveUserId: vi.fn(async (authId: string) => {
    if (authId === AUTH_UUID) {
      return INTERNAL_USER_ID;
    }
    return null;
  }),
});

const createMockFetch = () => {
  const calls: Array<{ url: string; body: unknown }> = [];

  const mockFetch = vi.fn(async (url: string, options: RequestInit) => {
    calls.push({
      url,
      body: options.body ? JSON.parse(options.body as string) : null,
    });

    if (url.includes("/rpc/get_or_create_quota")) {
      return new Response(
        JSON.stringify({
          analyses_used: 10,
          limit: 50,
          resets_at: "2025-04-01T00:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.includes("/rpc/increment_quota")) {
      return new Response(
        JSON.stringify({
          success: true,
          analyses_used: 11,
          limit: 50,
          resets_at: "2025-04-01T00:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not Found", { status: 404 });
  });

  return { mockFetch, calls };
};

describe("QuotaService identity translation", () => {
  let userIdentity: UserIdentityServiceInterface;
  let mockFetch: ReturnType<typeof createMockFetch>["mockFetch"];
  let calls: ReturnType<typeof createMockFetch>["calls"];
  let quotaService: QuotaService;

  beforeEach(() => {
    userIdentity = createMockUserIdentity();
    const fetchResult = createMockFetch();
    mockFetch = fetchResult.mockFetch;
    calls = fetchResult.calls;

    quotaService = new QuotaService(
      "https://test.supabase.co",
      "test-service-role-key",
      mockFetch as unknown as typeof fetch,
      userIdentity
    );
  });

  describe("getQuotaStatus", () => {
    it("resolves auth UUID to internal user id before RPC call", async () => {
      const status = await quotaService.getQuotaStatus(AUTH_UUID);

      expect(status.used).toBe(10);
      expect(status.limit).toBe(50);
      expect(userIdentity.resolveUserId).toHaveBeenCalledWith(AUTH_UUID);

      const rpcCall = calls.find((c) => c.url.includes("/rpc/get_or_create_quota"));
      expect(rpcCall).toBeDefined();
      expect(rpcCall?.body).toEqual({ p_user_id: INTERNAL_USER_ID });
    });

    it("propagates error when user not found", async () => {
      await expect(quotaService.getQuotaStatus("unknown-uuid")).rejects.toThrow(
        "User not found for auth id: unknown-uuid"
      );
    });
  });

  describe("incrementQuota", () => {
    it("resolves auth UUID to internal user id before RPC call", async () => {
      const result = await quotaService.incrementQuota(AUTH_UUID);

      expect(result.success).toBe(true);
      expect(result.analysesUsed).toBe(11);
      expect(userIdentity.resolveUserId).toHaveBeenCalledWith(AUTH_UUID);

      const rpcCall = calls.find((c) => c.url.includes("/rpc/increment_quota"));
      expect(rpcCall).toBeDefined();
      expect(rpcCall?.body).toEqual({ p_user_id: INTERNAL_USER_ID });
    });

    it("propagates error when user not found", async () => {
      await expect(quotaService.incrementQuota("unknown-uuid")).rejects.toThrow(
        "User not found for auth id: unknown-uuid"
      );
    });
  });

  describe("hasQuotaRemaining", () => {
    it("resolves auth UUID through getQuotaStatus", async () => {
      const hasRemaining = await quotaService.hasQuotaRemaining(AUTH_UUID);

      expect(hasRemaining).toBe(true);
      expect(userIdentity.resolveUserId).toHaveBeenCalledWith(AUTH_UUID);
    });
  });
});

describe("createQuotaService", () => {
  it("uses provided userIdentity service", async () => {
    const userIdentity = createMockUserIdentity();
    const { mockFetch, calls } = createMockFetch();

    const service = createQuotaService({
      supabaseUrl: "https://test.supabase.co",
      serviceRoleKey: "test-key",
      fetchImpl: mockFetch as unknown as typeof fetch,
      userIdentity,
    });

    await service.getQuotaStatus(AUTH_UUID);

    expect(userIdentity.resolveUserId).toHaveBeenCalledWith(AUTH_UUID);

    const rpcCall = calls.find((c) => c.url.includes("/rpc/get_or_create_quota"));
    expect(rpcCall?.body).toEqual({ p_user_id: INTERNAL_USER_ID });
  });
});
