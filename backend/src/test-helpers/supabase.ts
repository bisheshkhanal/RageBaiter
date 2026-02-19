import { TEST_AUTH_ID } from "./auth.js";
import { loadTestEnv } from "./env.js";

type SupabaseHeaders = {
  apikey: string;
  Authorization: string;
  "Content-Type"?: string;
  Prefer?: string;
};

const readRequiredEnv = (key: string): string => {
  loadTestEnv();
  const value = process.env[key];
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const getSupabaseUrl = (): string => readRequiredEnv("SUPABASE_URL");
const getServiceRoleKey = (): string => readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const buildHeaders = (overrides: Partial<SupabaseHeaders> = {}): SupabaseHeaders => {
  const key = getServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...overrides,
  };
};

export const supabaseRestUrl = (table: string): string => `${getSupabaseUrl()}/rest/v1/${table}`;

export const supabaseRequest = async <T>(
  table: string,
  init: RequestInit,
  query?: Record<string, string>
): Promise<T> => {
  const url = new URL(supabaseRestUrl(table));
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Supabase ${table} request failed: ${response.status}`);
  }

  const responseText = await response.text();
  if (responseText.length === 0) {
    return null as T;
  }

  return JSON.parse(responseText) as T;
};

export const ensureTestUser = async (authId: string = TEST_AUTH_ID): Promise<number | null> => {
  const rows = await supabaseRequest<Array<{ id: number }>>(
    "users",
    {
      method: "POST",
      headers: buildHeaders({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify([
        {
          auth_id: authId,
          vector_social: 0,
          vector_economic: 0,
          vector_populist: 0,
        },
      ]),
    },
    { on_conflict: "auth_id" }
  );

  return rows[0]?.id ?? null;
};

export const cleanupTestData = async (
  authId: string = TEST_AUTH_ID,
  tweetPrefix: string = "test-"
): Promise<void> => {
  await supabaseRequest<unknown[]>(
    "users",
    {
      method: "DELETE",
      headers: buildHeaders({ Prefer: "return=minimal" }),
    },
    {
      auth_id: `eq.${authId}`,
    }
  );

  await supabaseRequest<unknown[]>(
    "analyzed_tweets",
    {
      method: "DELETE",
      headers: buildHeaders({ Prefer: "return=minimal" }),
    },
    {
      tweet_id: `like.${tweetPrefix}%`,
    }
  );
};

export const countRows = async (
  table: string,
  filters: Record<string, string>
): Promise<number> => {
  const rows = await supabaseRequest<unknown[]>(
    table,
    {
      method: "GET",
      headers: buildHeaders(),
    },
    {
      ...filters,
      select: "id",
    }
  );

  return rows.length;
};

export const getHeadersForSupabaseTests = (): SupabaseHeaders => buildHeaders();
