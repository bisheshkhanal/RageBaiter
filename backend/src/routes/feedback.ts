import { Hono } from "hono";

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

type FeedbackType = "agree" | "disagree" | "dismiss";

type FeedbackRequestBody = {
  tweet_id?: unknown;
  feedback_type?: unknown;
  vector_delta?: unknown;
};

type FeedbackInsertResult = {
  id: number;
  created_at: string;
};

type FeedbackRoutesOptions = {
  repository?: FeedbackRepository;
};

type FeedbackRouteVariables = {
  authId?: string;
};

export type FeedbackRepository = {
  upsertFeedback(
    authId: string,
    tweetId: string,
    feedbackType: FeedbackType,
    vectorDelta?: number[]
  ): Promise<FeedbackInsertResult>;
};

const readEnv = (key: string): string | undefined => {
  return (globalThis as EnvShape).process?.env?.[key];
};

const mapFeedbackType = (feedbackType: FeedbackType): "agreed" | "acknowledged" | "dismissed" => {
  if (feedbackType === "agree") {
    return "agreed";
  }

  if (feedbackType === "dismiss") {
    return "dismissed";
  }

  return "acknowledged";
};

const isFeedbackType = (value: unknown): value is FeedbackType => {
  return value === "agree" || value === "disagree" || value === "dismiss";
};

const isVectorDelta = (value: unknown): value is number[] => {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number");
};

class SupabaseFeedbackRepository implements FeedbackRepository {
  public constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  public static fromEnv(fetcher?: typeof fetch): SupabaseFeedbackRepository | null {
    const supabaseUrl = readEnv("SUPABASE_URL");
    const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return null;
    }

    return new SupabaseFeedbackRepository(supabaseUrl, serviceRoleKey, fetcher);
  }

  public async upsertFeedback(
    authId: string,
    tweetId: string,
    feedbackType: FeedbackType,
    _vectorDelta?: number[]
  ): Promise<FeedbackInsertResult> {
    const userId = await this.getUserIdByAuthId(authId);
    if (userId === null) {
      throw new Error("User not found");
    }

    const existing = await this.getExistingFeedback(userId, tweetId);
    if (existing) {
      return existing;
    }

    const response = await this.fetcher(`${this.supabaseUrl}/rest/v1/user_feedback`, {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: userId,
        tweet_id: tweetId,
        feedback_type: mapFeedbackType(feedbackType),
      }),
    });

    if (!response.ok) {
      throw new Error(`Supabase feedback insert failed: ${response.status}`);
    }

    const rows = (await response.json()) as FeedbackInsertResult[];
    const inserted = rows[0];

    if (!inserted) {
      throw new Error("Supabase feedback insert returned no rows");
    }

    return inserted;
  }

  private async getUserIdByAuthId(authId: string): Promise<number | null> {
    const url = new URL(`${this.supabaseUrl}/rest/v1/users`);
    url.searchParams.set("auth_id", `eq.${authId}`);
    url.searchParams.set("select", "id");
    url.searchParams.set("limit", "1");

    const response = await this.fetcher(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Supabase user lookup failed: ${response.status}`);
    }

    const rows = (await response.json()) as Array<{ id: number }>;
    const userId = rows[0]?.id;

    return typeof userId === "number" ? userId : null;
  }

  private async getExistingFeedback(
    userId: number,
    tweetId: string
  ): Promise<FeedbackInsertResult | null> {
    const url = new URL(`${this.supabaseUrl}/rest/v1/user_feedback`);
    url.searchParams.set("user_id", `eq.${userId}`);
    url.searchParams.set("tweet_id", `eq.${tweetId}`);
    url.searchParams.set("select", "id,created_at");
    url.searchParams.set("limit", "1");

    const response = await this.fetcher(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Supabase feedback lookup failed: ${response.status}`);
    }

    const rows = (await response.json()) as FeedbackInsertResult[];
    return rows[0] ?? null;
  }

  private getHeaders(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    };
  }
}

export const createFeedbackRoutes = (options: FeedbackRoutesOptions = {}) => {
  const feedbackRoutes = new Hono<{ Variables: FeedbackRouteVariables }>();
  const repository = options.repository ?? SupabaseFeedbackRepository.fromEnv();

  feedbackRoutes.post("/", async (c) => {
    const authId = c.get("authId");
    if (typeof authId !== "string" || authId.length === 0) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Missing authenticated user context",
          },
        },
        401
      );
    }

    if (!repository) {
      return c.json(
        {
          error: {
            code: "FEEDBACK_BACKEND_UNAVAILABLE",
            message: "Feedback operations are unavailable",
          },
        },
        503
      );
    }

    const body = (await c.req.json().catch(() => null)) as FeedbackRequestBody | null;
    if (!body) {
      return c.json(
        {
          error: {
            code: "INVALID_JSON",
            message: "Request body must be valid JSON",
          },
        },
        400
      );
    }

    if (
      typeof body.tweet_id !== "string" ||
      body.tweet_id.length === 0 ||
      !isFeedbackType(body.feedback_type)
    ) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "tweet_id and feedback_type are required",
          },
        },
        400
      );
    }

    if (body.vector_delta !== undefined && !isVectorDelta(body.vector_delta)) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "vector_delta must be an array of numbers",
          },
        },
        400
      );
    }

    const result = await repository.upsertFeedback(
      authId,
      body.tweet_id,
      body.feedback_type,
      body.vector_delta
    );

    return c.json(
      {
        id: result.id,
        created_at: result.created_at,
      },
      200
    );
  });

  return feedbackRoutes;
};

export const feedbackRoutes = createFeedbackRoutes();
