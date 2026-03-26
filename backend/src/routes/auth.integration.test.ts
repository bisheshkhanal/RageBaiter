import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authMiddleware } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";
import { authRoutes } from "./auth.js";

const TEST_API_KEY = "test-backend-internal-api-key";

const authServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("../services/supabase-auth.js", () => ({
  getSupabaseAuthService: () => authServiceMock,
}));

const PUBLIC_AUTH_PATHS = [
  "/api/auth/signup",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/callback",
];

const publicAuthGate = async (c: { req: { path: string } }, next: () => Promise<void>) => {
  if (PUBLIC_AUTH_PATHS.includes(c.req.path)) {
    await next();
    return;
  }

  return authMiddleware(c as never, next as never);
};

const createTestApp = (): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();

  app.use("/api/*", publicAuthGate);

  app.route("/api/auth", authRoutes);

  return app;
};

const testUser = {
  id: "user-123",
  email: "test@example.com",
};

const testSession = {
  access_token: "access-token-123",
  refresh_token: "refresh-token-123",
  expires_at: 1_700_000_000,
};

const resetAuthServiceMock = (): void => {
  authServiceMock.getSession.mockReset();
  authServiceMock.refreshSession.mockReset();
  authServiceMock.signInWithPassword.mockReset();
  authServiceMock.signOut.mockReset();
  authServiceMock.signUp.mockReset();
};

describe("/api/auth integration", () => {
  const previousApiKey = process.env.BACKEND_INTERNAL_API_KEY;

  beforeEach(() => {
    process.env.BACKEND_INTERNAL_API_KEY = TEST_API_KEY;
    resetAuthServiceMock();
  });

  afterEach(() => {
    process.env.BACKEND_INTERNAL_API_KEY = previousApiKey;
    resetAuthServiceMock();
  });

  it("returns the verification html for callback without authentication", async () => {
    const app = createTestApp();

    const response = await app.request(new Request("http://localhost/api/auth/callback"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("Email Verified!");
    expect(body).toContain("I've Verified My Email");
  });

  it("signs up users and returns the contract payload on success", async () => {
    const app = createTestApp();
    authServiceMock.signUp.mockResolvedValue({
      error: undefined,
      session: testSession,
      user: testUser,
    });

    const response = await app.request(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: " test@example.com ",
          password: "secret123",
        }),
      })
    );
    const body = (await response.json()) as {
      session: { accessToken: string; expiresAt: number; refreshToken: string } | null;
      success: boolean;
      user: { email: string; id: string } | null;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      user: testUser,
      session: {
        accessToken: testSession.access_token,
        refreshToken: testSession.refresh_token,
        expiresAt: testSession.expires_at,
      },
    });
  });

  it("rejects signup requests with missing fields", async () => {
    const app = createTestApp();

    const response = await app.request(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      })
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Email and password are required",
      },
    });
  });

  it("rejects signup requests with short passwords", async () => {
    const app = createTestApp();

    const response = await app.request(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "12345",
        }),
      })
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "INVALID_PASSWORD",
        message: "Password must be at least 6 characters",
      },
    });
  });

  it("returns signup failure payloads from Supabase errors", async () => {
    const app = createTestApp();
    authServiceMock.signUp.mockResolvedValue({
      error: { message: "Email already registered", status_code: 409 },
      session: null,
      user: null,
    });

    const response = await app.request(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "secret123",
        }),
      })
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: {
        code: "SIGNUP_FAILED",
        message: "Email already registered",
      },
    });
  });

  it("logs users in and returns the contract payload on success", async () => {
    const app = createTestApp();
    authServiceMock.signInWithPassword.mockResolvedValue({
      error: undefined,
      session: testSession,
      user: testUser,
    });

    const response = await app.request(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "secret123",
        }),
      })
    );
    const body = (await response.json()) as {
      session: { accessToken: string; expiresAt: number; refreshToken: string } | null;
      success: boolean;
      user: { email: string; id: string } | null;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      user: testUser,
      session: {
        accessToken: testSession.access_token,
        refreshToken: testSession.refresh_token,
        expiresAt: testSession.expires_at,
      },
    });
  });

  it("rejects login requests with missing fields", async () => {
    const app = createTestApp();

    const response = await app.request(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "secret123" }),
      })
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Email and password are required",
      },
    });
  });

  it("returns login failure payloads from Supabase errors", async () => {
    const app = createTestApp();
    authServiceMock.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials", status_code: 401 },
      session: null,
      user: null,
    });

    const response = await app.request(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "secret123",
        }),
      })
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: "LOGIN_FAILED",
        message: "Invalid login credentials",
      },
    });
  });

  it("rejects refresh requests with missing refresh tokens", async () => {
    const app = createTestApp();

    const response = await app.request(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Refresh token is required",
      },
    });
  });

  it("returns refresh failure payloads for invalid refresh tokens", async () => {
    const app = createTestApp();
    authServiceMock.refreshSession.mockResolvedValue({
      error: { message: "Invalid refresh token", status_code: 401 },
      session: null,
      user: null,
    });

    const response = await app.request(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "invalid-refresh-token" }),
      })
    );
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: "REFRESH_FAILED",
        message: "Invalid refresh token",
      },
    });
  });

  it("keeps /api/auth/me protected without authentication", async () => {
    const app = createTestApp();

    const response = await app.request(new Request("http://localhost/api/auth/me"));
    const body = (await response.json()) as { error?: { code?: string; message?: string } };

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid authentication credentials",
      },
    });
  });

  it("returns the authenticated user contract for /api/auth/me", async () => {
    const app = createTestApp();
    authServiceMock.getSession.mockResolvedValue({
      error: undefined,
      session: null,
      user: testUser,
    });

    const response = await app.request(
      new Request("http://localhost/api/auth/me", {
        headers: {
          Authorization: `Bearer access-token-123`,
          "x-api-key": TEST_API_KEY,
        },
      })
    );
    const body = (await response.json()) as {
      success: boolean;
      user: { email: string; id: string };
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      user: testUser,
    });
  });

  it("keeps /api/auth/logout protected without authentication", async () => {
    const app = createTestApp();

    const response = await app.request(new Request("http://localhost/api/auth/logout"));
    const body = (await response.json()) as { error?: { code?: string; message?: string } };

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid authentication credentials",
      },
    });
  });

  it("logs out authenticated users and returns the contract payload", async () => {
    const app = createTestApp();
    authServiceMock.signOut.mockResolvedValue({});

    const response = await app.request(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          Authorization: "Bearer access-token-123",
          "x-api-key": TEST_API_KEY,
        },
      })
    );
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
  });
});

