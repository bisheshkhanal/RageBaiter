import { Hono } from "hono";

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

type UserProfile = {
  id: number;
  auth_id: string;
  vector_social: number;
  vector_economic: number;
  vector_populist: number;
  created_at: string;
  updated_at: string;
};

type UserFeedback = {
  id: number;
  user_id: number;
  tweet_id: string;
  feedback_type: "acknowledged" | "agreed" | "dismissed";
  created_at: string;
};

type QuizResponse = {
  id: number;
  user_id: number;
  answers: unknown;
  resulting_vector: [number, number, number] | number[];
  created_at: string;
};

export type UserExportPayload = {
  profile: UserProfile;
  feedback: UserFeedback[];
  quizResponses: QuizResponse[];
  exportedAt: string;
};

export type UserDeleteResult = {
  deleted: boolean;
};

export type UserPrivacyRepository = {
  exportUserData(authId: string, accessToken: string): Promise<UserExportPayload | null>;
  deleteUserData(authId: string, accessToken: string): Promise<UserDeleteResult>;
};

type UserRoutesOptions = {
  privacyRepository?: UserPrivacyRepository;
};

type AuthContext = {
  authId: string;
  accessToken: string;
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

class SupabaseUserPrivacyRepository implements UserPrivacyRepository {
  public constructor(
    private readonly supabaseUrl: string,
    private readonly supabaseKey: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  public static fromEnv(fetcher?: typeof fetch): SupabaseUserPrivacyRepository | null {
    const supabaseUrl = readEnv("SUPABASE_URL");
    const supabaseKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return null;
    }

    return new SupabaseUserPrivacyRepository(supabaseUrl, supabaseKey, fetcher);
  }

  public async exportUserData(
    authId: string,
    _accessToken: string
  ): Promise<UserExportPayload | null> {
    const profile = await this.getUserProfile(authId);
    if (!profile) {
      return null;
    }

    const [feedback, quizResponses] = await Promise.all([
      this.getFeedback(profile.id),
      this.getQuizResponses(profile.id),
    ]);

    return {
      profile,
      feedback,
      quizResponses,
      exportedAt: new Date().toISOString(),
    };
  }

  public async deleteUserData(authId: string, _accessToken: string): Promise<UserDeleteResult> {
    const url = new URL(`${this.supabaseUrl}/rest/v1/users`);
    url.searchParams.set("auth_id", `eq.${authId}`);
    url.searchParams.set("select", "id");

    const response = await this.fetcher(url, {
      method: "DELETE",
      headers: {
        ...this.getHeaders(),
        Prefer: "return=representation",
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase delete failed: ${response.status}`);
    }

    const rows = (await response.json()) as Array<{ id: number }>;
    return {
      deleted: rows.length > 0,
    };
  }

  private async getUserProfile(authId: string): Promise<UserProfile | null> {
    const url = new URL(`${this.supabaseUrl}/rest/v1/users`);
    url.searchParams.set("auth_id", `eq.${authId}`);
    url.searchParams.set(
      "select",
      "id,auth_id,vector_social,vector_economic,vector_populist,created_at,updated_at"
    );
    url.searchParams.set("limit", "1");

    const response = await this.fetcher(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Supabase user export failed: ${response.status}`);
    }

    const rows = (await response.json()) as UserProfile[];
    return rows[0] ?? null;
  }

  private async getFeedback(userId: number): Promise<UserFeedback[]> {
    const url = new URL(`${this.supabaseUrl}/rest/v1/user_feedback`);
    url.searchParams.set("user_id", `eq.${userId}`);
    url.searchParams.set("select", "id,user_id,tweet_id,feedback_type,created_at");
    url.searchParams.set("order", "created_at.asc");

    const response = await this.fetcher(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Supabase feedback export failed: ${response.status}`);
    }

    return (await response.json()) as UserFeedback[];
  }

  private async getQuizResponses(userId: number): Promise<QuizResponse[]> {
    const url = new URL(`${this.supabaseUrl}/rest/v1/quiz_responses`);
    url.searchParams.set("user_id", `eq.${userId}`);
    url.searchParams.set("select", "id,user_id,answers,resulting_vector,created_at");
    url.searchParams.set("order", "created_at.asc");

    const response = await this.fetcher(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Supabase quiz export failed: ${response.status}`);
    }

    return (await response.json()) as QuizResponse[];
  }

  private getHeaders(): Record<string, string> {
    return {
      apikey: this.supabaseKey,
      Authorization: `Bearer ${this.supabaseKey}`,
    };
  }
}

const backendUnavailableResponse = {
  error: {
    code: "PRIVACY_BACKEND_UNAVAILABLE",
    message: "Privacy data operations are unavailable",
  },
};

const userContextRequiredResponse = {
  error: {
    code: "USER_CONTEXT_REQUIRED",
    message: "A valid Bearer token with a user id is required",
  },
};

export const createUserRoutes = (options: UserRoutesOptions = {}): Hono => {
  const userRoutes = new Hono();
  const privacyRepository = options.privacyRepository ?? SupabaseUserPrivacyRepository.fromEnv();

  userRoutes.get("/export", async (c) => {
    const authContext = readAuthContext(
      c.req.header("Authorization") ?? c.req.header("authorization")
    );

    if (!authContext) {
      return c.json(userContextRequiredResponse, 401);
    }

    if (!privacyRepository) {
      return c.json(backendUnavailableResponse, 503);
    }

    const data = await privacyRepository.exportUserData(
      authContext.authId,
      authContext.accessToken
    );
    if (!data) {
      return c.json(
        {
          error: {
            code: "USER_NOT_FOUND",
            message: "No user data found for this account",
          },
        },
        404
      );
    }

    return c.json(data, 200);
  });

  userRoutes.delete("/delete", async (c) => {
    const authContext = readAuthContext(
      c.req.header("Authorization") ?? c.req.header("authorization")
    );

    if (!authContext) {
      return c.json(userContextRequiredResponse, 401);
    }

    if (!privacyRepository) {
      return c.json(backendUnavailableResponse, 503);
    }

    await privacyRepository.deleteUserData(authContext.authId, authContext.accessToken);
    return c.body(null, 204);
  });

  return userRoutes;
};

export const userRoutes = createUserRoutes();
