export type TweetVector = {
  social: number;
  economic: number;
  populist: number;
};

export type TweetAnalysis = {
  tweetText: string;
  tweetVector: TweetVector;
  fallacies: string[];
  topic: string;
  confidence: number;
  counterArgument?: string;
  logicFailure?: string;
  claim?: string;
  mechanism?: string;
  dataCheck?: string;
  socraticChallenge?: string;
  analyzedAt: number;
  expiresAt: number;
};

export type AnalyzedTweet = {
  tweetId: string;
  analysis: TweetAnalysis;
};

export type StoredAnalyzedTweet = {
  tweetId: string;
  tweetText: string;
  vectorSocial: number;
  vectorEconomic: number;
  vectorPopulist: number;
  fallacies: string[];
  topic: string;
  analyzedAt: number;
  expiresAt: number;
};

export type AnalyzeCacheRepository = {
  getByTweetId(tweetId: string): Promise<StoredAnalyzedTweet | null>;
  upsert(record: StoredAnalyzedTweet): Promise<void>;
};

type AnalyzeUpstream = (
  tweetId: string,
  tweetText: string
) => Promise<Omit<TweetAnalysis, "analyzedAt" | "expiresAt"> | null>;

type CacheOptions = {
  maxEntries?: number;
  ttlMs?: number;
  now?: () => number;
};

export type AnalyzeResult = {
  source: "cache" | "llm";
  analyzedTweet: AnalyzedTweet;
};

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

class LruTtlCache<TKey, TValue extends { expiresAt: number }> {
  private readonly storage = new Map<TKey, TValue>();

  public constructor(
    private readonly maxEntries: number,
    private readonly now: () => number
  ) {}

  public get(key: TKey): TValue | null {
    const current = this.storage.get(key);

    if (!current) {
      return null;
    }

    if (current.expiresAt <= this.now()) {
      this.storage.delete(key);
      return null;
    }

    this.storage.delete(key);
    this.storage.set(key, current);

    return current;
  }

  public set(key: TKey, value: TValue): void {
    if (this.storage.has(key)) {
      this.storage.delete(key);
    }

    this.storage.set(key, value);

    if (this.storage.size <= this.maxEntries) {
      return;
    }

    const firstKey = this.storage.keys().next().value;
    if (firstKey !== undefined) {
      this.storage.delete(firstKey);
    }
  }

  public size(): number {
    return this.storage.size;
  }
}

const toAnalyzedTweet = (record: StoredAnalyzedTweet): AnalyzedTweet => {
  return {
    tweetId: record.tweetId,
    analysis: {
      tweetText: record.tweetText,
      tweetVector: {
        social: record.vectorSocial,
        economic: record.vectorEconomic,
        populist: record.vectorPopulist,
      },
      fallacies: [...record.fallacies],
      topic: record.topic,
      confidence: 0.5,
      analyzedAt: record.analyzedAt,
      expiresAt: record.expiresAt,
    },
  };
};

const toStoredRecord = (tweetId: string, analysis: TweetAnalysis): StoredAnalyzedTweet => {
  return {
    tweetId,
    tweetText: analysis.tweetText,
    vectorSocial: analysis.tweetVector.social,
    vectorEconomic: analysis.tweetVector.economic,
    vectorPopulist: analysis.tweetVector.populist,
    fallacies: [...analysis.fallacies],
    topic: analysis.topic,
    analyzedAt: analysis.analyzedAt,
    expiresAt: analysis.expiresAt,
  };
};

export class TweetAnalysisCacheService {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly memoryCache: LruTtlCache<string, AnalyzedTweet["analysis"]>;
  private readonly inFlight = new Map<string, Promise<AnalyzeResult | null>>();

  public constructor(
    private readonly repository: AnalyzeCacheRepository,
    private readonly upstreamAnalyzer: AnalyzeUpstream,
    options: CacheOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => Date.now());
    this.memoryCache = new LruTtlCache<string, AnalyzedTweet["analysis"]>(
      options.maxEntries ?? DEFAULT_MAX_ENTRIES,
      this.now
    );
  }

  public async analyze(tweetId: string, tweetText: string): Promise<AnalyzeResult | null> {
    const cached = await this.checkCache(tweetId);
    if (cached) {
      return {
        source: "cache",
        analyzedTweet: cached,
      };
    }

    const existing = this.inFlight.get(tweetId);
    if (existing) {
      return existing;
    }

    const inflight = this.analyzeAndCache(tweetId, tweetText).finally(() => {
      this.inFlight.delete(tweetId);
    });

    this.inFlight.set(tweetId, inflight);
    return inflight;
  }

  public async checkCache(tweetId: string): Promise<AnalyzedTweet | null> {
    const memoryHit = this.memoryCache.get(tweetId);
    if (memoryHit) {
      return {
        tweetId,
        analysis: memoryHit,
      };
    }

    let stored: StoredAnalyzedTweet | null = null;

    try {
      stored = await this.repository.getByTweetId(tweetId);
    } catch {
      return null;
    }

    if (!stored) {
      return null;
    }

    if (stored.expiresAt <= this.now()) {
      return null;
    }

    const analyzed = toAnalyzedTweet(stored);
    this.memoryCache.set(tweetId, analyzed.analysis);
    return analyzed;
  }

  public async writeCache(tweetId: string, analysis: TweetAnalysis): Promise<void> {
    this.memoryCache.set(tweetId, analysis);

    try {
      await this.repository.upsert(toStoredRecord(tweetId, analysis));
    } catch {
      return;
    }
  }

  public memorySize(): number {
    return this.memoryCache.size();
  }

  private async analyzeAndCache(tweetId: string, tweetText: string): Promise<AnalyzeResult | null> {
    const now = this.now();
    const upstream = await this.upstreamAnalyzer(tweetId, tweetText);

    if (!upstream) {
      return null;
    }

    const analysis: TweetAnalysis = {
      ...upstream,
      analyzedAt: now,
      expiresAt: now + this.ttlMs,
    };

    await this.writeCache(tweetId, analysis);

    return {
      source: "llm",
      analyzedTweet: {
        tweetId,
        analysis,
      },
    };
  }
}
