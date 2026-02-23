import type { Phase2Analysis } from "@ragebaiter/shared";

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

type Phase2CacheRow = {
  tweet_id: string;
  user_id: number | string;
  counter_argument: string;
  logic_failure: string;
  claim: string;
  mechanism: string;
  data_check: string;
  socratic_challenge: string;
  created_at: string;
  expires_at: string;
};

export type CachedPhase2 = {
  tweetId: string;
  userId: string;
  analysis: Phase2Analysis;
  createdAt: number;
  expiresAt: number;
};

export type Phase2CacheOptions = {
  ttlMs?: number;
  supabaseUrl?: string;
  serviceRoleKey?: string;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

const readEnv = (key: string): string | undefined => {
  return (globalThis as EnvShape).process?.env?.[key];
};

const toCachedPhase2 = (row: Phase2CacheRow): CachedPhase2 => {
  return {
    tweetId: row.tweet_id,
    userId: String(row.user_id),
    analysis: {
      counterArgument: row.counter_argument,
      logicFailure: row.logic_failure,
      claim: row.claim,
      mechanism: row.mechanism,
      dataCheck: row.data_check,
      socraticChallenge: row.socratic_challenge,
    },
    createdAt: Date.parse(row.created_at),
    expiresAt: Date.parse(row.expires_at),
  };
};

const toSupabasePayload = (
  tweetId: string,
  userId: string,
  analysis: Phase2Analysis,
  createdAt: number,
  expiresAt: number,
  provider: string
) => {
  return {
    tweet_id: tweetId,
    user_id: userId,
    counter_argument: analysis.counterArgument,
    logic_failure: analysis.logicFailure,
    claim: analysis.claim,
    mechanism: analysis.mechanism,
    data_check: analysis.dataCheck,
    socratic_challenge: analysis.socraticChallenge,
    provider,
    created_at: new Date(createdAt).toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
  };
};

export class Phase2CacheService {
  private readonly ttlMs: number;
  private readonly supabaseUrl: string | undefined;
  private readonly serviceRoleKey: string | undefined;

  public constructor(options: Phase2CacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.supabaseUrl = options.supabaseUrl ?? readEnv("SUPABASE_URL");
    this.serviceRoleKey = options.serviceRoleKey ?? readEnv("SUPABASE_SERVICE_ROLE_KEY");
  }

  public async get(tweetId: string, userId: string): Promise<CachedPhase2 | null> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      return null;
    }

    const url = new URL(`${this.supabaseUrl}/rest/v1/phase2_cache`);
    url.searchParams.set("tweet_id", `eq.${tweetId}`);
    url.searchParams.set("user_id", `eq.${userId}`);
    url.searchParams.set("expires_at", `gt.${new Date().toISOString()}`);
    url.searchParams.set(
      "select",
      "tweet_id,user_id,counter_argument,logic_failure,claim,mechanism,data_check,socratic_challenge,created_at,expires_at"
    );
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Phase2 cache lookup failed: ${response.status}`);
    }

    const rows = (await response.json()) as Phase2CacheRow[];
    const row = rows[0];

    if (!row) {
      return null;
    }

    return toCachedPhase2(row);
  }

  public async set(
    tweetId: string,
    userId: string,
    analysis: Phase2Analysis,
    provider = "internal"
  ): Promise<void> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      return;
    }

    const createdAt = Date.now();
    const expiresAt = createdAt + this.ttlMs;

    const response = await fetch(
      `${this.supabaseUrl}/rest/v1/phase2_cache?on_conflict=tweet_id,user_id`,
      {
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(
          toSupabasePayload(tweetId, userId, analysis, createdAt, expiresAt, provider)
        ),
      }
    );

    if (!response.ok) {
      throw new Error(`Phase2 cache write failed: ${response.status}`);
    }
  }

  public async clearForUser(userId: string): Promise<void> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      return;
    }

    const url = new URL(`${this.supabaseUrl}/rest/v1/phase2_cache`);
    url.searchParams.set("user_id", `eq.${userId}`);

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Phase2 cache clear failed: ${response.status}`);
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey ?? "",
      Authorization: `Bearer ${this.serviceRoleKey ?? ""}`,
    };
  }
}

export const createPhase2CacheService = (options: Phase2CacheOptions = {}): Phase2CacheService => {
  return new Phase2CacheService(options);
};

export const phase2CacheService = createPhase2CacheService();
