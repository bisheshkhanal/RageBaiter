import type { MiddlewareHandler } from "hono";

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

const getRateLimitKey = (headers: Headers): string => {
  const authHeader = headers.get("authorization");
  const apiKey = headers.get("x-api-key");
  const forwardedFor = headers.get("x-forwarded-for");

  return authHeader ?? apiKey ?? forwardedFor ?? "anonymous";
};

const getLimit = (): number => {
  const configured = readEnv("RATE_LIMIT_PER_MINUTE");
  const parsed = Number(configured);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return 60;
  }

  return Math.floor(parsed);
};

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const now = Date.now();
  const limit = getLimit();
  const key = getRateLimitKey(c.req.raw.headers);
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
