import { Hono } from "hono";

export const analyzeRoutes = new Hono();

analyzeRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);

  return c.json(
    {
      status: "not_implemented",
      route: "POST /api/analyze",
      message: "Analyze endpoint scaffold is ready for TASK-4+ implementation",
      received: body,
    },
    501
  );
});
