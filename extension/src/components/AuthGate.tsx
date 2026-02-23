import React, { useEffect, useState } from "react";

type AuthGateProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type AuthMode = "login" | "signup" | "verify_email";

export const AuthGate: React.FC<AuthGateProps> = ({ children, fallback }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const stored = await chrome.storage.local.get(["authToken", "accessToken"]);
        const hasToken = Boolean(stored.authToken || stored.accessToken);
        setIsAuthenticated(hasToken);
      } catch (err) {
        console.error("[AuthGate] Failed to check auth status:", err);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName === "local" && (changes.authToken || changes.accessToken)) {
        const newToken = changes.authToken?.newValue || changes.accessToken?.newValue;
        setIsAuthenticated(Boolean(newToken));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Please enter email and password");
      return;
    }

    setIsSubmitting(true);

    try {
      const stored = await chrome.storage.local.get(["backendUrl"]);
      const backendUrl = stored.backendUrl || "http://localhost:3001";

      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";

      const response = await fetch(`${backendUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error?.message || `${mode === "login" ? "Login" : "Signup"} failed`);
        return;
      }

      if (data.session?.accessToken) {
        await chrome.storage.local.set({
          authToken: data.session.accessToken,
          refreshToken: data.session.refreshToken,
        });
        setIsAuthenticated(true);
      } else if (mode === "signup") {
        setMode("verify_email");
        setError(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-lg border border-slate-200 shadow-sm m-4 max-w-md mx-auto">
        <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
            />
          </svg>
        </div>

        <h2 className="text-xl font-semibold text-slate-800 mb-1">
          {mode === "login"
            ? "Welcome to RageBaiter"
            : mode === "signup"
              ? "Create Account"
              : "Check Your Email"}
        </h2>
        <p className="text-slate-500 text-sm mb-4 text-center">
          {mode === "login"
            ? "Sign in to track your political compass journey"
            : mode === "signup"
              ? "Sign up to get started with personalized interventions"
              : `We sent a confirmation link to ${email}. Please click it to verify your account.`}
        </p>

        {mode === "verify_email" ? (
          <div className="w-full space-y-3">
            <button
              type="button"
              onClick={() => setMode("login")}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors shadow-sm"
            >
              I've Verified My Email
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="w-full py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-md transition-colors shadow-sm"
            >
              Change Email Address
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full space-y-3">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
              />
            </div>

            {error && (
              <p
                className={`text-sm ${error.includes("created") ? "text-green-600" : "text-red-600"}`}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
        )}

        {mode !== "verify_email" && (
          <div className="mt-4 text-sm text-slate-600">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
};
