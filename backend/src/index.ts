import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { analyzeRoutes } from "./routes/analyze.js";
import { demoRoutes } from "./routes/demo.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { quizRoutes } from "./routes/quiz.js";
import { userRoutes } from "./routes/user.js";

const app = new Hono();

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

const loadProjectEnv = (): void => {
  const envCandidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "..", ".env")];
  const envPath = envCandidates.find((path) => existsSync(path));

  if (!envPath) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key.length === 0 || process.env[key] !== undefined) {
      continue;
    }

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const unquotedValue =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;

    process.env[key] = unquotedValue;
  }
};

loadProjectEnv();

const env = (globalThis as EnvShape).process?.env ?? {};

const extensionOrigin = (env.EXTENSION_ORIGIN ?? "").trim();
const hasExplicitExtensionOrigin =
  extensionOrigin.length > 0 && extensionOrigin !== "chrome-extension://replace-with-extension-id";

const resolveCorsOrigin = (requestOrigin?: string): string => {
  if (!requestOrigin) {
    return "";
  }

  if (hasExplicitExtensionOrigin) {
    return requestOrigin === extensionOrigin ? requestOrigin : "";
  }

  if (requestOrigin.startsWith("chrome-extension://")) {
    return requestOrigin;
  }

  if (
    requestOrigin.startsWith("http://localhost") ||
    requestOrigin.startsWith("https://localhost") ||
    requestOrigin.startsWith("http://127.0.0.1") ||
    requestOrigin.startsWith("https://127.0.0.1")
  ) {
    return requestOrigin;
  }

  return "";
};

app.use(
  "/api/*",
  cors({
    origin: (origin) => resolveCorsOrigin(origin),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "X-API-Key"],
    maxAge: 600,
  })
);

app.get("/health", (c) => c.json({ status: "ok" }, 200));
app.route("/demo", demoRoutes);

app.use("/api/user/*", authMiddleware);
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
