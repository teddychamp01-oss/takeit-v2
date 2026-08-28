import { describe, expect, it } from 'vitest';
import {
  SEARCH_MAX_LEN,
  categoryMatchesQuery,
  displayRating,
  neighborhoodLabel,
  parseChecklist,
  postJobDeepLink,
  primaryCategory,
  ratingBreakdown,
  sanitizeSearchTerm,
  splitByNearby,
  workerCardFromListRow,
  workerCardFromNearbyRow,
  workerCategoriesHint,
} from '../logic';
import type { NearbyWorkerRow, WorkerListRow } from '../types';

// ---------------------------------------------------------------------------
// sanitizeSearchTerm — repo law: fuzzy input is LENGTH-BOUNDED
// ---------------------------------------------------------------------------

describe('sanitizeSearchTerm', () => {
  it('returns null for empty and one-character input', () => {
    expect(sanitizeSearchTerm('')).toBeNull();
    expect(sanitizeSearchTerm('   ')).toBeNull();
    expect(sanitizeSearchTerm('a')).toBeNull();
    expect(sanitizeSearchTerm(' አ ')).toBeNull();
  });

  it('accepts a 2-character term, including Ethiopic script', () => {
    expect(sanitizeSearchTerm('ab')).toBe('ab');
    expect(sanitizeSearchTerm('አበ')).toBe('አበ');
  });

  it('hard-caps length BEFORE anything else', () => {
    const long = 'x'.repeat(500);
    const result = sanitizeSearchTerm(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(SEARCH_MAX_LEN);
  });

  it('escapes ILIKE wildcards and backslash so input cannot widen the scan', () => {
    expect(sanitizeSearchTerm('100%')).toBe('100\\%');
    expect(sanitizeSearchTerm('a_b')).toBe('a\\_b');
    expect(sanitizeSearchTerm('a\\b')).toBe('a\\\\b');
  });

  it('a term of only wildcards does not become an unbounded scan', () => {
    expect(sanitizeSearchTerm('%%')).toBe('\\%\\%');
  });
});

// ---------------------------------------------------------------------------
// categoryMatchesQuery
// ---------------------------------------------------------------------------

describe('categoryMatchesQuery', () => {
  const cat = {
    slug: 'home-cleaning',
    name_am: 'የቤት ጽዳት',
    name_en: 'Home Cleaning',
  };

  it('matches on Amharic name, English name and slug', () => {
    expect(categoryMatchesQuery(cat, 'ጽዳት')).toBe(true);
    expect(categoryMatchesQuery(cat, 'clean')).toBe(true);
    expect(categoryMatchesQuery(cat, 'CLEAN')).toBe(true);
    expect(categoryMatchesQuery(cat, 'home-cl')).toBe(true);
  });

  it('empty query matches everything; non-matching query does not', () => {
    expect(categoryMatchesQuery(cat, '')).toBe(true);
    expect(categoryMatchesQuery(cat, '   ')).toBe(true);
    expect(categoryMatchesQuery(cat, 'ፎቶ')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// neighborhoodLabel — display only; stored values never translated
// ---------------------------------------------------------------------------

describe('neighborhoodLabel', () => {
  it('localizes known neighborhoods', () => {
    expect(neighborhoodLabel('Bole', 'am')).toBe('ቦሌ');
    expect(neighborhoodLabel('Bole', 'en')).toBe('Bole');
  });

  it('falls back to the raw stored value for unknown neighborhoods', () => {
    expect(neighborhoodLabel('Lebu', 'am')).toBe('Lebu');
  });

  it('is empty for null/undefined', () => {
    expect(neighborhoodLabel(null, 'am')).toBe('');
    expect(neighborhoodLabel(undefined, 'en')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// displayRating — an unrated worker is unknown, not 0.0
// ---------------------------------------------------------------------------

describe('displayRating', () => {
  it('returns null when there are no reviews (DB default rating_avg=0)', () => {
    expect(displayRating(0, 0)).toBeNull();
    expect(displayRating(4.5, 0)).toBeNull();
  });

  it('returns the numeric rating when reviews exist', () => {
    expect(displayRating(4.7, 23)).toBe(4.7);
  });
});

// ---------------------------------------------------------------------------
// worker card mapping
// ---------------------------------------------------------------------------

const listRow: WorkerListRow = {
  user_id: 'a0000000-0000-4000-8000-000000000001',
  neighborhood: 'Bole',
  categories: ['repairs-handyman'],
  availability_status: 'available_now',
  price_min_cents: 35000,
  price_max_cents: 90000,
  rating_avg: 4.7,
  review_count: 23,
  jobs_completed: 31,
  badge_level: 'trusted',
  verification_level: 'id_verified',
  profiles: { display_name: 'ተስፋዬ በቀለ', avatar_url: null },
};

const nearbyRow: NearbyWorkerRow = {
  worker_id: 'a0000000-0000-4000-8000-000000000002',
  display_name: 'ሰላም አየለ',
  avatar_url: null,
  neighborhood: 'Kazanchis',
  categories: ['home-cleaning'],
  availability_status: 'available_today',
  price_min_cents: 80000,
  price_max_cents: 300000,
  price_type: 'fixed',
  rating_avg: 4.5,
  review_count: 11,
  jobs_completed: 14,
  badge_level: 'rising',
  verification_level: 'id_verified',
  distance_m: 1595,
  truncated: false,
};

describe('workerCardFromListRow / workerCardFromNearbyRow', () => {
  it('maps a worker_profiles row to WorkerCard props', () => {
    const props = workerCardFromListRow(listRow);
    expect(props.id).toBe(listRow.user_id);
    expect(props.name).toBe('ተስፋዬ በቀለ');
    expect(props.ratingAvg).toBe(4.7);
    expect(props.availability).toBe('available_now');
    expect(props.distanceKm).toBeUndefined();
  });

  it('maps a nearby_workers RPC row, converting distance_m to km', () => {
    const props = workerCardFromNearbyRow(nearbyRow);
    expect(props.id).toBe(nearbyRow.worker_id);
    expect(props.distanceKm).toBeCloseTo(1.595);
    expect(props.verificationLevel).toBe('id_verified');
  });

  it('unrated worker maps to ratingAvg null (renders —, not 0.0)', () => {
    const props = workerCardFromListRow({
      ...listRow,
      rating_avg: 0,
      review_count: 0,
    });
    expect(props.ratingAvg).toBeNull();
  });

  it('carries the raw category slugs as the A13 router-state hint', () => {
    expect(workerCardFromListRow(listRow).categorySlugs).toEqual(
      listRow.categories,
    );
    expect(workerCardFromNearbyRow(nearbyRow).categorySlugs).toEqual(
      nearbyRow.categories,
    );
  });
});

// ---------------------------------------------------------------------------
// workerCategoriesHint (A13) — a HINT off the router state, never trusted.
// The chained fetch must remain the fallback for a cold deep link, so every
// shape that is not an array of strings has to yield "no hint" rather than
// something that could make the packages query fire with garbage.
// ---------------------------------------------------------------------------

describe('workerCategoriesHint', () => {
  it('reads the slugs a worker card put on the state', () => {
    expect(
      workerCategoriesHint({ workerCategories: ['cleaning', 'plumbing'] }),
    ).toEqual(['cleaning', 'plumbing']);
  });

  it('returns [] for a cold deep link or a reload (no state at all)', () => {
    expect(workerCategoriesHint(null)).toEqual([]);
    expect(workerCategoriesHint(undefined)).toEqual([]);
  });

  it('returns [] for state that carries something else entirely', () => {
    expect(workerCategoriesHint({ chatDraft: 'hello' })).toEqual([]);
    expect(workerCategoriesHint('cleaning')).toEqual([]);
    expect(workerCategoriesHint(42)).toEqual([]);
    expect(workerCategoriesHint({ workerCategories: 'cleaning' })).toEqual([]);
    expect(workerCategoriesHint({ workerCategories: null })).toEqual([]);
  });

  it('drops non-string members rather than passing them to the query', () => {
    expect(
      workerCategoriesHint({
        workerCategories: ['cleaning', 7, null, { x: 1 }, 'moving'],
      }),
    ).toEqual(['cleaning', 'moving']);
  });
});

// ---------------------------------------------------------------------------
// splitByNearby — proximity is a BIAS, never a filter
// ---------------------------------------------------------------------------

describe('splitByNearby', () => {
  const farRow: WorkerListRow = {
    ...listRow,
    user_id: 'a0000000-0000-4000-8000-000000000099',
  };
  const nearAsList: WorkerListRow = {
    ...listRow,
    user_id: nearbyRow.worker_id,
  };

  it('workers outside the radius are NEVER hidden — they land in rest', () => {
    const { near, rest } = splitByNearby([nearbyRow], [nearAsList, farRow]);
    expect(near.map((r) => r.worker_id)).toEqual([nearbyRow.worker_id]);
    expect(rest.map((r) => r.user_id)).toEqual([farRow.user_id]);
  });

  it('empty nearby result keeps the full list intact (no-GPS parity)', () => {
    const { near, rest } = splitByNearby([], [nearAsList, farRow]);
    expect(near).toEqual([]);
    expect(rest).toHaveLength(2);
  });

  it('preserves input order in both halves', () => {
    const { rest } = splitByNearby([], [farRow, nearAsList]);
    expect(rest.map((r) => r.user_id)).toEqual([
      farRow.user_id,
      nearAsList.user_id,
    ]);
  });
});

// ---------------------------------------------------------------------------
// ratingBreakdown
// ---------------------------------------------------------------------------

describe('ratingBreakdown', () => {
  it('buckets 5→1 with rounded percentages', () => {
    const buckets = ratingBreakdown([5, 5, 5, 4, 1]);
    expect(buckets.map((b) => b.star)).toEqual([5, 4, 3, 2, 1]);
    expect(buckets[0]).toEqual({ star: 5, count: 3, pct: 60 });
    expect(buckets[1]).toEqual({ star: 4, count: 1, pct: 20 });
    expect(buckets[2]).toEqual({ star: 3, count: 0, pct: 0 });
    expect(buckets[4]).toEqual({ star: 1, count: 1, pct: 20 });
  });

  it('no ratings → all zero, never NaN', () => {
    for (const bucket of ratingBreakdown([])) {
      expect(bucket.count).toBe(0);
      expect(bucket.pct).toBe(0);
    }
  });

  it('ignores out-of-range garbage instead of crashing or skewing', () => {
    const buckets = ratingBreakdown([5, 0, 6, -1, 2.5, Number.NaN]);
    expect(buckets[0]).toEqual({ star: 5, count: 1, pct: 100 });
  });
});

// ---------------------------------------------------------------------------
// parseChecklist — seed shape is [{am,en}]; anything else degrades gracefully
// ---------------------------------------------------------------------------

describe('parseChecklist', () => {
  it('parses the seed {am,en} pair shape', () => {
    const items = parseChecklist([
      { am: 'ወለል መጥረግ', en: 'Sweep floors' },
      { am: 'አቧራ ማራገፍ', en: 'Dust surfaces' },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ am: 'ወለል መጥረግ', en: 'Sweep floors' });
  });

  it('fills a missing locale from the other one', () => {
    expect(parseChecklist([{ am: 'ጽዳት' }])).toEqual([
      { am: 'ጽዳት', en: 'ጽዳት' },
    ]);
    expect(parseChecklist([{ en: 'Clean' }])).toEqual([
      { am: 'Clean', en: 'Clean' },
    ]);
  });

  it('accepts plain strings and drops junk without crashing', () => {
    expect(
      parseChecklist(['item', null, 42, {}, { am: '', en: '' }, undefined]),
    ).toEqual([{ am: 'item', en: 'item' }]);
  });

  it('non-array jsonb → empty list', () => {
    expect(parseChecklist(null)).toEqual([]);
    expect(parseChecklist({ am: 'x' })).toEqual([]);
    expect(parseChecklist('x')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// post-job deep link
// ---------------------------------------------------------------------------

describe('postJobDeepLink / primaryCategory', () => {
  it('builds the prefill link the jobs feature reads', () => {
    expect(postJobDeepLink('abc-123', 'home-cleaning')).toBe(
      '/post?worker=abc-123&category=home-cleaning',
    );
  });

  it('omits category when the worker has none', () => {
    expect(postJobDeepLink('abc-123', null)).toBe('/post?worker=abc-123');
    expect(primaryCategory([])).toBeNull();
  });

  it('URL-encodes values', () => {
    expect(postJobDeepLink('a b', 'c&d')).toBe('/post?worker=a+b&category=c%26d');
  });

  it('primaryCategory picks the first category', () => {
    expect(primaryCategory(['tutors', 'repairs-handyman'])).toBe('tutors');
  });
});
