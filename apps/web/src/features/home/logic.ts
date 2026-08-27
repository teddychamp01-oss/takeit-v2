// Pure logic for the home screen — covered by vitest.

import type { Locale, MessageKey } from '../../i18n';
import { categoryName, displayRating } from '../browse/logic';
import type { BadgeLevel, Category, WorkerListRow } from '../browse/types';
import type { WorkerCardProps } from '../../components/WorkerCard';
import type { SavedWorkerRow } from '../profile/types';

export type GreetingSlot = 'morning' | 'afternoon' | 'evening';

/**
 * Time-of-day greeting slot from a 0–23 hour:
 * 05:00–11:59 morning, 12:00–17:59 afternoon, everything else evening
 * (Amharic greetings are time-of-day specific: እንደምን አደሩ / ዋሉ / አመሹ).
 */
export function greetingSlot(hour: number): GreetingSlot {
  if (!Number.isFinite(hour)) return 'evening';
  const h = Math.floor(hour);
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'evening';
}

export const GREETING_KEY: Record<GreetingSlot, MessageKey> = {
  morning: 'home.greetingMorning',
  afternoon: 'home.greetingAfternoon',
  evening: 'home.greetingEvening',
};

// ---------------------------------------------------------------------------
// 'Available Now' rail ranking (v1-adoption plan T2): curated badge tier
// first, then rating, then a STABLE user_id tiebreak — geography (or anything
// else) is never decided by the alphabet (repo law 1). NOT a featured flag —
// badge_level is the measured curated tier.
// ---------------------------------------------------------------------------

const BADGE_RANK: Record<BadgeLevel, number> = {
  new: 0,
  rising: 1,
  trusted: 2,
  pro: 3,
  top: 4,
};

type RankableWorker = Pick<
  WorkerListRow,
  'user_id' | 'badge_level' | 'rating_avg'
>;

/** Coalesce every nullable/garbage input — a NaN comparator corrupts a sort. */
function safeRating(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sort for the home rail: badge_level desc, rating_avg desc, user_id asc.
 * Pure — returns a new array, never mutates the input.
 */
export function rankAvailableNow<T extends RankableWorker>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const badge =
      (BADGE_RANK[b.badge_level] ?? -1) - (BADGE_RANK[a.badge_level] ?? -1);
    if (badge !== 0) return badge;
    const rating = safeRating(b.rating_avg) - safeRating(a.rating_avg);
    if (rating !== 0) return rating;
    // Stable id tiebreak — plain code-unit compare, NOT locale-dependent.
    return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// N2c — 'Your workers' saved rail (rebook loop). Input rows arrive from
// fetchSavedWorkers already ordered most-recently-saved first with a STABLE
// worker_id tiebreak — never alphabetical, never geographic (repo law 1);
// this mapper only caps and reshapes, it never re-orders.
// ---------------------------------------------------------------------------

export const YOUR_WORKERS_RAIL_CAP = 5;

/**
 * Map saved-worker rows to compact WorkerCard props, capped for the rail.
 * Preserves input order. rating 0 with 0 reviews maps to null (unrated shows
 * as —, never "0.0") via displayRating.
 */
export function savedRailCards(
  rows: readonly SavedWorkerRow[],
  cap: number = YOUR_WORKERS_RAIL_CAP,
): WorkerCardProps[] {
  return rows.slice(0, Math.max(0, cap)).map((row) => {
    const wp = row.worker_profiles;
    return {
      id: wp.user_id,
      name: wp.profiles.display_name,
      avatarUrl: wp.profiles.avatar_url,
      verificationLevel: wp.verification_level,
      ratingAvg: displayRating(wp.rating_avg, wp.review_count),
      reviewCount: wp.review_count,
      jobsCompleted: wp.jobs_completed,
      priceMinCents: wp.price_min_cents,
      priceMaxCents: wp.price_max_cents,
      availability: wp.availability_status,
    };
  });
}

// ---------------------------------------------------------------------------
// Category slug -> localized display name (for the WorkerCard one-liner).
// Pages resolve slugs before passing display strings into cards — the same
// convention JobCard documents.
// ---------------------------------------------------------------------------

/**
 * Map category slugs to localized names via the loaded catalog. An unknown
 * slug falls back to the raw slug — bad data must never blank or crash a card.
 */
export function categoryNamesFor(
  slugs: readonly string[],
  categories: readonly Pick<Category, 'slug' | 'name_am' | 'name_en'>[],
  locale: Locale,
): string[] {
  return slugs.map((slug) => {
    const found = categories.find((category) => category.slug === slug);
    return found ? categoryName(found, locale) : slug;
  });
}
