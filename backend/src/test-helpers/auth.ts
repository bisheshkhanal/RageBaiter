import { createHmac } from "node:crypto";

import { loadTestEnv } from "./env.js";

export const TEST_AUTH_ID = "00000000-0000-0000-0000-000000000001";

const readRequiredEnv = (key: string): string => {
  loadTestEnv();
  const value = process.env[key];
  if (!value || value.length === 0) {
    if (key === "SUPABASE_JWT_SECRET") {
      const fallbackSecret = "integration-test-supabase-jwt-secret";
      process.env.SUPABASE_JWT_SECRET = fallbackSecret;
      return fallbackSecret;
    }

    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const base64Url = (value: string): string => {
  return Buffer.from(value, "utf8").toString("base64url");
};

export const createSupabaseTestJwt = (authId: string = TEST_AUTH_ID): string => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      sub: authId,
      role: "authenticated",
      aud: "authenticated",
      iat: nowSeconds,
      exp: nowSeconds + 60 * 60,
    })
  );

  const signingInput = `${header}.${payload}`;
  const secret = readRequiredEnv("SUPABASE_JWT_SECRET");
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");

  return `${signingInput}.${signature}`;
};

export const createBearerAuthHeader = (
  authId: string = TEST_AUTH_ID
): { Authorization: string } => {
  return {
    Authorization: `Bearer ${createSupabaseTestJwt(authId)}`,
  };
};
