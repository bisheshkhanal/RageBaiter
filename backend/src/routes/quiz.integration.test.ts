import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { authMiddleware } from "../middleware/auth.js";
import { createBearerAuthHeader, TEST_AUTH_ID } from "../test-helpers/auth.js";
import {
  cleanupTestData,
  countRows,
  getHeadersForSupabaseTests,
  supabaseRequest,
} from "../test-helpers/supabase.js";
import type { AppEnv } from "../types.js";
import { quizRoutes } from "./quiz.js";

const createTestApp = (): Hono<AppEnv> => {
  const app = new Hono<AppEnv>();
  app.use("/api/*", authMiddleware);
  app.route("/api/quiz", quizRoutes);
  return app;
};

describe("/api/quiz integration", () => {
  afterEach(async () => {
    await cleanupTestData(TEST_AUTH_ID, "test-");
  });

  it("persists quiz score to users and quiz_responses", async () => {
    const app = createTestApp();
    const vector = {
      social: 0.4,
      economic: -0.3,
      populist: 0.2,
    };

    const response = await app.request(
      new Request("http://localhost/api/quiz/score", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vector),
      })
    );

    expect(response.status).toBe(200);
    expect(await countRows("users", { auth_id: `eq.${TEST_AUTH_ID}` })).toBe(1);

    const userRows = await supabaseRequest<
      Array<{ id: number; vector_social: number; vector_economic: number; vector_populist: number }>
    >(
      "users",
      {
        method: "GET",
        headers: getHeadersForSupabaseTests(),
      },
      {
        auth_id: `eq.${TEST_AUTH_ID}`,
        select: "id,vector_social,vector_economic,vector_populist",
        limit: "1",
      }
    );

    const user = userRows[0];
    expect(user).toBeDefined();
    expect(user?.vector_social).toBe(vector.social);
    expect(user?.vector_economic).toBe(vector.economic);
    expect(user?.vector_populist).toBe(vector.populist);
    expect(await countRows("quiz_responses", { user_id: `eq.${user?.id}` })).toBe(1);
  });

  it("returns quiz response history for authenticated user", async () => {
    const app = createTestApp();

    await app.request(
      new Request("http://localhost/api/quiz/score", {
        method: "POST",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          social: -0.1,
          economic: 0.35,
          populist: -0.4,
        }),
      })
    );

    const response = await app.request(
      new Request("http://localhost/api/quiz/responses", {
        method: "GET",
        headers: {
          ...createBearerAuthHeader(TEST_AUTH_ID),
        },
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      responses: Array<{ resulting_vector: number[]; user_id: number }>;
    };

    expect(Array.isArray(body.responses)).toBe(true);
    expect(body.responses.length).toBeGreaterThan(0);
  });
});
