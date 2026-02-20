import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { createFeedbackRoutes, type FeedbackRepository } from "./feedback.js";

type StoredFeedback = {
  id: number;
  created_at: string;
};

class InMemoryFeedbackRepository implements FeedbackRepository {
  private nextId = 1;
  private readonly rows = new Map<string, StoredFeedback>();

  public async upsertFeedback(
    authId: string,
    tweetId: string,
    feedbackType: "agree" | "disagree" | "dismiss",
    vectorDelta?: number[]
  ): Promise<StoredFeedback> {
    void feedbackType;
    void vectorDelta;

    const key = `${authId}:${tweetId}`;
    const existing = this.rows.get(key);
    if (existing) {
      return existing;
    }

    const created = {
      id: this.nextId,
      created_at: `2026-02-19T00:00:0${this.nextId}.000Z`,
    };

    this.nextId += 1;
    this.rows.set(key, created);

    return created;
  }
}

const createApp = (authId?: string) => {
  const app = new Hono<{ Variables: { authId: string } }>();

  app.use("*", async (c, next) => {
    if (authId) {
      c.set("authId", authId);
    }

    await next();
  });

  app.route("/", createFeedbackRoutes({ repository: new InMemoryFeedbackRepository() }));
  return app;
};

describe("POST /api/feedback", () => {
  it("creates a feedback row when auth is present", async () => {
    const app = createApp("11111111-1111-1111-1111-111111111111");

    const response = await app.request(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({
          tweet_id: "tweet-1",
          feedback_type: "agree",
        }),
      })
    );

    const body = (await response.json()) as { id: number; created_at: string };
    expect(response.status).toBe(200);
    expect(body.id).toBe(1);
    expect(body.created_at).toMatch(/^2026-02-19T00:00:01.000Z$/);
  });

  it("is idempotent for duplicate auth_id + tweet_id", async () => {
    const app = createApp("11111111-1111-1111-1111-111111111111");

    const payload = {
      tweet_id: "tweet-dup",
      feedback_type: "dismiss",
    };

    const first = await app.request(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify(payload),
      })
    );
    const firstBody = (await first.json()) as { id: number; created_at: string };

    const duplicate = await app.request(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify(payload),
      })
    );
    const duplicateBody = (await duplicate.json()) as { id: number; created_at: string };

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(duplicateBody).toEqual(firstBody);
  });

  it("returns 400 when required fields are missing", async () => {
    const app = createApp("11111111-1111-1111-1111-111111111111");

    const response = await app.request(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({
          feedback_type: "agree",
        }),
      })
    );

    expect(response.status).toBe(400);
  });
});
