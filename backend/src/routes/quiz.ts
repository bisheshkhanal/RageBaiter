import { Hono } from "hono";

export const quizRoutes = new Hono();

quizRoutes.post("/score", async (c) => {
  const body = await c.req.json().catch(() => null);

  return c.json(
    {
      status: "not_implemented",
      route: "POST /api/quiz/score",
      message: "Quiz scoring scaffold is ready for TASK-12 implementation",
      received: body,
    },
    501
  );
});
