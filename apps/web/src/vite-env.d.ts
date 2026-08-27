/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (public). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon key (public). NEVER the service-role key (SPEC R5). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Feature flags — absent/anything but 'true'/'1' means OFF. */
  readonly VITE_FEATURE_PAYMENTS_ENABLED?: string;
  readonly VITE_FEATURE_FAYDA_ENABLED?: string;
  /**
   * "Talk to Take It" support entry (N12) — an https t.me/... URL supplied
   * by the founder. Absent/invalid → the SupportLink renders nothing.
   */
  readonly VITE_SUPPORT_TELEGRAM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
