import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../types.js";
import { getSupabaseAuthService } from "../services/supabase-auth.js";

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

  try {
    const authService = getSupabaseAuthService();
    const result = await authService.getSession(accessToken);

    if (result.error || !result.user) {
      return c.json(unauthorizedResponse, 401);
    }

    c.set("authId", result.user.id);
    await next();
  } catch (error) {
    console.error("[AuthMiddleware] Verification failed:", error);
    return c.json(unauthorizedResponse, 401);
  }
};
