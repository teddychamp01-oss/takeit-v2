import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Browser client. Uses the PUBLIC anon key only — RLS is the security
// boundary. The service-role key must never appear anywhere in this app
// (SPEC R5); if you think you need it, the logic belongs in an edge function.

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    '[takeit] Missing VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env at the repo root and fill in the VITE_ values ' +
      '(anon key ONLY — never the service-role key).',
  );
}

export const supabase = createClient<Database>(url, anonKey);
