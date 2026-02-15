import { Hono } from "hono";

export const quizRoutes = new Hono();

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

type QuizScoreRequest = {
  social: number;
  economic: number;
  populist: number;
};

type QuizScoreResponse = {
  success: boolean;
  vector: {
    social: number;
    economic: number;
    populist: number;
  };
  timestamp: string;
};

type AuthContext = {
  authId: string;
  accessToken: string;
};

type SupabaseQuizSyncRepository = {
  persistQuizVector(authContext: AuthContext, vector: QuizScoreRequest): Promise<void>;
};

const readEnv = (key: string): string | undefined => {
  return (globalThis as EnvShape).process?.env?.[key];
};

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  const padded = remainder === 0 ? normalized : `${normalized}${"=".repeat(4 - remainder)}`;
  return Buffer.from(padded, "base64").toString("utf8");
};

const extractAuthIdFromToken = (accessToken: string): string | null => {
  const tokenParts = accessToken.split(".");
  if (tokenParts.length < 2) {
    return null;
  }

  const payloadPart = tokenParts[1];
  if (!payloadPart) {
    return null;
  }

  try {
    const payloadJson = decodeBase64Url(payloadPart);
    const payload = JSON.parse(payloadJson) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
};

const readAuthContext = (authorizationHeader?: string): AuthContext | null => {
  if (typeof authorizationHeader !== "string" || !authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  const accessToken = authorizationHeader.slice("Bearer ".length).trim();
  if (accessToken.length === 0) {
    return null;
  }

  const authId = extractAuthIdFromToken(accessToken);
  if (!authId) {
    return null;
  }

  return { authId, accessToken };
};

class SupabaseQuizSyncRestRepository implements SupabaseQuizSyncRepository {
  public constructor(
    private readonly supabaseUrl: string,
    private readonly supabaseKey: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  public static fromEnv(fetcher?: typeof fetch): SupabaseQuizSyncRestRepository | null {
    const supabaseUrl = readEnv("SUPABASE_URL");
    const supabaseKey = readEnv("SUPABASE_ANON_KEY") ?? readEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return null;
    }

    return new SupabaseQuizSyncRestRepository(supabaseUrl, supabaseKey, fetcher);
  }

  public async persistQuizVector(
    authContext: AuthContext,
    vector: QuizScoreRequest
  ): Promise<void> {
    const upsertUrl = new URL(`${this.supabaseUrl}/rest/v1/users`);
    upsertUrl.searchParams.set("on_conflict", "auth_id");

    const upsertResponse = await this.fetcher(upsertUrl, {
      method: "POST",
      headers: {
        ...this.getHeaders(authContext.accessToken),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([
        {
          auth_id: authContext.authId,
          vector_social: vector.social,
          vector_economic: vector.economic,
          vector_populist: vector.populist,
        },
      ]),
    });

    if (!upsertResponse.ok) {
      throw new Error(`Supabase user upsert failed: ${upsertResponse.status}`);
    }

    const upsertRows = (await upsertResponse.json()) as Array<{ id: number }>;
    const userId = upsertRows[0]?.id;

    if (typeof userId !== "number") {
      return;
    }

    const quizUrl = new URL(`${this.supabaseUrl}/rest/v1/quiz_responses`);
    const quizResponse = await this.fetcher(quizUrl, {
      method: "POST",
      headers: {
        ...this.getHeaders(authContext.accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          user_id: userId,
          answers: {},
          resulting_vector: [vector.social, vector.economic, vector.populist],
        },
      ]),
    });

    if (!quizResponse.ok) {
      throw new Error(`Supabase quiz response insert failed: ${quizResponse.status}`);
    }
  }

  private getHeaders(accessToken: string): Record<string, string> {
    return {
      apikey: this.supabaseKey,
      Authorization: `Bearer ${accessToken}`,
    };
  }
}

const quizSyncRepository = SupabaseQuizSyncRestRepository.fromEnv();

const isValidVector = (
  value: unknown
): value is { social: number; economic: number; populist: number } => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Record<string, unknown>;

  return (
    typeof v.social === "number" &&
    typeof v.economic === "number" &&
    typeof v.populist === "number" &&
    v.social >= -1 &&
    v.social <= 1 &&
    v.economic >= -1 &&
    v.economic <= 1 &&
    v.populist >= -1 &&
    v.populist <= 1
  );
};

quizRoutes.post("/score", async (c) => {
  const body = await c.req.json<QuizScoreRequest>().catch(() => null);

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

  if (!isValidVector(body)) {
    return c.json(
      {
        error: {
          code: "INVALID_VECTOR",
          message: "Vector values must be numbers between -1 and 1",
        },
      },
      400
    );
  }

  const response: QuizScoreResponse = {
    success: true,
    vector: {
      social: body.social,
      economic: body.economic,
      populist: body.populist,
    },
    timestamp: new Date().toISOString(),
  };

  const authContext = readAuthContext(
    c.req.header("Authorization") ?? c.req.header("authorization")
  );

  if (authContext && quizSyncRepository) {
    try {
      await quizSyncRepository.persistQuizVector(authContext, body);
    } catch (error) {
      console.warn("Quiz vector persistence skipped:", error);
    }
  }

  return c.json(response, 200);
});

quizRoutes.get("/status", (c) => {
  return c.json({
    status: "ready",
    message: "Quiz scoring endpoint is available",
  });
});
