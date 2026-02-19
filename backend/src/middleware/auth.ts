import type { MiddlewareHandler } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";

import type { AppEnv } from "../types.js";

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

const readEnv = (key: string): string | undefined => {
  return (globalThis as EnvShape).process?.env?.[key];
};

const unauthorizedResponse = {
  error: {
    code: "UNAUTHORIZED",
    message: "Missing or invalid authentication credentials",
  },
};

type JwtHeader = {
  alg?: unknown;
  typ?: unknown;
};

type JwtPayload = {
  sub?: unknown;
  exp?: unknown;
};

const decodeBase64UrlToJson = <T>(segment: string): T | null => {
  try {
    const decoded = Buffer.from(segment, "base64url").toString("utf8");
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
};

const verifySupabaseJwt = (token: string, secret: string): string | null => {
  const tokenParts = token.split(".");
  if (tokenParts.length !== 3) {
    return null;
  }

  const [headerSegment, payloadSegment, signatureSegment] = tokenParts;
  if (!headerSegment || !payloadSegment || !signatureSegment) {
    return null;
  }

  const header = decodeBase64UrlToJson<JwtHeader>(headerSegment);
  const payload = decodeBase64UrlToJson<JwtPayload>(payloadSegment);
  if (!header || !payload) {
    return null;
  }

  if (header.alg !== "HS256") {
    return null;
  }

  const signingInput = `${headerSegment}.${payloadSegment}`;
  const expectedSignature = createHmac("sha256", secret).update(signingInput).digest();

  let receivedSignature: Buffer;
  try {
    receivedSignature = Buffer.from(signatureSegment, "base64url");
  } catch {
    return null;
  }

  if (receivedSignature.length !== expectedSignature.length) {
    return null;
  }

  if (!timingSafeEqual(receivedSignature, expectedSignature)) {
    return null;
  }

  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) {
    return null;
  }

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    return null;
  }

  return payload.sub;
};

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authorization = c.req.header("authorization") ?? c.req.header("Authorization");
  const apiKey = c.req.header("x-api-key") ?? c.req.header("X-API-Key");

  const expectedApiKey = readEnv("BACKEND_INTERNAL_API_KEY");
  const hasConfiguredApiKey = typeof expectedApiKey === "string" && expectedApiKey.length > 0;
  const hasValidApiKey =
    hasConfiguredApiKey &&
    typeof apiKey === "string" &&
    apiKey.length > 0 &&
    apiKey === expectedApiKey;

  if (hasValidApiKey) {
    c.set("authId", "internal");
    await next();
    return;
  }

  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return c.json(unauthorizedResponse, 401);
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (accessToken.length === 0) {
    return c.json(unauthorizedResponse, 401);
  }

  const jwtSecret = readEnv("SUPABASE_JWT_SECRET");
  if (typeof jwtSecret !== "string" || jwtSecret.length === 0) {
    return c.json(unauthorizedResponse, 401);
  }

  const authId = verifySupabaseJwt(accessToken, jwtSecret);
  if (!authId) {
    return c.json(unauthorizedResponse, 401);
  }

  c.set("authId", authId);

  await next();
};
