import { describe, expect, it } from "vitest";

import { createUserRoutes, type UserExportPayload, type UserPrivacyRepository } from "./user.js";

class InMemoryUserPrivacyRepository implements UserPrivacyRepository {
  private readonly byAuthId = new Map<string, UserExportPayload>();

  public constructor(initialRows: Record<string, UserExportPayload>) {
    for (const [authId, payload] of Object.entries(initialRows)) {
      this.byAuthId.set(authId, payload);
    }
  }

  public async exportUserData(
    authId: string,
    _accessToken: string
  ): Promise<UserExportPayload | null> {
    return this.byAuthId.get(authId) ?? null;
  }

  public async deleteUserData(authId: string, _accessToken: string): Promise<{ deleted: boolean }> {
    const deleted = this.byAuthId.delete(authId);
    return { deleted };
  }
}

const buildBearerToken = (authId: string): string => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: authId })).toString("base64url");
  return `Bearer ${header}.${payload}.signature`;
};

describe("/api/user privacy routes", () => {
  it("exports data, deletes it, then returns 404 for subsequent exports", async () => {
    const authId = "11111111-1111-1111-1111-111111111111";
    const repository = new InMemoryUserPrivacyRepository({
      [authId]: {
        profile: {
          id: 5,
          auth_id: authId,
          vector_social: 0.3,
          vector_economic: -0.2,
          vector_populist: 0.1,
          created_at: "2026-02-15T10:00:00.000Z",
          updated_at: "2026-02-15T10:05:00.000Z",
        },
        feedback: [
          {
            id: 2,
            user_id: 5,
            tweet_id: "tweet-100",
            feedback_type: "agreed",
            created_at: "2026-02-15T10:10:00.000Z",
          },
        ],
        quizResponses: [
          {
            id: 9,
            user_id: 5,
            answers: [{ questionId: 1, value: 2 }],
            resulting_vector: [0.3, -0.2, 0.1],
            created_at: "2026-02-15T10:01:00.000Z",
          },
        ],
      },
    });
    const app = createUserRoutes({ privacyRepository: repository });
    const authorization = buildBearerToken(authId);

    const exportBeforeDelete = await app.request(
      new Request("http://localhost/export", {
        method: "GET",
        headers: {
          Authorization: authorization,
        },
      })
    );
    const exportBeforeDeleteBody = (await exportBeforeDelete.json()) as UserExportPayload;

    const deleteResponse = await app.request(
      new Request("http://localhost/delete", {
        method: "POST",
        headers: {
          Authorization: authorization,
        },
      })
    );
    const deleteBody = (await deleteResponse.json()) as { success: boolean; deleted: boolean };

    const secondDeleteResponse = await app.request(
      new Request("http://localhost/delete", {
        method: "POST",
        headers: {
          Authorization: authorization,
        },
      })
    );
    const secondDeleteBody = (await secondDeleteResponse.json()) as {
      success: boolean;
      deleted: boolean;
    };

    const exportAfterDelete = await app.request(
      new Request("http://localhost/export", {
        method: "GET",
        headers: {
          Authorization: authorization,
        },
      })
    );
    const exportAfterDeleteBody = (await exportAfterDelete.json()) as {
      error: { code: string; message: string };
    };

    expect(exportBeforeDelete.status).toBe(200);
    expect(exportBeforeDeleteBody.profile.auth_id).toBe(authId);
    expect(exportBeforeDeleteBody.feedback).toHaveLength(1);
    expect(exportBeforeDeleteBody.quizResponses).toHaveLength(1);

    expect(deleteResponse.status).toBe(200);
    expect(deleteBody).toEqual({ success: true, deleted: true });

    expect(secondDeleteResponse.status).toBe(200);
    expect(secondDeleteBody).toEqual({ success: true, deleted: false });

    expect(exportAfterDelete.status).toBe(404);
    expect(exportAfterDeleteBody.error.code).toBe("USER_NOT_FOUND");
  });

  it("returns 401 when bearer token has no user context", async () => {
    const repository = new InMemoryUserPrivacyRepository({});
    const app = createUserRoutes({ privacyRepository: repository });

    const response = await app.request(
      new Request("http://localhost/export", {
        method: "GET",
        headers: {
          Authorization: "Bearer not-a-jwt",
        },
      })
    );

    expect(response.status).toBe(401);
  });
});
