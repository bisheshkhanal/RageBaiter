import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { analyzeRoutes } from "./routes/analyze.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { quizRoutes } from "./routes/quiz.js";
import { userRoutes } from "./routes/user.js";

const app = new Hono();

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

const env = (globalThis as EnvShape).process?.env ?? {};

const extensionOrigin = env.EXTENSION_ORIGIN ?? "chrome-extension://replace-with-extension-id";

app.use(
  "/api/*",
  cors({
    origin: extensionOrigin,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "X-API-Key"],
    maxAge: 600,
  })
);

app.get("/health", (c) => c.json({ status: "ok" }, 200));

app.use("/api/*", authMiddleware);
app.use("/api/*", rateLimitMiddleware);

app.route("/api/analyze", analyzeRoutes);
app.route("/api/quiz", quizRoutes);
app.route("/api/user", userRoutes);
app.route("/api/feedback", feedbackRoutes);

app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    },
    404
  );
});

app.onError((error, c) => {
  const message = env.NODE_ENV === "development" ? error.message : "Unexpected server error";

  return c.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message,
      },
    },
    500
  );
});

const port = Number(env.BACKEND_PORT ?? "3001");

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`RageBaiter backend listening on http://localhost:${info.port}`);
  }
);

export default app;
