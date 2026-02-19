import type { AnalyzeCacheRepository, StoredAnalyzedTweet } from "./tweet-analysis-cache.js";

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

type SupabaseRow = {
  tweet_id: string;
  tweet_text: string;
  vector_social: number;
  vector_economic: number;
  vector_populist: number;
  fallacies: unknown;
  topic: string;
  analyzed_at: string;
  expires_at: string;
};

const readEnv = (key: string): string | undefined => {
  return (globalThis as EnvShape).process?.env?.[key];
};

const toStoredAnalyzedTweet = (row: SupabaseRow): StoredAnalyzedTweet => {
  const parsedFallacies = Array.isArray(row.fallacies)
    ? row.fallacies.filter((value): value is string => typeof value === "string")
    : [];

  return {
    tweetId: row.tweet_id,
    tweetText: row.tweet_text,
    vectorSocial: row.vector_social,
    vectorEconomic: row.vector_economic,
    vectorPopulist: row.vector_populist,
    fallacies: parsedFallacies,
    topic: row.topic,
    analyzedAt: Date.parse(row.analyzed_at),
    expiresAt: Date.parse(row.expires_at),
  };
};

const toSupabasePayload = (record: StoredAnalyzedTweet) => {
  return {
    tweet_id: record.tweetId,
    tweet_text: record.tweetText,
    vector_social: record.vectorSocial,
    vector_economic: record.vectorEconomic,
    vector_populist: record.vectorPopulist,
    fallacies: record.fallacies,
    topic: record.topic,
    analyzed_at: new Date(record.analyzedAt).toISOString(),
    expires_at: new Date(record.expiresAt).toISOString(),
  };
};

export class SupabaseCacheRepository implements AnalyzeCacheRepository {
  public constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  public static fromEnv(fetcher?: typeof fetch): SupabaseCacheRepository | null {
    const supabaseUrl = readEnv("SUPABASE_URL");
    const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return null;
    }

    return new SupabaseCacheRepository(supabaseUrl, serviceRoleKey, fetcher);
  }

  public async getByTweetId(
    tweetId: string,
    _authId?: string
  ): Promise<StoredAnalyzedTweet | null> {
    const url = new URL(`${this.supabaseUrl}/rest/v1/analyzed_tweets`);
    url.searchParams.set("tweet_id", `eq.${tweetId}`);
    url.searchParams.set(
      "select",
      "tweet_id,tweet_text,vector_social,vector_economic,vector_populist,fallacies,topic,analyzed_at,expires_at"
    );
    url.searchParams.set("limit", "1");

    const response = await this.fetcher(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Supabase lookup failed: ${response.status}`);
    }

    const rows = (await response.json()) as SupabaseRow[];
    const row = rows[0];

    if (!row) {
      return null;
    }

    return toStoredAnalyzedTweet(row);
  }

  public async upsert(record: StoredAnalyzedTweet, _authId?: string): Promise<void> {
    const response = await this.fetcher(
      `${this.supabaseUrl}/rest/v1/analyzed_tweets?on_conflict=tweet_id`,
      {
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(toSupabasePayload(record)),
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase write failed: ${response.status}`);
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    };
  }
}

export class NoopCacheRepository implements AnalyzeCacheRepository {
  public async getByTweetId(
    _tweetId: string,
    _authId?: string
  ): Promise<StoredAnalyzedTweet | null> {
    return null;
  }

  public async upsert(_record: StoredAnalyzedTweet, _authId?: string): Promise<void> {
    return;
  }
}
