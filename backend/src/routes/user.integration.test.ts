import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { authMiddleware } from "../middleware/auth.js";
import { createBearerAuthHeader, TEST_AUTH_ID } from "../test-helpers/auth.js";
import {
  cleanupTestData,
  ensureTestUser,
  getHeadersForSupabaseTests,
  supabaseRequest,
} from "../test-helpers/supabase.js";
import type { AppEnv } from "../types.js";
import { createUserRoutes } from "./user.js";

const createTestApp = (): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();
  app.use("/api/*", authMiddleware);
  app.route("/api/user", createUserRoutes());
  return app;
};

const seedAnalyzedTweet = async (tweetId: string): Promise<void> => {
  const now = new Date();
  await supabaseRequest<unknown[]>("analyzed_tweets", {
    method: "POST",
    headers: {
      ...getHeadersForSupabaseTests(),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      tweet_id: tweetId,
      tweet_text: "user export test tweet",
      vector_social: 0.1,
      vector_economic: 0.2,
      vector_populist: -0.3,
      fallacies: ["test"],
      topic: "integration",
      analyzed_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  });
};

describe("/api/user integration", () => {
  afterEach(async () => {
    await cleanupTestData(TEST_AUTH_ID, "test-user-");
  });

  it("exports user data and deletes all user data", async () => {
    const app = createTestApp();
    const userId = await ensureTestUser(TEST_AUTH_ID);
    if (!userId) {
      throw new Error("Failed to ensure test user");
    }

    const tweetId = `test-user-${Date.now()}`;
    await seedAnalyzedTweet(tweetId);

    await supabaseRequest<unknown[]>("user_feedback", {
      method: "POST",
      headers: {
        ...getHeadersForSupabaseTests(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        tweet_id: tweetId,
        feedback_type: "agreed",
      }),
    });

    await supabaseRequest<unknown[]>("quiz_responses", {
      method: "POST",
      headers: {
        ...getHeadersForSupabaseTests(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        answers: { q1: 1 },
        resulting_vector: [0.11, 0.22, 0.33],
      }),
    });

    const exportResponse = await app.request(
      new Request("http://localhost/api/user/export", {
        method: "GET",
        headers: createBearerAuthHeader(TEST_AUTH_ID),
      })
    );
    const exportBody = (await exportResponse.json()) as {
      profile: { auth_id: string };
      feedback: unknown[];
      quizResponses: unknown[];
    };

    expect(exportResponse.status).toBe(200);
    expect(exportBody.profile.auth_id).toBe(TEST_AUTH_ID);
    expect(exportBody.feedback.length).toBeGreaterThan(0);
    expect(exportBody.quizResponses.length).toBeGreaterThan(0);

    const deleteResponse = await app.request(
      new Request("http://localhost/api/user/delete", {
        method: "DELETE",
        headers: createBearerAuthHeader(TEST_AUTH_ID),
      })
    );
    expect(deleteResponse.status).toBe(204);

    const exportAfterDelete = await app.request(
      new Request("http://localhost/api/user/export", {
        method: "GET",
        headers: createBearerAuthHeader(TEST_AUTH_ID),
      })
    );

    expect(exportAfterDelete.status).toBe(404);
  });
});
