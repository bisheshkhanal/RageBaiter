import { Hono } from "hono";
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { authMiddleware } from "./auth.js";

const TEST_JWT_SECRET = "test-supabase-jwt-secret";
const TEST_API_KEY = "test-backend-internal-api-key";

type JwtPayload = {
  sub: string;
  exp: number;
};

const encodeBase64Url = (value: string): string => {
  return Buffer.from(value, "utf8").toString("base64url");
};

const buildHs256Token = (payload: JwtPayload, secret: string): string => {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadSegment = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payloadSegment}`)
    .digest("base64url");

  return `${header}.${payloadSegment}.${signature}`;
};

const buildTestApp = (): Hono<{ Variables: { authId: string } }> => {
  const app = new Hono<{ Variables: { authId: string } }>();
  app.use("/api/*", authMiddleware);
  app.get("/api/protected", (c) => {
    return c.json({ authId: c.get("authId") }, 200);
  });
  return app;
};

const previousJwtSecret = process.env.SUPABASE_JWT_SECRET;
const previousApiKey = process.env.BACKEND_INTERNAL_API_KEY;

afterEach(() => {
  process.env.SUPABASE_JWT_SECRET = previousJwtSecret;
  process.env.BACKEND_INTERNAL_API_KEY = previousApiKey;
});

describe("authMiddleware", () => {
  it("returns 200 and sets authId for valid bearer token", async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
    const app = buildTestApp();
    const authId = "11111111-1111-1111-1111-111111111111";
    const token = buildHs256Token(
      {
        sub: authId,
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      TEST_JWT_SECRET
    );

    const response = await app.request(
      new Request("http://localhost/api/protected", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    const body = (await response.json()) as { authId: string };

    expect(response.status).toBe(200);
    expect(body.authId).toBe(authId);
  });

  it("returns 401 for invalid bearer token signature", async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
    const app = buildTestApp();
    const token = buildHs256Token(
      {
        sub: "11111111-1111-1111-1111-111111111111",
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      "wrong-secret"
    );

    const response = await app.request(
      new Request("http://localhost/api/protected", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 401 for expired bearer token", async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
    const app = buildTestApp();
    const token = buildHs256Token(
      {
        sub: "11111111-1111-1111-1111-111111111111",
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      TEST_JWT_SECRET
    );

    const response = await app.request(
      new Request("http://localhost/api/protected", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 401 when authorization header is missing", async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
    const app = buildTestApp();

    const response = await app.request(new Request("http://localhost/api/protected"));

    expect(response.status).toBe(401);
  });

  it("returns 401 for malformed bearer token", async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
    const app = buildTestApp();

    const response = await app.request(
      new Request("http://localhost/api/protected", {
        method: "GET",
        headers: { Authorization: "Bearer malformed-token" },
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 200 and sets internal authId for valid api key", async () => {
    process.env.BACKEND_INTERNAL_API_KEY = TEST_API_KEY;
    const app = buildTestApp();

    const response = await app.request(
      new Request("http://localhost/api/protected", {
        method: "GET",
        headers: { "x-api-key": TEST_API_KEY },
      })
    );
    const body = (await response.json()) as { authId: string };

    expect(response.status).toBe(200);
    expect(body.authId).toBe("internal");
  });

  it("returns 401 for invalid api key", async () => {
    process.env.BACKEND_INTERNAL_API_KEY = TEST_API_KEY;
    const app = buildTestApp();

    const response = await app.request(
      new Request("http://localhost/api/protected", {
        method: "GET",
        headers: { "x-api-key": "wrong-key" },
      })
    );

    expect(response.status).toBe(401);
  });
});
