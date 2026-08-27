// Supabase queries for browse/home. Uses the EXACT table/column/RPC names
// from supabase/migrations (audited — R1). RLS reality this code must respect:
//   * service_categories / service_packages: readable by anon + authenticated
//   * worker_profiles / profiles / jobs / reviews / saved_workers: require a
//     signed-in user (no anon grant) — callers gate these on the session
//   * guarantors: visible only to the worker themself and ops/admin, so a
//     count read by anyone else is legitimately 0
//
// Ordering law (repo law 1): geography is NEVER decided by the alphabet.
// Worker lists order by verification_level (enum order, most verified first)
// with a STABLE user_id tiebreak; nearby ordering (distance, then user_id)
// happens inside the nearby_workers RPC itself.

import { supabase } from '../../lib/supabase';
import { sanitizeSearchTerm } from './logic';
import type {
  CappedList,
  Category,
  JobTeaserRow,
  NearbyWorkerRow,
  PackageRow,
  ReviewRow,
  WorkerDetailRow,
  WorkerListRow,
} from './types';

const WORKER_LIST_SELECT =
  'user_id, neighborhood, categories, availability_status, price_min_cents, ' +
  'price_max_cents, rating_avg, review_count, jobs_completed, badge_level, ' +
  'verification_level, profiles!inner(display_name, avatar_url)';

export const CATEGORY_WORKERS_LIMIT = 50;
export const SEARCH_WORKERS_LIMIT = 30;
export const AVAILABLE_NOW_LIMIT = 12;
export const REVIEWS_PAGE_LIMIT = 20;
export const RATINGS_SAMPLE_LIMIT = 500;
/** Wide default: covers all of Addis Ababa. Proximity is a bias, not a fence. */
export const NEARBY_RADIUS_KM = 25;

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('service_categories')
    .select('slug, name_am, name_en, icon, sort, active, min_verification_level')
    .eq('active', true)
    .order('sort', { ascending: true })
    .order('slug', { ascending: true }); // stable tiebreak
  if (error) throw error;
  return (data ?? []) as unknown as Category[];
}

export async function fetchCategory(slug: string): Promise<Category | null> {
  const { data, error } = await supabase
    .from('service_categories')
    .select('slug, name_am, name_en, icon, sort, active, min_verification_level')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Category) ?? null;
}

export async function fetchPackagesByCategory(
  slug: string,
): Promise<PackageRow[]> {
  const { data, error } = await supabase
    .from('service_packages')
    .select(
      'id, category_slug, name_am, name_en, description, checklist, base_price_cents, duration_min',
    )
    .eq('category_slug', slug)
    .eq('active', true)
    .order('base_price_cents', { ascending: true })
    .order('id', { ascending: true }); // stable tiebreak
  if (error) throw error;
  return (data ?? []) as unknown as PackageRow[];
}

export async function fetchWorkerPackages(
  categories: string[],
): Promise<PackageRow[]> {
  if (categories.length === 0) return [];
  const { data, error } = await supabase
    .from('service_packages')
    .select(
      'id, category_slug, name_am, name_en, description, checklist, base_price_cents, duration_min',
    )
    .in('category_slug', categories)
    .eq('active', true)
    .order('category_slug', { ascending: true })
    .order('base_price_cents', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PackageRow[];
}

/**
 * Workers in a category, most-verified first, stable-id tiebreak.
 * `neighborhood` is a user-chosen filter (never a hidden default).
 * Returns the RLS-visible total so a hit cap is reported, never silent.
 */
export async function fetchWorkersByCategory(
  slug: string,
  neighborhood: string | null,
): Promise<CappedList<WorkerListRow>> {
  let query = supabase
    .from('worker_profiles')
    .select(WORKER_LIST_SELECT, { count: 'exact' })
    .contains('categories', [slug]);
  if (neighborhood) query = query.eq('neighborhood', neighborhood);
  const { data, error, count } = await query
    .order('verification_level', { ascending: false })
    .order('user_id', { ascending: true })
    .limit(CATEGORY_WORKERS_LIMIT);
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as WorkerListRow[],
    total: count ?? null,
  };
}

/**
 * PostGIS proximity list via the nearby_workers RPC. Call shape matches the
 * SQL signature nearby_workers(lat, lng, category, radius_km) exactly —
 * all four arguments named, as PostgREST resolves them.
 */
export async function fetchNearbyWorkers(
  lat: number,
  lng: number,
  category: string,
  radiusKm: number = NEARBY_RADIUS_KM,
): Promise<NearbyWorkerRow[]> {
  const { data, error } = await supabase.rpc('nearby_workers', {
    lat,
    lng,
    category,
    radius_km: radiusKm,
  });
  if (error) throw error;
  return (data ?? []) as unknown as NearbyWorkerRow[];
}

