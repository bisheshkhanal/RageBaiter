import { loadTestEnv } from "./env.js";

loadTestEnv();

if (!process.env.SUPABASE_JWT_SECRET) {
  process.env.SUPABASE_JWT_SECRET = "integration-test-supabase-jwt-secret";
}
