// Pure logic for browse/home — no React, no network. Everything here is
// covered by vitest (features/browse/__tests__/logic.test.ts).

import type { Locale } from '../../i18n';
import type { WorkerCardProps } from '../../components/WorkerCard';
import type {
  Category,
  ChecklistLike,
  NearbyWorkerRow,
  WorkerListRow,
} from './types';

// ---------------------------------------------------------------------------
// Search input (repo law: fuzzy input is LENGTH-BOUNDED — an unbounded
// similarity/ILIKE scan is a DoS vector and a hang for a user with a typo).
// ---------------------------------------------------------------------------

export const SEARCH_MIN_LEN = 2;
export const SEARCH_MAX_LEN = 40;

/**
 * Bound and escape a user search term for an ILIKE query.
 * - trims, hard-caps at SEARCH_MAX_LEN chars BEFORE anything else
 * - returns null when too short to search (< SEARCH_MIN_LEN)
 * - escapes ILIKE wildcards (%, _) and backslash so user input can never
 *   change the pattern's meaning
 */
export function sanitizeSearchTerm(raw: string): string | null {
  const bounded = raw.trim().slice(0, SEARCH_MAX_LEN).trim();
  if (bounded.length < SEARCH_MIN_LEN) return null;
  return bounded.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function categoryName(
  category: Pick<Category, 'name_am' | 'name_en'>,
  locale: Locale,
): string {
  return locale === 'am' ? category.name_am : category.name_en;
}

/** Client-side category filter for the Browse search box (am + en + slug). */
export function categoryMatchesQuery(
  category: Pick<Category, 'slug' | 'name_am' | 'name_en'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    category.name_am.toLowerCase().includes(q) ||
    category.name_en.toLowerCase().includes(q) ||
    category.slug.toLowerCase().includes(q)
  );
}

// ---------------------------------------------------------------------------
// Neighborhoods (SPEC launch list). `value` is the exact string stored in
// worker_profiles.neighborhood / jobs.service_neighborhood — display labels
// are looked up per locale, values are never translated.
// ---------------------------------------------------------------------------

export interface Neighborhood {
  value: string;
  am: string;
  en: string;
}

export const NEIGHBORHOODS: readonly Neighborhood[] = [
  { value: 'Bole', am: 'ቦሌ', en: 'Bole' },
  { value: 'Kazanchis', am: 'ካዛንቺስ', en: 'Kazanchis' },
  { value: 'CMC', am: 'ሲኤምሲ', en: 'CMC' },
  { value: 'Sarbet', am: 'ሳርቤት', en: 'Sarbet' },
  { value: 'Piazza', am: 'ፒያሳ', en: 'Piazza' },
  { value: 'Kirkos', am: 'ቂርቆስ', en: 'Kirkos' },
  { value: 'Yeka', am: 'የካ', en: 'Yeka' },
];

/** Localized display for a stored neighborhood value (falls back to raw data). */
export function neighborhoodLabel(
  value: string | null | undefined,
  locale: Locale,
): string {
  if (!value) return '';
  const known = NEIGHBORHOODS.find((n) => n.value === value);
  return known ? (locale === 'am' ? known.am : known.en) : value;
}

// ---------------------------------------------------------------------------
// Worker card mapping
// ---------------------------------------------------------------------------

/** rating 0 with 0 reviews means UNRATED (renders as —), never “0.0 stars”. */
export function displayRating(
  ratingAvg: number | null | undefined,
  reviewCount: number,
): number | null {
  if (reviewCount <= 0 || ratingAvg == null) return null;
  return Number(ratingAvg);
}

export function workerCardFromListRow(row: WorkerListRow): WorkerCardProps {
  return {
    id: row.user_id,
    name: row.profiles.display_name,
    avatarUrl: row.profiles.avatar_url,
    verificationLevel: row.verification_level,
    ratingAvg: displayRating(row.rating_avg, row.review_count),
    reviewCount: row.review_count,
    jobsCompleted: row.jobs_completed,
    priceMinCents: row.price_min_cents,
    priceMaxCents: row.price_max_cents,
    availability: row.availability_status,
  };
}

export function workerCardFromNearbyRow(row: NearbyWorkerRow): WorkerCardProps {
  return {
    id: row.worker_id,
    name: row.display_name,
    avatarUrl: row.avatar_url,
    verificationLevel: row.verification_level,
    ratingAvg: displayRating(row.rating_avg, row.review_count),
    reviewCount: row.review_count,
    jobsCompleted: row.jobs_completed,
    priceMinCents: row.price_min_cents,
    priceMaxCents: row.price_max_cents,
    distanceKm: row.distance_m / 1000,
    availability: row.availability_status,
  };
}

/**
 * Merge the nearby (GPS) result with the full category list. Proximity is a
 * BIAS, never a filter (repo law 3): workers outside the radius or without a
 * stored location are never hidden — they land in `rest`, shown below the
 * nearby section. Order of both inputs is preserved.
 */
export function splitByNearby(
  nearby: readonly NearbyWorkerRow[],
  all: readonly WorkerListRow[],
): { near: NearbyWorkerRow[]; rest: WorkerListRow[] } {
  const nearIds = new Set(nearby.map((row) => row.worker_id));
  return {
    near: [...nearby],
    rest: all.filter((row) => !nearIds.has(row.user_id)),
  };
}

// ---------------------------------------------------------------------------
// Ratings breakdown
// ---------------------------------------------------------------------------

export interface RatingBucket {
  star: 1 | 2 | 3 | 4 | 5;
  count: number;
  /** 0–100, rounded. 0 when there are no ratings at all. */
  pct: number;
}

/** Buckets ratings 5→1 for the breakdown bars. Ignores out-of-range values. */
export function ratingBreakdown(ratings: readonly number[]): RatingBucket[] {
  const counts: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  let total = 0;
  for (const r of ratings) {
    if (r === 1 || r === 2 || r === 3 || r === 4 || r === 5) {
      counts[r] += 1;
      total += 1;
    }
  }
  return ([5, 4, 3, 2, 1] as const).map((star) => ({
    star,
    count: counts[star],
    pct: total === 0 ? 0 : Math.round((counts[star] / total) * 100),
  }));
}

// ---------------------------------------------------------------------------
// Package checklist (jsonb: array of {am,en} pairs in the seed; be defensive
// about anything else so a bad row can never crash a page).
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  am: string;
  en: string;
}

export function parseChecklist(value: ChecklistLike): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const items: ChecklistItem[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      if (entry) items.push({ am: entry, en: entry });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const am = typeof record.am === 'string' ? record.am : '';
      const en = typeof record.en === 'string' ? record.en : '';
      if (am || en) items.push({ am: am || en, en: en || am });
    }
  }
  return items;
}

export function checklistText(item: ChecklistItem, locale: Locale): string {
  return locale === 'am' ? item.am : item.en;
}

// ---------------------------------------------------------------------------
// Deep link into the post-job flow ('Request booking' on the worker page).
// The jobs feature reads `worker` and `category` from the query string.
// ---------------------------------------------------------------------------

export function postJobDeepLink(
  workerId: string,
  categorySlug: string | null,
): string {
  const params = new URLSearchParams();
  params.set('worker', workerId);
  if (categorySlug) params.set('category', categorySlug);
  return `/post?${params.toString()}`;
}

/** First category of a worker, used to prefill the post-job deep link. */
export function primaryCategory(categories: readonly string[]): string | null {
  return categories.length > 0 ? categories[0] : null;
}
