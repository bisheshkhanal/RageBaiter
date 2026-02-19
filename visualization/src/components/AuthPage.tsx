import { useState } from "react";
import { supabase } from "../lib/supabase";

type AuthMode = "login" | "signup";

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    if (!supabase) {
      setError("Supabase client not configured");
      setLoading(false);
      return;
    }

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) {
          setError(signUpError.message);
        } else {
          setSuccess("Account created! Check your email to confirm, then log in.");
          setMode("login");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
        }
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center w-full h-full bg-[#06060f]">
      <div
        className="relative w-full max-w-md p-8"
        style={{
          background: "rgba(15, 15, 30, 0.85)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "20px",
          boxShadow: "0 0 60px rgba(99, 102, 241, 0.15), 0 0 100px rgba(139, 92, 246, 0.1)",
        }}
      >
        <div
          className="absolute -inset-px rounded-[20px] opacity-50"
          style={{
            background:
              "linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, transparent 50%, rgba(139, 92, 246, 0.15) 100%)",
            maskImage: "linear-gradient(135deg, black 0%, transparent 50%, black 100%)",
            WebkitMaskImage: "linear-gradient(135deg, black 0%, transparent 50%, black 100%)",
          }}
        />

        <div className="relative z-10">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white/90">RageBaiter</h1>
            <p className="mt-2 text-sm text-white/40">
              {mode === "login" ? "Sign in to your dashboard" : "Create your account"}
            </p>
          </div>

          <div className="flex mb-6 p-1 rounded-lg bg-white/5">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all duration-200 ${
                mode === "login" ? "bg-white/10 text-white/90" : "text-white/40 hover:text-white/60"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all duration-200 ${
                mode === "signup"
                  ? "bg-white/10 text-white/90"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 px-4 py-3 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block mb-2 text-xs font-medium text-white/50 uppercase tracking-wider"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 text-white/90 bg-white/5 border border-white/10 rounded-lg outline-none transition-all duration-200 focus:border-indigo-500/50 focus:bg-white/[0.07] focus:shadow-[0_0_20px_rgba(99,102,241,0.15)]"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block mb-2 text-xs font-medium text-white/50 uppercase tracking-wider"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="w-full px-4 py-3 text-white/90 bg-white/5 border border-white/10 rounded-lg outline-none transition-all duration-200 focus:border-indigo-500/50 focus:bg-white/[0.07] focus:shadow-[0_0_20px_rgba(99,102,241,0.15)]"
                placeholder={
                  mode === "login" ? "Enter your password" : "Create a password (6+ chars)"
                }
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg transition-all duration-200 hover:from-indigo-500 hover:to-violet-500 hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Processing...
                </span>
              ) : mode === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
