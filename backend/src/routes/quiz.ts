import { Hono } from "hono";

export const quizRoutes = new Hono();

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

  return c.json(response, 200);
});

quizRoutes.get("/status", (c) => {
  return c.json({
    status: "ready",
    message: "Quiz scoring endpoint is available",
  });
});