describe("signup journey (signup -> verify_email -> callback -> login -> /me)", () => {
  const previousApiKey = process.env.BACKEND_INTERNAL_API_KEY;

  beforeEach(() => {
    process.env.BACKEND_INTERNAL_API_KEY = TEST_API_KEY;
    resetAuthServiceMock();
  });

  afterEach(() => {
    process.env.BACKEND_INTERNAL_API_KEY = previousApiKey;
    resetAuthServiceMock();
  });

  it("proves the intended near-term signup journey: signup with no session, callback reachable, then manual login enables /me", async () => {
    const app = createTestApp();

    // STEP 1: Signup returns success but no session (user must verify email)
    authServiceMock.signUp.mockResolvedValue({
      error: undefined,
      session: null, // No session - email verification required
      user: { id: "new-user-123", email: "newuser@example.com" },
    });

    const signupResponse = await app.request(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "newuser@example.com",
          password: "secret123",
        }),
      })
    );
    const signupBody = (await signupResponse.json()) as {
      success: boolean;
      session: { accessToken: string } | null;
      user: { id: string; email: string } | null;
    };

    expect(signupResponse.status).toBe(200);
    expect(signupBody.success).toBe(true);
    expect(signupBody.session).toBeNull(); // Critical: no session means no false authenticated state
    expect(signupBody.user?.email).toBe("newuser@example.com");

    // STEP 2: Callback page is reachable and instructs manual return/login
    const callbackResponse = await app.request(new Request("http://localhost/api/auth/callback"));
    const callbackBody = await callbackResponse.text();

    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.headers.get("content-type")).toContain("text/html");
    expect(callbackBody).toContain("Email Verified!");
    expect(callbackBody).toContain("I've Verified My Email"); // Instructs manual return to extension

    // STEP 3: After email verification, user manually logs in and receives session
    authServiceMock.signInWithPassword.mockResolvedValue({
      error: undefined,
      session: testSession,
      user: testUser,
    });

    const loginResponse = await app.request(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "newuser@example.com",
          password: "secret123",
        }),
      })
    );
    const loginBody = (await loginResponse.json()) as {
      success: boolean;
      session: { accessToken: string; refreshToken: string };
      user: { id: string; email: string };
    };

    expect(loginResponse.status).toBe(200);
    expect(loginBody.success).toBe(true);
    expect(loginBody.session.accessToken).toBe("access-token-123");
    expect(loginBody.session.refreshToken).toBe("refresh-token-123");

    // STEP 4: With the login token, user can access protected /me endpoint
    authServiceMock.getSession.mockResolvedValue({
      error: undefined,
      session: null,
      user: testUser,
    });

    const meResponse = await app.request(
      new Request("http://localhost/api/auth/me", {
        headers: {
          Authorization: `Bearer ${loginBody.session.accessToken}`,
          "x-api-key": TEST_API_KEY,
        },
      })
    );
    const meBody = (await meResponse.json()) as {
      success: boolean;
      user: { id: string; email: string };
    };

    expect(meResponse.status).toBe(200);
    expect(meBody.success).toBe(true);
    expect(meBody.user).toEqual(testUser);
  });
});
