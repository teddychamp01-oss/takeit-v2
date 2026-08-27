import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  formatDistanceKm,
  formatDualDate,
  formatETB,
  formatRelativeTime,
} from '../format';

// Intl joins the ብር symbol and the number with a NO-BREAK space (U+00A0).
const NBSP = '\u00a0';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('formatETB', () => {
  it('formats whole-birr amounts without cents', () => {
    expect(formatETB(125000)).toBe(`ብር${NBSP}1,250`);
    expect(formatETB(0)).toBe(`ብር${NBSP}0`);
  });

  it('formats fractional amounts with 2 digits', () => {
    expect(formatETB(123450)).toBe(`ብር${NBSP}1,234.50`);
    expect(formatETB(50)).toBe(`ብር${NBSP}0.50`);
  });

  it('groups large amounts', () => {
    expect(formatETB(1234567890)).toBe(`ብር${NBSP}12,345,678.90`);
  });

  it('handles negative amounts (refund display)', () => {
    expect(formatETB(-125000)).toBe(`-ብር${NBSP}1,250`);
    expect(formatETB(-123450)).toBe(`-ብር${NBSP}1,234.50`);
  });

  it('accepts bigint cents (DB column is bigint)', () => {
    expect(formatETB(125000n)).toBe(`ብር${NBSP}1,250`);
  });

  it('falls back to hand-grouping when Intl lacks am-ET data', () => {
    const BrokenNumberFormat = function () {
      throw new Error('locale data unavailable');
    } as unknown as typeof Intl.NumberFormat;
    vi.stubGlobal('Intl', { ...Intl, NumberFormat: BrokenNumberFormat });
    expect(formatETB(125000)).toBe(`ብር${NBSP}1,250`);
    expect(formatETB(-123450)).toBe(`-ብር${NBSP}1,234.50`);
    expect(formatETB(1234567890)).toBe(`ብር${NBSP}12,345,678.90`);
  });
});

describe('formatDistanceKm', () => {
  it('shows meters under 1 km (nearest 10 m)', () => {
    expect(formatDistanceKm(0.4)).toBe(`400${NBSP}ሜ`);
    expect(formatDistanceKm(0.444)).toBe(`440${NBSP}ሜ`);
    expect(formatDistanceKm(0)).toBe(`0${NBSP}ሜ`);
  });

  it('shows one decimal under 10 km, whole km above', () => {
    expect(formatDistanceKm(2.44)).toBe(`2.4${NBSP}ኪ.ሜ`);
    expect(formatDistanceKm(12.6)).toBe(`13${NBSP}ኪ.ሜ`);
  });

  it('supports English units', () => {
    expect(formatDistanceKm(0.4, 'en')).toBe(`400${NBSP}m`);
    expect(formatDistanceKm(2.44, 'en')).toBe(`2.4${NBSP}km`);
    expect(formatDistanceKm(12.6, 'en')).toBe(`13${NBSP}km`);
  });

  it('clamps negative/invalid input to zero', () => {
    expect(formatDistanceKm(-3)).toBe(`0${NBSP}ሜ`);
    expect(formatDistanceKm(Number.NaN)).toBe(`0${NBSP}ሜ`);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-26T12:00:00Z');
  const ago = (sec: number) => new Date(now.getTime() - sec * 1000);

  it('renders "now" for fresh timestamps', () => {
    expect(formatRelativeTime(ago(10), 'am', now)).toBe('አሁን');
    expect(formatRelativeTime(ago(10), 'en', now)).toBe('now');
  });

  it('renders minutes / hours / days in Amharic', () => {
    expect(formatRelativeTime(ago(5 * 60), 'am', now)).toBe('ከ5 ደቂቃዎች በፊት');
    expect(formatRelativeTime(ago(2 * 3600), 'am', now)).toBe('ከ2 ሰዓቶች በፊት');
    expect(formatRelativeTime(ago(3 * 86400), 'am', now)).toBe('ከ3 ቀናት በፊት');
  });

  it('renders minutes / hours / days in English', () => {
    expect(formatRelativeTime(ago(5 * 60), 'en', now)).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(2 * 3600), 'en', now)).toBe('2 hours ago');
    expect(formatRelativeTime(ago(86400), 'en', now)).toBe('yesterday');
  });

  it('renders weeks, months and years', () => {
    expect(formatRelativeTime(ago(3 * 604800), 'am', now)).toBe(
      'ከ3 ሳምንታት በፊት',
    );
    expect(formatRelativeTime(ago(2 * 2629800), 'en', now)).toBe(
      '2 months ago',
    );
    expect(formatRelativeTime(ago(400 * 86400), 'en', now)).toBe('last year');
  });

  it('renders future times', () => {
    const soon = new Date(now.getTime() + 5 * 60 * 1000);
    expect(formatRelativeTime(soon, 'en', now)).toBe('in 5 minutes');
    expect(formatRelativeTime(soon, 'am', now)).toBe('በ5 ደቂቃዎች ውስጥ');
  });

  it('accepts ISO strings and epoch millis', () => {
    expect(
      formatRelativeTime('2026-08-26T11:55:00Z', 'en', now),
    ).toBe('5 minutes ago');
    expect(formatRelativeTime(now.getTime() - 5 * 60 * 1000, 'en', now)).toBe(
      '5 minutes ago',
    );
  });

  it('falls back to a plain date when the engine lacks locale data', () => {
    const BrokenRTF = function () {
      throw new Error('locale data unavailable');
    } as unknown as typeof Intl.RelativeTimeFormat;
    vi.stubGlobal('Intl', { ...Intl, RelativeTimeFormat: BrokenRTF });
    expect(formatRelativeTime(ago(5 * 60), 'am', now)).toBe('2026-08-26');
  });
});

