import { describe, expect, it } from 'vitest';
import {
  GREETING_KEY,
  YOUR_WORKERS_RAIL_CAP,
  categoryNamesFor,
  greetingSlot,
  rankAvailableNow,
  savedRailCards,
} from '../logic';
import { lookupMessage, type MessageKey } from '../../../i18n';
import type { BadgeLevel } from '../../browse/types';
import type { SavedWorkerRow } from '../../profile/types';

describe('greetingSlot', () => {
  it('boundaries: 5 starts morning, 12 starts afternoon, 18 starts evening', () => {
    expect(greetingSlot(4)).toBe('evening');
    expect(greetingSlot(5)).toBe('morning');
    expect(greetingSlot(11)).toBe('morning');
    expect(greetingSlot(12)).toBe('afternoon');
    expect(greetingSlot(17)).toBe('afternoon');
    expect(greetingSlot(18)).toBe('evening');
    expect(greetingSlot(23)).toBe('evening');
    expect(greetingSlot(0)).toBe('evening');
  });

  it('never crashes on garbage input', () => {
    expect(greetingSlot(Number.NaN)).toBe('evening');
    expect(greetingSlot(Infinity)).toBe('evening');
  });

  it('every greeting key resolves in BOTH locales (no missing-key leaks)', () => {
    for (const key of Object.values(GREETING_KEY)) {
      expect(lookupMessage('am', key)).toBeTruthy();
      expect(lookupMessage('en', key)).toBeTruthy();
    }
  });
});

function worker(
  user_id: string,
  badge_level: BadgeLevel,
  rating_avg: number,
) {
  return { user_id, badge_level, rating_avg };
}

describe('rankAvailableNow', () => {
  it('ranks badge_level first (top beats a higher-rated new worker)', () => {
    const ranked = rankAvailableNow([
      worker('a', 'new', 5.0),
      worker('b', 'top', 3.1),
    ]);
    expect(ranked.map((w) => w.user_id)).toEqual(['b', 'a']);
  });

  it('rating breaks a badge tie; STABLE user_id breaks a full tie', () => {
    const ranked = rankAvailableNow([
      worker('c', 'pro', 4.2),
      worker('b', 'pro', 4.8),
      worker('a', 'pro', 4.2),
    ]);
    expect(ranked.map((w) => w.user_id)).toEqual(['b', 'a', 'c']);
  });

  it('covers the full badge ladder in enum order, not alphabetical order', () => {
    // Alphabetical would be: new < pro < rising < top < trusted — WRONG.
    const ranked = rankAvailableNow([
      worker('1', 'rising', 0),
      worker('2', 'top', 0),
      worker('3', 'new', 0),
      worker('4', 'trusted', 0),
      worker('5', 'pro', 0),
    ]);
    expect(ranked.map((w) => w.badge_level)).toEqual([
      'top',
      'pro',
      'trusted',
      'rising',
      'new',
    ]);
  });

  it('does not mutate its input and survives garbage ratings', () => {
    const input = [
      worker('a', 'new', Number.NaN),
      worker('b', 'new', 1),
    ];
    const snapshot = input.map((w) => w.user_id);
    const ranked = rankAvailableNow(input);
    expect(input.map((w) => w.user_id)).toEqual(snapshot);
    // NaN coalesces to 0, so the rated worker wins.
    expect(ranked[0].user_id).toBe('b');
  });

  it('empty input returns an empty array (no crash)', () => {
    expect(rankAvailableNow([])).toEqual([]);
  });
});

describe('categoryNamesFor', () => {
  const catalog = [
    { slug: 'home-cleaning', name_am: 'የቤት ጽዳት', name_en: 'Home Cleaning' },
    { slug: 'tutors', name_am: 'የቤት አስጠኚ', name_en: 'Tutors' },
  ];

  it('resolves slugs per locale, preserving input order', () => {
    expect(categoryNamesFor(['tutors', 'home-cleaning'], catalog, 'am')).toEqual(
      ['የቤት አስጠኚ', 'የቤት ጽዳት'],
    );
    expect(categoryNamesFor(['tutors', 'home-cleaning'], catalog, 'en')).toEqual(
      ['Tutors', 'Home Cleaning'],
    );
  });

  it('unknown slug falls back to the raw slug — bad data never blanks a card', () => {
    expect(categoryNamesFor(['ghost-category'], catalog, 'am')).toEqual([
      'ghost-category',
    ]);
  });

  it('empty inputs return empty output', () => {
    expect(categoryNamesFor([], catalog, 'am')).toEqual([]);
    expect(categoryNamesFor(['tutors'], [], 'en')).toEqual(['tutors']);
  });
});

