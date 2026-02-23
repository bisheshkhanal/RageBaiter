import { Hono } from "hono";
import { getSupabaseAuthService } from "../services/supabase-auth.js";

type AuthRoutesEnv = {
  Variables: {
    authId?: string;
  };
};

const authRoutes = new Hono<AuthRoutesEnv>();

authRoutes.post("/signup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Email and password are required",
        },
      },
      400
    );
  }

  if (password.length < 6) {
    return c.json(
      {
        error: {
          code: "INVALID_PASSWORD",
          message: "Password must be at least 6 characters",
        },
      },
      400
    );
  }

  try {
    const authService = getSupabaseAuthService();
    const result = await authService.signUp(email, password);

    if (result.error) {
      return c.json(
        {
          error: {
            code: "SIGNUP_FAILED",
            message: result.error.message,
          },
        },
        (result.error.status_code || 400) as 400 | 401 | 409 | 422 | 429
      );
    }

    return c.json({
      success: true,
      user: {
        id: result.user?.id,
        email: result.user?.email,
      },
      session: result.session
        ? {
            accessToken: result.session.access_token,
            refreshToken: result.session.refresh_token,
            expiresAt: result.session.expires_at,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signup failed";
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      },
      500
    );
  }
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Email and password are required",
        },
      },
      400
    );
  }

  try {
    const authService = getSupabaseAuthService();
    const result = await authService.signInWithPassword(email, password);

    if (result.error) {
      return c.json(
        {
          error: {
            code: "LOGIN_FAILED",
            message: result.error.message,
          },
        },
        (result.error.status_code || 401) as 400 | 401 | 403 | 429
      );
    }

    return c.json({
      success: true,
      user: {
        id: result.user?.id,
        email: result.user?.email,
      },
      session: result.session
        ? {
            accessToken: result.session.access_token,
            refreshToken: result.session.refresh_token,
            expiresAt: result.session.expires_at,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      },
      500
    );
  }
});

authRoutes.post("/logout", async (c) => {
  const authorization = c.req.header("authorization") ?? c.req.header("Authorization");

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Missing authorization token",
        },
      },
      401
    );
  }

  const accessToken = authorization.slice("Bearer ".length).trim();

  try {
    const authService = getSupabaseAuthService();
    const result = await authService.signOut(accessToken);

    if (result.error) {
      return c.json(
        {
          error: {
            code: "LOGOUT_FAILED",
            message: result.error,
          },
        },
        400
      );
    }

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logout failed";
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      },
      500
    );
  }
});

authRoutes.post("/refresh", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";

  if (!refreshToken) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Refresh token is required",
        },
      },
      400
    );
  }

  try {
    const authService = getSupabaseAuthService();
    const result = await authService.refreshSession(refreshToken);

    if (result.error) {
      return c.json(
        {
          error: {
            code: "REFRESH_FAILED",
            message: result.error.message,
          },
        },
        (result.error.status_code || 401) as 400 | 401 | 403 | 429
      );
    }

    return c.json({
      success: true,
      session: result.session
        ? {
            accessToken: result.session.access_token,
            refreshToken: result.session.refresh_token,
            expiresAt: result.session.expires_at,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token refresh failed";
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      },
      500
    );
  }
});

authRoutes.get("/me", async (c) => {
  const authorization = c.req.header("authorization") ?? c.req.header("Authorization");

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Missing authorization token",
        },
      },
      401
    );
  }

  const accessToken = authorization.slice("Bearer ".length).trim();

  try {
    const authService = getSupabaseAuthService();
    const result = await authService.getSession(accessToken);

    if (result.error) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: result.error.message,
          },
        },
        401
      );
    }

    return c.json({
      success: true,
      user: result.user,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get user";
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      },
      500
    );
  }
});

authRoutes.get("/callback", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verified - RageBaiter</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; color: #0f172a; }
        .container { text-align: center; background: white; padding: 2rem 3rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 400px; }
        h1 { color: #10b981; margin-bottom: 0.5rem; }
        p { color: #64748b; margin-bottom: 1.5rem; line-height: 1.5; }
        .btn { display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 500; transition: background-color 0.2s; }
        .btn:hover { background-color: #1d4ed8; }
      </style>
    </head>
    <body>
      <div class="container">
        <svg style="width: 64px; height: 64px; color: #10b981; margin: 0 auto 1rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h1>Email Verified!</h1>
        <p>Your email has been successfully verified. You can now close this window and return to the RageBaiter extension to log in.</p>
        <p style="font-size: 0.875rem; color: #94a3b8;">(You may need to click "I've Verified My Email" in the extension)</p>
      </div>
    </body>
    </html>
  `);
});

export const createAuthRoutes = () => authRoutes;
export { authRoutes };
export default authRoutes;
