import type { Phase1Analysis } from "@ragebaiter/shared";

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

export type CachedPhase1 = {
  tweetId: string;
  tweetText: string;
  analysis: Phase1Analysis;
  analyzedAt: number;
  expiresAt: number;
};

export type Phase1CacheOptions = {
  maxEntries?: number;
  ttlMs?: number;
  supabaseUrl?: string;
  serviceRoleKey?: string;
};

type SupabasePhase1Row = {
  tweet_id: string;
  tweet_text: string;
  vector_social: number;
  vector_economic: number;
  vector_populist: number;
  fallacies: unknown;
  topic: string | null;
  confidence: number;
  created_at: string;
  expires_at: string;
};

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

const readEnv = (key: string): string | undefined => {
  return (globalThis as EnvShape).process?.env?.[key];
};

const toCachedPhase1 = (row: SupabasePhase1Row): CachedPhase1 => {
  const parsedFallacies = Array.isArray(row.fallacies)
    ? row.fallacies.filter((value): value is string => typeof value === "string")
    : [];

  return {
    tweetId: row.tweet_id,
    tweetText: row.tweet_text,
    analysis: {
      tweetVector: {
        social: row.vector_social,
        economic: row.vector_economic,
        populist: row.vector_populist,
      },
      fallacies: parsedFallacies,
      topic: row.topic ?? "",
      confidence: row.confidence,
    },
    analyzedAt: Date.parse(row.created_at),
    expiresAt: Date.parse(row.expires_at),
  };
};

const toSupabasePayload = (cached: CachedPhase1) => {
  return {
    tweet_id: cached.tweetId,
    tweet_text: cached.tweetText,
    vector_social: cached.analysis.tweetVector.social,
    vector_economic: cached.analysis.tweetVector.economic,
    vector_populist: cached.analysis.tweetVector.populist,
    fallacies: [...cached.analysis.fallacies],
    topic: cached.analysis.topic,
    confidence: cached.analysis.confidence,
    expires_at: new Date(cached.expiresAt).toISOString(),
  };
};

export class Phase1CacheService {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly memoryCache = new Map<string, CachedPhase1>();
  private readonly supabaseUrl: string | undefined;
  private readonly serviceRoleKey: string | undefined;

  public constructor(
    options: Phase1CacheOptions = {},
    private readonly fetcher: typeof fetch = fetch
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.supabaseUrl = options.supabaseUrl ?? readEnv("SUPABASE_URL");
    this.serviceRoleKey = options.serviceRoleKey ?? readEnv("SUPABASE_SERVICE_ROLE_KEY");
  }

  public async get(tweetId: string): Promise<CachedPhase1 | null> {
    const memoryHit = this.getFromMemory(tweetId);
    if (memoryHit) {
      return memoryHit;
    }

    const persisted = await this.getFromSupabase(tweetId);
    if (!persisted) {
      return null;
    }

    this.setInMemory(tweetId, persisted);
    return persisted;
  }

  public async set(tweetId: string, tweetText: string, analysis: Phase1Analysis): Promise<void> {
    const now = Date.now();
    const cached: CachedPhase1 = {
      tweetId,
      tweetText,
      analysis,
      analyzedAt: now,
      expiresAt: now + this.ttlMs,
    };

    this.setInMemory(tweetId, cached);

    try {
      await this.upsertToSupabase(cached);
    } catch {
      return;
    }
  }

  public clear(): void {
    this.memoryCache.clear();
  }

  private getFromMemory(tweetId: string): CachedPhase1 | null {
    const current = this.memoryCache.get(tweetId);
    if (!current) {
      return null;
    }

    if (current.expiresAt <= Date.now()) {
      this.memoryCache.delete(tweetId);
      return null;
    }

    this.memoryCache.delete(tweetId);
    this.memoryCache.set(tweetId, current);
    return current;
  }

  private setInMemory(tweetId: string, cached: CachedPhase1): void {
    if (this.memoryCache.has(tweetId)) {
      this.memoryCache.delete(tweetId);
    }

    this.memoryCache.set(tweetId, cached);

    if (this.memoryCache.size <= this.maxEntries) {
      return;
    }

    const firstKey = this.memoryCache.keys().next().value;
    if (firstKey !== undefined) {
      this.memoryCache.delete(firstKey);
    }
  }

  private async getFromSupabase(tweetId: string): Promise<CachedPhase1 | null> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const url = new URL(`${this.supabaseUrl}/rest/v1/phase1_cache`);
    url.searchParams.set("tweet_id", `eq.${tweetId}`);
    url.searchParams.set("expires_at", `gt.${nowIso}`);
    url.searchParams.set(
      "select",
      "tweet_id,tweet_text,vector_social,vector_economic,vector_populist,fallacies,topic,confidence,created_at,expires_at"
    );
    url.searchParams.set("limit", "1");

    try {
      const response = await this.fetcher(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        return null;
      }

      const rows = (await response.json()) as SupabasePhase1Row[];
      const row = rows[0];

      if (!row) {
        return null;
      }

      const cached = toCachedPhase1(row);
      if (cached.expiresAt <= Date.now()) {
        return null;
      }

      return cached;
    } catch {
      return null;
    }
  }

  private async upsertToSupabase(cached: CachedPhase1): Promise<void> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      return;
    }

    const response = await this.fetcher(
      `${this.supabaseUrl}/rest/v1/phase1_cache?on_conflict=tweet_id`,
      {
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(toSupabasePayload(cached)),
      }
    );

    if (!response.ok) {
      throw new Error(`Phase1 cache write failed: ${response.status}`);
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey ?? "",
      Authorization: `Bearer ${this.serviceRoleKey ?? ""}`,
    };
  }
}

export const createPhase1CacheService = (options: Phase1CacheOptions = {}): Phase1CacheService => {
  return new Phase1CacheService(options);
};

export const phase1CacheService = createPhase1CacheService();
