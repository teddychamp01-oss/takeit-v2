// The saved-workers read, split out of features/profile/api.ts (A10).
//
// A module BOUNDARY, not a reorganisation: YourWorkersRail renders on Home,
// and reaching this query through profile/api.ts pulled that whole module —
// verifications, guarantors, notifications, storage upload, sign-out and the
// worker-profile write path — into Home's cold-load wave for one SELECT.
//
// features/profile/api.ts re-exports both symbols, so existing call sites
// (MePage) are unchanged and either import path is correct.

import { supabase } from '../../lib/supabase';
import type { CappedList, SavedWorkerRow } from './types';

export const SAVED_WORKERS_LIMIT = 50;

export async function fetchSavedWorkers(
  customerId: string,
): Promise<CappedList<SavedWorkerRow>> {
  const { data, error, count } = await supabase
    .from('saved_workers')
    .select(
      'worker_id, created_at, ' +
        'worker_profiles!inner(user_id, availability_status, price_min_cents, ' +
        'price_max_cents, rating_avg, review_count, jobs_completed, ' +
        'verification_level, profiles!inner(display_name, avatar_url))',
      { count: 'exact' },
    )
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .order('worker_id', { ascending: true }) // stable tiebreak
    .limit(SAVED_WORKERS_LIMIT);
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as SavedWorkerRow[],
    total: count ?? null,
  };
}
