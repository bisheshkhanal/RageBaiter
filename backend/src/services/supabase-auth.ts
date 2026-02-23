type SupabaseAuthConfig = {
  supabaseUrl?: string;
  anonKey?: string;
};

type SupabaseUser = {
  id: string;
  email: string;
  created_at: string;
};

type SupabaseSession = {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: SupabaseUser;
};

type SupabaseAuthResponse = {
  user: SupabaseUser | null;
  session: SupabaseSession | null;
  error?: {
    message: string;
    status_code: number;
  };
};

type SupabaseErrorResponse = {
  message: string;
  status_code: number;
};

const getEnv = (key: string): string | undefined => {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    key
  ];
};

const buildHeaders = (anonKey: string): Record<string, string> => ({
  "Content-Type": "application/json",
  apikey: anonKey,
});

const handleAuthResponse = async (response: Response): Promise<SupabaseAuthResponse> => {
  const data = await response.json();

  if (!response.ok) {
    const error = data as SupabaseErrorResponse;
    return {
      user: null,
      session: null,
      error: {
        message: error.message || "Authentication failed",
        status_code: response.status,
      },
    };
  }

  return data as SupabaseAuthResponse;
};

export const createSupabaseAuthService = (config: SupabaseAuthConfig = {}) => {
  const supabaseUrl = config.supabaseUrl ?? getEnv("SUPABASE_URL") ?? "";
  const anonKey = config.anonKey ?? getEnv("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  const baseUrl = `${supabaseUrl}/auth/v1`;

  const signUp = async (email: string, password: string): Promise<SupabaseAuthResponse> => {
    const backendUrl = getEnv("BACKEND_API_URL") || "http://localhost:3001";
    const redirectUrl = encodeURIComponent(`${backendUrl}/api/auth/callback`);

    const response = await fetch(`${baseUrl}/signup?redirect_to=${redirectUrl}`, {
      method: "POST",
      headers: buildHeaders(anonKey),
      body: JSON.stringify({
        email,
        password,
      }),
    });

    return handleAuthResponse(response);
  };

  const signInWithPassword = async (
    email: string,
    password: string
  ): Promise<SupabaseAuthResponse> => {
    const response = await fetch(`${baseUrl}/token?grant_type=password`, {
      method: "POST",
      headers: buildHeaders(anonKey),
      body: JSON.stringify({ email, password }),
    });

    return handleAuthResponse(response);
  };

  const signOut = async (accessToken: string): Promise<{ error?: string }> => {
    const response = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: {
        ...buildHeaders(anonKey),
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const data = (await response.json()) as SupabaseErrorResponse;
      return { error: data.message || "Logout failed" };
    }

    return {};
  };

  const getSession = async (accessToken: string): Promise<SupabaseAuthResponse> => {
    const response = await fetch(`${baseUrl}/user`, {
      method: "GET",
      headers: {
        ...buildHeaders(anonKey),
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as SupabaseErrorResponse;
      return {
        user: null,
        session: null,
        error: {
          message: error.message || "Failed to get session",
          status_code: response.status,
        },
      };
    }

    return {
      user: data as SupabaseUser,
      session: null,
    };
  };

  const refreshSession = async (refreshToken: string): Promise<SupabaseAuthResponse> => {
    const response = await fetch(`${baseUrl}/token?grant_type=refresh_token`, {
      method: "POST",
      headers: buildHeaders(anonKey),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    return handleAuthResponse(response);
  };

  return {
    signUp,
    signInWithPassword,
    signOut,
    getSession,
    refreshSession,
  };
};

export type SupabaseAuthService = ReturnType<typeof createSupabaseAuthService>;

let defaultService: SupabaseAuthService | null = null;

export const getSupabaseAuthService = (): SupabaseAuthService => {
  if (!defaultService) {
    defaultService = createSupabaseAuthService();
  }
  return defaultService;
};
