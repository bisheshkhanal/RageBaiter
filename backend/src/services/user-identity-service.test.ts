import { describe, expect, it, vi } from "vitest";

import {
  SupabaseUserIdentityRepository,
  UserIdentityService,
  type UserIdentityRepository,
  createUserIdentityService,
} from "./user-identity-service.js";

const AUTH_UUID = "11111111-1111-1111-1111-111111111111";
const INTERNAL_USER_ID = 42;

describe("UserIdentityService", () => {
  describe("resolveUserId", () => {
    it("resolves auth UUID to internal numeric user id", async () => {
      const repository: UserIdentityRepository = {
        getInternalUserId: vi.fn(async (authId: string) => {
          expect(authId).toBe(AUTH_UUID);
          return INTERNAL_USER_ID;
        }),
      };

      const service = new UserIdentityService(repository);
      const result = await service.resolveUserId(AUTH_UUID);

      expect(result).toBe(INTERNAL_USER_ID);
    });

    it("throws when user is not found", async () => {
      const repository: UserIdentityRepository = {
        getInternalUserId: vi.fn(async () => null),
      };

      const service = new UserIdentityService(repository);

      await expect(service.resolveUserId(AUTH_UUID)).rejects.toThrow(
        `User not found for auth id: ${AUTH_UUID}`
      );
    });
  });

  describe("tryResolveUserId", () => {
    it("returns internal user id when user exists", async () => {
      const repository: UserIdentityRepository = {
        getInternalUserId: vi.fn(async () => INTERNAL_USER_ID),
      };

      const service = new UserIdentityService(repository);
      const result = await service.tryResolveUserId(AUTH_UUID);

      expect(result).toBe(INTERNAL_USER_ID);
    });

    it("returns null when user is not found", async () => {
      const repository: UserIdentityRepository = {
        getInternalUserId: vi.fn(async () => null),
      };

      const service = new UserIdentityService(repository);
      const result = await service.tryResolveUserId(AUTH_UUID);

      expect(result).toBeNull();
    });
  });
});

describe("SupabaseUserIdentityRepository", () => {
  it("queries users table with auth_id filter", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify([{ id: INTERNAL_USER_ID }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const repository = new SupabaseUserIdentityRepository(
      "https://test.supabase.co",
      "test-service-role-key",
      fetchMock as unknown as typeof fetch
    );

    const result = await repository.getInternalUserId(AUTH_UUID);

    expect(result).toBe(INTERNAL_USER_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toBeDefined();

    const [urlInput, options] = fetchMock.mock.calls[0] as unknown as [URL | Request, RequestInit];
    const urlString = urlInput instanceof URL ? urlInput.toString() : String(urlInput);
    expect(urlString).toContain("/rest/v1/users");
    expect(urlString).toContain(`auth_id=eq.${AUTH_UUID}`);
    expect(urlString).toContain("select=id");
    expect(options.method).toBe("GET");
    expect(options.headers).toMatchObject({
      apikey: "test-service-role-key",
      Authorization: "Bearer test-service-role-key",
    });
  });

  it("returns null when no user matches", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const repository = new SupabaseUserIdentityRepository(
      "https://test.supabase.co",
      "test-service-role-key",
      fetchMock as unknown as typeof fetch
    );

    const result = await repository.getInternalUserId(AUTH_UUID);

    expect(result).toBeNull();
  });

  it("throws on fetch failure", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("Internal Server Error", { status: 500 });
    });

    const repository = new SupabaseUserIdentityRepository(
      "https://test.supabase.co",
      "test-service-role-key",
      fetchMock as unknown as typeof fetch
    );

    await expect(repository.getInternalUserId(AUTH_UUID)).rejects.toThrow(
      "Supabase user identity lookup failed: 500"
    );
  });
});

describe("createUserIdentityService", () => {
  it("creates service with custom repository", async () => {
    const customRepository: UserIdentityRepository = {
      getInternalUserId: vi.fn(async () => INTERNAL_USER_ID),
    };

    const service = createUserIdentityService({ repository: customRepository });
    const result = await service.resolveUserId(AUTH_UUID);

    expect(result).toBe(INTERNAL_USER_ID);
  });

  it("creates SupabaseUserIdentityRepository when no repository provided", () => {
    const service = createUserIdentityService({
      supabaseUrl: "https://test.supabase.co",
      serviceRoleKey: "test-key",
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    expect(service).toBeInstanceOf(UserIdentityService);
  });
});
