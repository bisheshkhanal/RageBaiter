import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authMiddleware } from "../middleware/auth.js";
import { createBearerAuthHeader, TEST_AUTH_ID } from "../test-helpers/auth.js";
import {
  cleanupTestData,
  countRows,
  ensureTestUser,
  getHeadersForSupabaseTests,
  supabaseRequest,
} from "../test-helpers/supabase.js";
import type { AppEnv } from "../types.js";
import { createFeedbackRoutes } from "./feedback.js";

const createTestApp = (): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();
  app.use("/api/*", authMiddleware);
  app.route("/api/feedback", createFeedbackRoutes());
  return app;
};

const seedAnalyzedTweet = async (tweetId: string): Promise<void> => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await supabaseRequest<unknown[]>("analyzed_tweets", {
    method: "POST",
    headers: {
      ...getHeadersForSupabaseTests(),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      tweet_id: tweetId,
      tweet_text: "feedback integration tweet",
      vector_social: 0.2,
      vector_economic: -0.1,
      vector_populist: 0.3,
      fallacies: ["test"],
      topic: "integration",
      analyzed_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    }),
  });
};

describe("POST /api/feedback integration", () => {
  beforeEach(async () => {
    const userId = await ensureTestUser(TEST_AUTH_ID);
    if (!userId) {
      throw new Error("Failed to ensure test user");
    }
  });

  afterEach(async () => {
    await cleanupTestData(TEST_AUTH_ID, "test-feedback-");
  });

  it("creates a feedback row and is idempotent for duplicate tweet_id", async () => {
    const app = createTestApp();
    const tweetId = `test-feedback-${Date.now()}`;
    await seedAnalyzedTweet(tweetId);

    const firstResponse = await app.request(
      new Request("http://localhost/api/feedback", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tweet_id: tweetId,
          feedback_type: "agree",
        }),
      })
    );
    const firstBody = (await firstResponse.json()) as { id: number; created_at: string };

    const secondResponse = await app.request(
      new Request("http://localhost/api/feedback", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tweet_id: tweetId,
          feedback_type: "agree",
        }),
      })
    );
    const secondBody = (await secondResponse.json()) as { id: number; created_at: string };

    expect(firstResponse.status).toBe(200);
    expect(typeof firstBody.id).toBe("number");
    expect(typeof firstBody.created_at).toBe("string");

    expect(secondResponse.status).toBe(200);
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.created_at).toBe(firstBody.created_at);
    expect(await countRows("user_feedback", { tweet_id: `eq.${tweetId}` })).toBe(1);
  });

  it("returns 401 without authentication", async () => {
    const app = createTestApp();
    const tweetId = `test-feedback-${Date.now()}-unauth`;
    await seedAnalyzedTweet(tweetId);

    const response = await app.request(
      new Request("http://localhost/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tweet_id: tweetId,
          feedback_type: "agree",
        }),
      })
    );

    expect(response.status).toBe(401);
  });
});
