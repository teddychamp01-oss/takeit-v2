// Formatting helpers. Money is ALWAYS integer cents + 'ETB' (SPEC C7);
// nothing in the client ever does float arithmetic on money beyond display.

import type { Locale } from '../i18n';

const NBSP = '\u00a0'; // no-break space - same joiner Intl uses for am-ET

/**
 * Format ETB cents for display using the am-ET locale ("ብር 1,250").
 * Whole-birr amounts drop the cents; fractional amounts show 2 digits.
 * Accepts number or bigint cents (DB column is bigint).
 *
 * Display only — precision above Number.MAX_SAFE_INTEGER cents (~90 trillion
 * birr) is not a real price on this marketplace.
 */
export function formatETB(cents: number | bigint): string {
  const value = Number(cents) / 100;
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  try {
    return new Intl.NumberFormat('am-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    // Very old engines without am-ET CLDR data: same shape, by hand.
    const sign = value < 0 ? '-' : '';
    const [int, frac] = Math.abs(value).toFixed(fractionDigits).split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}ብር${NBSP}${grouped}${frac ? `.${frac}` : ''}`;
  }
}

/**
 * Format a distance in km: under 1 km shows meters (nearest 10 m),
 * under 10 km shows one decimal, otherwise whole km.
 */
export function formatDistanceKm(km: number, locale: Locale = 'am'): string {
  const units =
    locale === 'am' ? { m: 'ሜ', km: 'ኪ.ሜ' } : { m: 'm', km: 'km' };
  if (!Number.isFinite(km) || km < 0) km = 0;
  if (km < 1) {
    const meters = Math.round((km * 1000) / 10) * 10;
    return `${meters}${NBSP}${units.m}`;
  }
  const value = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  return `${value}${NBSP}${units.km}`;
}

const RELATIVE_STEPS: readonly {
  limitSec: number;
  unitSec: number;
  unit: Intl.RelativeTimeFormatUnit;
}[] = [
  { limitSec: 3_600, unitSec: 60, unit: 'minute' },
  { limitSec: 86_400, unitSec: 3_600, unit: 'hour' },
  { limitSec: 604_800, unitSec: 86_400, unit: 'day' },
  { limitSec: 2_629_800, unitSec: 604_800, unit: 'week' }, // ~1 month
  { limitSec: 31_557_600, unitSec: 2_629_800, unit: 'month' }, // ~1 year
];

/**
 * Relative time ("ከ5 ደቂቃዎች በፊት" / "5 minutes ago"), past or future,
 * via Intl.RelativeTimeFormat — real localization, zero bundled strings.
 */
export function formatRelativeTime(
  date: Date | string | number,
  locale: Locale,
  now: Date = new Date(),
): string {
  const then = date instanceof Date ? date : new Date(date);
  const diffSec = Math.round((then.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);

  let unit: Intl.RelativeTimeFormatUnit = 'year';
  let value = Math.round(diffSec / 31_557_600);
  if (abs < 45) {
    unit = 'second';
    value = 0; // numeric:'auto' renders "now" / "አሁን"
  } else {
    for (const step of RELATIVE_STEPS) {
      if (abs < step.limitSec) {
        unit = step.unit;
        value = Math.round(diffSec / step.unitSec);
        break;
      }
    }
  }

  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
      value,
      unit,
    );
  } catch {
    // Engine without locale data: fall back to a plain date.
    return then.toISOString().slice(0, 10);
  }
}

const DUAL_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

/**
 * N15 — Ethiopian-calendar dual date (africa-G.3: a 7–8 year calendar offset
 * is a real mis-booking hazard; Ethiopian date FIRST when locale=am).
 *
 * locale='am' → "21 ነሐሴ 2018 (27 ኦገስት 2026)"  — Ethiopic (Gregorian)
 * locale='en' → "August 27, 2026"              — Gregorian only
 *
 * Render layer ONLY: storage stays timestamptz/ISO. If the engine lacks
 * Ethiopic calendar data (resolvedOptions().calendar !== 'ethiopic', or Intl
 * throws) the am path degrades to Gregorian-only — never a wrong Ethiopic
 * date. Invalid input returns '' so callers can hide the line.
 */
export function formatDualDate(
  iso: string | number | Date,
  locale: Locale,
): string {
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const gregorian = (loc: string) => {
    try {
      return new Intl.DateTimeFormat(loc, DUAL_DATE_OPTIONS).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  };

  if (locale !== 'am') return gregorian('en');

  try {
    const ethiopic = new Intl.DateTimeFormat(
      'am-ET-u-ca-ethiopic',
      DUAL_DATE_OPTIONS,
    );
    // Engines without Ethiopic CLDR data silently resolve to another
    // calendar — formatting anyway would show a GREGORIAN date labelled as
    // Ethiopic, the exact mis-booking hazard. Check, don't hope.
    if (ethiopic.resolvedOptions().calendar !== 'ethiopic') {
      return gregorian('am-ET');
    }
    return `${ethiopic.format(date)} (${gregorian('am-ET')})`;
  } catch {
    return gregorian('am-ET');
  }
}
