import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const demoAuthToken =
  (import.meta.env.VITE_SUPABASE_DEMO_AUTH_TOKEN as string | undefined) ?? "";

if (!url || !key) {
  console.warn("Supabase env vars missing — falling back to local data");
}

export const supabase =
  url && key
    ? createClient(url, key, {
        global: demoAuthToken
          ? {
              headers: {
                Authorization: `Bearer ${demoAuthToken.trim().replace(/^Bearer\s+/i, "")}`,
              },
            }
          : undefined,
      })
    : null;
