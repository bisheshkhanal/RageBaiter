import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase?.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    // Subscribe to auth state changes
    const { data } = supabase?.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    }) ?? { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
  };

  return {
    session,
    loading,
    user: session?.user ?? null,
    signOut,
    isAuthenticated: !!session,
  };
}

export type AuthState = {
  session: Session | null;
  loading: boolean;
  user: User | null;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
};
