import type { MiddlewareHandler } from "hono";

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

type CachedCount = {
  count: number;
  expiresAt: number;
};

const CACHE_TTL_MS = 60_000;
const DAILY_LIMIT = 100;

const countCache = new Map<string, CachedCount>();

const readEnv = (key: string): string | undefined => {
  return (globalThis as EnvShape).process?.env?.[key];
};

const fetchDailyCount = async (authId: string): Promise<number> => {
  const supabaseUrl = readEnv("SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return 0;
  }

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const url = new URL(`${supabaseUrl}/rest/v1/analyzed_tweets`);
  url.searchParams.set("select", "id");
  url.searchParams.set("auth_id", `eq.${authId}`);
  url.searchParams.set("created_at", `gt.${twentyFourHoursAgo}`);
  url.searchParams.set("limit", "0");
  url.searchParams.set("Prefer", "count=exact");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    return 0;
  }

  const contentRange = response.headers.get("content-range");
  if (!contentRange) {
    return 0;
  }

  const match = contentRange.match(/\d+-\d+\/(\d+)/);
  if (!match?.[1]) {
    return 0;
  }

  return parseInt(match[1], 10);
};

export const dailyCapMiddleware: MiddlewareHandler = async (c, next) => {
  const authId = c.get("authId");

  if (typeof authId !== "string" || authId.length === 0) {
    await next();
    return;
  }

  const now = Date.now();
  const cached = countCache.get(authId);

  if (cached && now < cached.expiresAt) {
    if (cached.count >= DAILY_LIMIT) {
      return c.json(
        {
          error: {
            code: "DAILY_LIMIT_EXCEEDED",
            message: "Daily analysis limit of 100 reached. Try again tomorrow.",
          },
        },
        429
      );
    }
    await next();
    return;
  }

  const count = await fetchDailyCount(authId);

  countCache.set(authId, {
    count,
    expiresAt: now + CACHE_TTL_MS,
  });

  if (count >= DAILY_LIMIT) {
    return c.json(
      {
        error: {
          code: "DAILY_LIMIT_EXCEEDED",
          message: "Daily analysis limit of 100 reached. Try again tomorrow.",
        },
      },
      429
    );
  }

  await next();
};