// ---------------------------------------------------------------------------
// N2c — savedRailCards
// ---------------------------------------------------------------------------
function savedRow(
  workerId: string,
  overrides: Partial<SavedWorkerRow['worker_profiles']> = {},
): SavedWorkerRow {
  return {
    worker_id: workerId,
    created_at: '2026-08-27T10:00:00Z',
    worker_profiles: {
      user_id: workerId,
      availability_status: 'available_now',
      price_min_cents: 20000,
      price_max_cents: 35000,
      rating_avg: 4.5,
      review_count: 6,
      jobs_completed: 8,
      verification_level: 'id_verified',
      profiles: { display_name: `Worker ${workerId}`, avatar_url: null },
      ...overrides,
    },
  };
}

describe('savedRailCards', () => {
  it('maps every card field from the joined row', () => {
    const [card] = savedRailCards([savedRow('w1')]);
    expect(card).toEqual({
      id: 'w1',
      name: 'Worker w1',
      avatarUrl: null,
      verificationLevel: 'id_verified',
      ratingAvg: 4.5,
      reviewCount: 6,
      jobsCompleted: 8,
      priceMinCents: 20000,
      priceMaxCents: 35000,
      availability: 'available_now',
    });
  });

  it('caps at YOUR_WORKERS_RAIL_CAP (5) preserving input order — never re-sorts', () => {
    const rows = ['f', 'a', 'z', 'b', 'y', 'c', 'x'].map((id) => savedRow(id));
    const cards = savedRailCards(rows);
    expect(cards).toHaveLength(YOUR_WORKERS_RAIL_CAP);
    // Input order (recency from the query) survives — alphabetical would be
    // ['a','b','c','f','x'] which is exactly the repo-law-1 sin.
    expect(cards.map((c) => c.id)).toEqual(['f', 'a', 'z', 'b', 'y']);
  });

  it('zero reviews → null rating (unrated shows —, never 0.0)', () => {
    const [card] = savedRailCards([
      savedRow('w1', { rating_avg: 0, review_count: 0 }),
    ]);
    expect(card.ratingAvg).toBeNull();
  });

  it('empty input → empty output (rail renders nothing)', () => {
    expect(savedRailCards([])).toEqual([]);
  });
});

describe('home/browse card i18n keys', () => {
  const NEW_KEYS: readonly MessageKey[] = [
    'home.heroSubline',
    'home.postJobCardTitle',
    'home.postJobCardBody',
    'home.errandsCardTitle',
    'home.errandsCardBody',
    'home.searchPlaceholder',
    'browse.priceFromShort',
    // N2c saved rail + N5 badge sheet / review provenance
    'home.yourWorkersSection',
    'browse.reviewsProvenance',
    'browse.badgeSheetTitle',
    'browse.badgeSheetCheckedTitle',
    'browse.badgeSheetNotCheckedTitle',
    'browse.badgeSheetBasicChecked',
    'browse.badgeSheetBasicNotId',
    'browse.badgeSheetIdChecked1',
    'browse.badgeSheetIdChecked2',
    'browse.badgeSheetFaydaChecked',
    'browse.badgeSheetProChecked',
    'browse.badgeSheetNotQuality',
    'browse.badgeSheetMeetFirst',
    'browse.badgeSheetDocsPrivate',
  ];

  it('every new key resolves in BOTH locales (no missing-key leaks)', () => {
    for (const key of NEW_KEYS) {
      expect(lookupMessage('am', key)).toBeTruthy();
      expect(lookupMessage('en', key)).toBeTruthy();
    }
  });

  it('am strings are real Amharic (Ethiopic script), never pasted English', () => {
    const ETHIOPIC = /[ሀ-፿]/;
    for (const key of NEW_KEYS.filter((k) => k !== 'browse.priceFromShort')) {
      expect(lookupMessage('am', key)).toMatch(ETHIOPIC);
    }
  });
});
