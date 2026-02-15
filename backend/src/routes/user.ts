import { Hono } from "hono";

export const userRoutes = new Hono();

userRoutes.get("/profile", (c) => {
  return c.json(
    {
      status: "not_implemented",
      route: "GET /api/user/profile",
      message: "User profile scaffold is ready for TASK-4+ implementation",
    },
    501
  );
});
