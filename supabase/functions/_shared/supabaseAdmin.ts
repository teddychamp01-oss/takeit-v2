// Take It v2 — Supabase clients for edge functions.
// R5: SUPABASE_SERVICE_ROLE_KEY comes ONLY from Deno.env (edge secrets set via
// `supabase secrets set` / dashboard). It is never written to code, never
// returned in a response, and never reaches any client bundle.

import { createClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from './dbTypes.ts';

export type AnyClient = ReturnType<typeof createClient<Database>>;

/** Service-role client (bypasses RLS — server-side only). Null if unconfigured. */
export function adminClient(): AnyClient | null {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anon-key client — used only to redeem one-time magiclink token hashes. */
export function anonClient(): AnyClient | null {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
