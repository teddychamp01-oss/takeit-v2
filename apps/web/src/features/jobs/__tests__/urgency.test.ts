// T7 urgency chips + T8 ?category= prefill (v1-adoption plan). The chips
// PRESET the existing date_needed field — no urgency column exists and none
// is added — so the tests pin the exact field values each chip produces, the
// round-trip through deriveTiming (the same derivation JobCard renders), and
// that 'flexible' reaches the RPC payload as an OMITTED date (SQL null).

import { describe, expect, it } from 'vitest';
import { lookupMessage } from '../../../i18n';
import {
  EMPTY_POST_JOB_FORM,
  TIMING_CHIP_KEY,
  URGENCY_PRESETS,
  addDaysIso,
  buildPostJobArgs,
  deriveTiming,
  resolveCategoryPrefill,
  urgencyPresetDate,
  validatePostJobStep,
  type PostJobForm,
} from '../logic';

const TODAY = '2026-08-27';

/** Minimal form that passes review — tests override dateNeeded only. */
function validForm(overrides: Partial<PostJobForm> = {}): PostJobForm {
  return {
    ...EMPTY_POST_JOB_FORM,
    categorySlug: 'home-cleaning',
    title: 'Deep clean my apartment',
    address: 'Bole, near Edna Mall, 4th floor',
    neighborhood: 'Bole',
    ...overrides,
  };
}

describe('urgencyPresetDate', () => {
  it('today → today’s date', () => {
    expect(urgencyPresetDate('today', TODAY)).toBe(TODAY);
  });

  it('this_week → the last day of the 7-day window (picker default)', () => {
    expect(urgencyPresetDate('this_week', TODAY)).toBe('2026-09-03');
    expect(urgencyPresetDate('this_week', TODAY)).toBe(addDaysIso(TODAY, 7));
  });

  it('flexible → empty field (posted as null — see payload test below)', () => {
    expect(urgencyPresetDate('flexible', TODAY)).toBe('');
  });

  it('round-trips through deriveTiming — the chip a press produces is the chip JobCard shows', () => {
    for (const preset of URGENCY_PRESETS) {
      expect(deriveTiming(urgencyPresetDate(preset, TODAY), TODAY)).toBe(preset);
    }
  });

  it('this_week rolls over month/year boundaries and still derives back', () => {
    const nearYearEnd = '2026-12-28';
    const date = urgencyPresetDate('this_week', nearYearEnd);
    expect(date).toBe('2027-01-04');
    expect(deriveTiming(date, nearYearEnd)).toBe('this_week');
  });

  it('no preset can produce a past-date validation error', () => {
    for (const preset of URGENCY_PRESETS) {
      const form = validForm({
        dateNeeded: urgencyPresetDate(preset, TODAY),
      });
      expect(validatePostJobStep('schedule', form, TODAY)).toEqual({});
    }
  });

  it("'flexible' reaches rpc_post_job WITHOUT a date — p_date_needed omitted, SQL default null applies", () => {
    const args = buildPostJobArgs(
      validForm({ dateNeeded: urgencyPresetDate('flexible', TODAY) }),
    );
    expect(args.p_date_needed).toBeUndefined();
    expect('p_date_needed' in args && args.p_date_needed !== undefined).toBe(
      false,
    );
  });

  it("'today' and 'this_week' reach rpc_post_job as the exact preset dates", () => {
    expect(
      buildPostJobArgs(
        validForm({ dateNeeded: urgencyPresetDate('today', TODAY) }),
      ).p_date_needed,
    ).toBe(TODAY);
    expect(
      buildPostJobArgs(
        validForm({ dateNeeded: urgencyPresetDate('this_week', TODAY) }),
      ).p_date_needed,
    ).toBe('2026-09-03');
  });

  it('chips render in the v1 order and every label resolves in BOTH locales', () => {
    expect(URGENCY_PRESETS).toEqual(['today', 'this_week', 'flexible']);
    for (const preset of URGENCY_PRESETS) {
      expect(lookupMessage('am', TIMING_CHIP_KEY[preset])).toBeTruthy();
      expect(lookupMessage('en', TIMING_CHIP_KEY[preset])).toBeTruthy();
    }
  });
});

describe('resolveCategoryPrefill', () => {
  const active = [
    { slug: 'home-cleaning' },
    { slug: 'errands-city-help' },
    { slug: 'babysitting-care' },
  ];

  it('returns the slug when it names a loaded active category', () => {
    expect(resolveCategoryPrefill('errands-city-help', active)).toBe(
      'errands-city-help',
    );
  });

  it('rejects unknown or inactive slugs (they are not in the loaded list)', () => {
    expect(resolveCategoryPrefill('cooking-home-chef', active)).toBeNull();
    expect(resolveCategoryPrefill('DROP TABLE jobs', active)).toBeNull();
  });

  it('is exact-match only — no case folding, no trimming', () => {
    expect(resolveCategoryPrefill('Home-Cleaning', active)).toBeNull();
    expect(resolveCategoryPrefill(' home-cleaning', active)).toBeNull();
  });

  it('null/empty param and empty catalog resolve to null', () => {
    expect(resolveCategoryPrefill(null, active)).toBeNull();
    expect(resolveCategoryPrefill('', active)).toBeNull();
    expect(resolveCategoryPrefill('home-cleaning', [])).toBeNull();
  });
});