describe('formatDualDate (N15)', () => {
  // These strings pin node's ICU output. They prove the LOGIC (Ethiopic
  // first, Gregorian in parentheses, en Gregorian-only, safe fallbacks) —
  // they do NOT prove the glyphs render on the target Android WebView.
  // The on-device glyph check on the owner's phone is this item's real
  // Gate 4 (TESTPLAN S8.1); Intl Ethiopic support there is assumed, not
  // measured. Mid-day UTC timestamps keep the assertions timezone-stable
  // in CI (TZ=UTC).
  const iso = '2026-08-27T12:00:00Z';

  it('renders Ethiopic first with Gregorian in parentheses for am', () => {
    // 2026-08-27 Gregorian = 2018 ነሐሴ 21 Ethiopian (8-year offset zone).
    expect(formatDualDate(iso, 'am')).toBe('21 ነሐሴ 2018 (27 ኦገስት 2026)');
  });

  it('renders Gregorian only for en', () => {
    expect(formatDualDate(iso, 'en')).toBe('August 27, 2026');
  });

  it('accepts Date and epoch-millis input', () => {
    const date = new Date(iso);
    expect(formatDualDate(date, 'en')).toBe('August 27, 2026');
    expect(formatDualDate(date.getTime(), 'en')).toBe('August 27, 2026');
  });

  it('returns empty string for invalid input', () => {
    expect(formatDualDate('not-a-date', 'am')).toBe('');
    expect(formatDualDate(Number.NaN, 'en')).toBe('');
    expect(formatDualDate('', 'am')).toBe('');
  });

  it('degrades to Gregorian-only when the engine silently lacks the Ethiopic calendar', () => {
    // Engine resolves to a non-ethiopic calendar without throwing: showing
    // that output as Ethiopic would be a wrong date. Must fall back.
    const RealDTF = Intl.DateTimeFormat;
    const SneakyDTF = function (
      locale?: string | string[],
      opts?: Intl.DateTimeFormatOptions,
    ) {
      const inner = new RealDTF(
        typeof locale === 'string' ? locale.replace('-u-ca-ethiopic', '') : locale,
        opts,
      );
      return {
        format: (d: Date | number) => inner.format(d),
        resolvedOptions: () => ({
          ...inner.resolvedOptions(),
          calendar: 'gregory',
        }),
      };
    } as unknown as typeof Intl.DateTimeFormat;
    vi.stubGlobal('Intl', { ...Intl, DateTimeFormat: SneakyDTF });
    const out = formatDualDate(iso, 'am');
    expect(out).not.toContain('(');
    expect(out).not.toContain('ነሐሴ');
  });

  it('degrades to ISO date when Intl.DateTimeFormat throws entirely', () => {
    const BrokenDTF = function () {
      throw new Error('locale data unavailable');
    } as unknown as typeof Intl.DateTimeFormat;
    vi.stubGlobal('Intl', { ...Intl, DateTimeFormat: BrokenDTF });
    expect(formatDualDate(iso, 'am')).toBe('2026-08-27');
    expect(formatDualDate(iso, 'en')).toBe('2026-08-27');
  });
});
