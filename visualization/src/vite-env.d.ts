/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_DEMO_AUTH_TOKEN?: string;
  readonly VITE_SUPABASE_FALLBACK_USER_ID?: string;
  readonly VITE_EXTENSION_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