/**
 * Name search (length-bounded upstream by sanitizeSearchTerm — repo law 4).
 * Returns null when the term is too short to search at all.
 */
export async function searchWorkersByName(
  rawTerm: string,
): Promise<CappedList<WorkerListRow> | null> {
  const term = sanitizeSearchTerm(rawTerm);
  if (term === null) return null;
  const pattern = `%${term}%`;
  const { data, error, count } = await supabase
    .from('worker_profiles')
    .select(WORKER_LIST_SELECT, { count: 'exact' })
    .ilike('profiles.display_name', pattern)
    .order('verification_level', { ascending: false })
    .order('user_id', { ascending: true })
    .limit(SEARCH_WORKERS_LIMIT);
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as WorkerListRow[],
    total: count ?? null,
  };
}

/** Home: workers with availability_status = 'available_now', verified first. */
export async function fetchAvailableNowWorkers(): Promise<WorkerListRow[]> {
  const { data, error } = await supabase
    .from('worker_profiles')
    .select(WORKER_LIST_SELECT)
    .eq('availability_status', 'available_now')
    .order('verification_level', { ascending: false })
    .order('user_id', { ascending: true })
    .limit(AVAILABLE_NOW_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as WorkerListRow[];
}

/** Home: newest open jobs the signed-in user is allowed to see (RLS decides). */
export async function fetchOpenJobsTeaser(): Promise<JobTeaserRow[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, title, category_slug, service_neighborhood, budget_cents, created_at, status',
    )
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }) // stable tiebreak
    .limit(5);
  if (error) throw error;
  return (data ?? []) as unknown as JobTeaserRow[];
}

export async function fetchWorkerDetail(
  workerId: string,
): Promise<WorkerDetailRow | null> {
  const { data, error } = await supabase
    .from('worker_profiles')
    .select(
      'user_id, bio, categories, skills, neighborhood, travel_radius_km, ' +
        'availability_status, price_min_cents, price_max_cents, price_type, ' +
        'rating_avg, review_count, jobs_completed, badge_level, ' +
        'verification_level, profiles!inner(display_name, avatar_url, phone_masked)',
    )
    .eq('user_id', workerId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as WorkerDetailRow) ?? null;
}

/** ISO cutoff for the double-blind reveal window (published OR older than 48h). */
export function revealCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
}

/**
 * REVEALED customer→worker reviews only: published, or past the 48h
 * double-blind window. The explicit filter matters because RLS also lets a
 * reviewer see their own unrevealed review — that must not leak into the list.
 */
export async function fetchRevealedReviews(
  workerId: string,
): Promise<CappedList<ReviewRow>> {
  const { data, error, count } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at', { count: 'exact' })
    .eq('reviewee_id', workerId)
    .eq('direction', 'c_to_w')
    .or(`is_published.eq.true,created_at.lte.${revealCutoffIso()}`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(REVIEWS_PAGE_LIMIT);
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as ReviewRow[],
    total: count ?? null,
  };
}

/** Ratings-only sample for the breakdown bars (ints — tiny payload). */
export async function fetchRevealedRatings(
  workerId: string,
): Promise<number[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('reviewee_id', workerId)
    .eq('direction', 'c_to_w')
    .or(`is_published.eq.true,created_at.lte.${revealCutoffIso()}`)
    .limit(RATINGS_SAMPLE_LIMIT);
  if (error) throw error;
  return ((data ?? []) as { rating: number }[]).map((row) => row.rating);
}

/**
 * Verified-guarantor count. NOTE: RLS restricts guarantors to the worker
 * themself + ops/admin, so for everyone else this is 0 — callers must render
 * the count only when it is > 0, never as evidence of absence.
 */
export async function fetchGuarantorCount(workerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('guarantors')
    .select('id', { count: 'exact', head: true })
    .eq('worker_id', workerId)
    .eq('status', 'verified');
  if (error) throw error;
  return count ?? 0;
}

export async function fetchIsSaved(
  customerId: string,
  workerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('saved_workers')
    .select('worker_id')
    .eq('customer_id', customerId)
    .eq('worker_id', workerId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function saveWorker(
  customerId: string,
  workerId: string,
): Promise<void> {
  const { error } = await supabase
    .from('saved_workers')
    .insert({ customer_id: customerId, worker_id: workerId });
  // 23505 = already saved (double-tap) — that is the desired end state.
  if (error && error.code !== '23505') throw error;
}

export async function unsaveWorker(
  customerId: string,
  workerId: string,
): Promise<void> {
  const { error } = await supabase
    .from('saved_workers')
    .delete()
    .eq('customer_id', customerId)
    .eq('worker_id', workerId);
  if (error) throw error;
}
