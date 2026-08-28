// Date/timing helpers for job rows — the ONLY jobs-feature logic the shared
// JobCard needs (A10).
//
// Split out of features/jobs/logic.ts as a module BOUNDARY, not as a
// reorganisation: JobCard renders on Home, and importing it from logic.ts
// dragged the whole post-job wizard's validation — plus browse/logic,
// auth/validation and lib/phone behind it — into Home's cold-load wave.
// Nothing here touches supabase, the DOM, or any other feature. Keep it that
// way: an import added to this file lands on the Home critical path.
//
// features/jobs/logic.ts re-exports every symbol below, so existing call
// sites are unchanged and either import path is correct.

import { formatDualDate } from '../../lib/format';
import type { MessageKey } from '../../i18n';

/** Local YYYY-MM-DD for "not in the past" checks (device-local day). */
export function localTodayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Timing chip (shared JobCard) — DERIVED from jobs.date_needed. The jobs
// table has no urgency column and none is added (v1-adoption plan T3):
// this is presentation only.
// ---------------------------------------------------------------------------
export type TimingChip = 'today' | 'this_week' | 'flexible';

export const TIMING_CHIP_KEY: Record<TimingChip, MessageKey> = {
  today: 'jobs.timingToday',
  this_week: 'jobs.timingThisWeek',
  flexible: 'jobs.timingFlexible',
};

/** `iso` (YYYY-MM-DD) plus `days`, as local YYYY-MM-DD. Anchored at midday so
 *  a DST shift can never move the result across a date boundary. */
export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localTodayIso(date);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a well-formed YYYY-MM-DD string (shape only, not calendar validity). */
export function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

/**
 * Derive the JobCard timing chip from date_needed:
 *   null/'' → 'flexible', today → 'today', tomorrow…today+7 → 'this_week'.
 * Past dates, dates beyond a week, and malformed values get NO chip (null) —
 * the page's formatted date says it better than a wrong label would.
 * YYYY-MM-DD strings compare correctly as text (same trick as validateSchedule).
 */
export function deriveTiming(
  dateNeeded: string | null | undefined,
  todayIso: string,
): TimingChip | null {
  if (dateNeeded == null || dateNeeded === '') return 'flexible';
  if (!ISO_DATE_RE.test(dateNeeded)) return null;
  if (dateNeeded < todayIso) return null;
  if (dateNeeded === todayIso) return 'today';
  return dateNeeded <= addDaysIso(todayIso, 7) ? 'this_week' : null;
}

/**
 * date_needed (YYYY-MM-DD) for display; locale-aware, safe fallback to raw.
 * N15: locale=am renders the Ethiopian-calendar dual form via formatDualDate
 * ("21 ነሐሴ 2018 (27 ኦገስት 2026)") — a 7–8 year calendar offset is a real
 * mis-booking hazard. en is unchanged. `T00:00:00` pins LOCAL midnight so the
 * shown date can never shift a day across timezones.
 */
export function formatDateNeeded(
  iso: string | null,
  locale: 'am' | 'en',
): string {
  if (!iso) return '';
  try {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    if (locale === 'am') {
      // Degrades internally to Gregorian am-ET when the engine lacks
      // Ethiopic calendar data — never a wrongly-labelled date.
      return formatDualDate(date, 'am') || iso;
    }
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
    }).format(date);
  } catch {
    return iso;
  }
}
