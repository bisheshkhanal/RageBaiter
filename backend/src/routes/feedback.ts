import { Hono } from "hono";

export const feedbackRoutes = new Hono();

feedbackRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);

  return c.json(
    {
      status: "not_implemented",
      route: "POST /api/feedback",
      message: "Feedback scaffold is ready for TASK-17 implementation",
      received: body,
    },
    501
  );
});
