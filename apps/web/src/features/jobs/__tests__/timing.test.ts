// Timing chip derivation (shared JobCard, v1-adoption plan T3). The chip is
// DERIVED from jobs.date_needed — no urgency column exists. Boundaries pinned
// here: today, +7d (last 'this_week' day), +8d (no chip), null (flexible).

import { describe, expect, it } from 'vitest';
import { lookupMessage } from '../../../i18n';
import { addDaysIso, deriveTiming, TIMING_CHIP_KEY } from '../logic';

const TODAY = '2026-08-27';

describe('addDaysIso', () => {
  it('adds within a month', () => {
    expect(addDaysIso('2026-08-01', 7)).toBe('2026-08-08');
  });

  it('rolls over month and year boundaries', () => {
    expect(addDaysIso('2026-08-27', 7)).toBe('2026-09-03');
    expect(addDaysIso('2026-12-28', 7)).toBe('2027-01-04');
  });

  it('handles leap-year February', () => {
    expect(addDaysIso('2028-02-26', 7)).toBe('2028-03-04');
  });
});

describe('deriveTiming', () => {
  it('null and empty mean flexible (no date set on the job)', () => {
    expect(deriveTiming(null, TODAY)).toBe('flexible');
    expect(deriveTiming(undefined, TODAY)).toBe('flexible');
    expect(deriveTiming('', TODAY)).toBe('flexible');
  });

  it('today is today', () => {
    expect(deriveTiming(TODAY, TODAY)).toBe('today');
  });

  it('tomorrow through today+7 is this_week (boundary: +7d in, +8d out)', () => {
    expect(deriveTiming('2026-08-28', TODAY)).toBe('this_week'); // +1d
    expect(deriveTiming('2026-09-03', TODAY)).toBe('this_week'); // +7d
    expect(deriveTiming('2026-09-04', TODAY)).toBeNull(); // +8d — no chip
  });

  it('crosses a month boundary correctly', () => {
    // today near month end: +7d lands in September and must still match
    expect(deriveTiming('2026-09-01', TODAY)).toBe('this_week');
  });

  it('past dates get no chip (the formatted date says it better)', () => {
    expect(deriveTiming('2026-08-26', TODAY)).toBeNull();
    expect(deriveTiming('2020-01-01', TODAY)).toBeNull();
  });

  it('malformed values get no chip, never a crash', () => {
    expect(deriveTiming('soon', TODAY)).toBeNull();
    expect(deriveTiming('2026-8-27', TODAY)).toBeNull();
    expect(deriveTiming('2026-08-27T10:00:00Z', TODAY)).toBeNull();
  });

  it('every chip key resolves in BOTH locales (no missing-key leaks)', () => {
    for (const key of Object.values(TIMING_CHIP_KEY)) {
      expect(lookupMessage('am', key)).toBeTruthy();
      expect(lookupMessage('en', key)).toBeTruthy();
    }
  });
});
