import type { MiddlewareHandler } from "hono";
import type { Context } from "hono";

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const requestCounts = new Map<string, RateLimitRecord>();

const readEnv = (key: string): string | undefined => {
  return (globalThis as EnvShape).process?.env?.[key];
};

const getRateLimitKey = (c: Context): string => {
  // Key by auth_id from context when available (set by auth middleware)
  const authId = c.get("authId");
  if (authId) {
    return `auth:${authId}`;
  }

  // Fall back to IP-based limiting
  const forwardedFor = c.req.raw.headers.get("x-forwarded-for");
  const apiKey = c.req.raw.headers.get("x-api-key");

  return `ip:${forwardedFor ?? apiKey ?? "anonymous"}`;
};

const getLimit = (): number => {
  const configured = readEnv("RATE_LIMIT_PER_MINUTE");
  const parsed = Number(configured);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return 60;
  }

  return Math.floor(parsed);
};

const isLocalhostRequest = (headers: Headers): boolean => {
  const origin = (headers.get("origin") ?? "").toLowerCase();
  const host = (headers.get("host") ?? "").toLowerCase();

  return (
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    host.includes("localhost") ||
    host.includes("127.0.0.1")
  );
};

const isDevelopment = (): boolean => {
  return readEnv("NODE_ENV") !== "production";
};

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  // Localhost bypass only in development
  if (isDevelopment() && c.req.path === "/api/analyze" && isLocalhostRequest(c.req.raw.headers)) {
    await next();
    return;
  }

  const now = Date.now();
  const limit = getLimit();
  const key = getRateLimitKey(c);
  const existing = requestCounts.get(key);

  if (!existing || now >= existing.resetAt) {
    requestCounts.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });

    await next();
    return;
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    c.header("Retry-After", String(retryAfterSeconds));

    return c.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Rate limit exceeded for this user",
          retryAfterSeconds,
        },
      },
      429
    );
  }

  existing.count += 1;
  requestCounts.set(key, existing);

  await next();
};
