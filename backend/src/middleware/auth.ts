import type { MiddlewareHandler } from "hono";

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

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const headers = c.req.header();
  const authorization = headers.authorization ?? headers.Authorization;
  const apiKey =
    headers["x-api-key"] ??
    headers["X-API-Key"] ??
    headers["X-Api-Key"] ??
    c.req.raw.headers.get("x-api-key");
  const expectedApiKey = readEnv("BACKEND_INTERNAL_API_KEY");
  const hasConfiguredApiKey = typeof expectedApiKey === "string" && expectedApiKey.length > 0;

  const hasBearerToken = typeof authorization === "string" && authorization.startsWith("Bearer ");
  const hasValidApiKey =
    typeof apiKey === "string" &&
    apiKey.length > 0 &&
    (hasConfiguredApiKey ? apiKey === expectedApiKey : true);

  if (!hasBearerToken && !hasValidApiKey) {
    return c.json(unauthorizedResponse, 401);
  }

  await next();
};
