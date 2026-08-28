// Shared job row card — the v1 information hierarchy on v2 primitives
// (v1-adoption plan T3):
//   (1) category emoji + micro-label (uppercase/tracking en-only — N14)
//   (2) bold truncated title + StatusBadge top-right
//   (3) two-line clamped description
//   (4) footer: neighborhood + derived timing chip left, bold budget right
//   (5) optional "By {name}" byline
//
// Purely presentational. Props are typed to what the real rows carry
// (audited: JobListRow in features/jobs/api.ts, JobTeaserRow in
// features/browse/types.ts) — pages resolve slugs to localized category /
// neighborhood labels before passing them in. The timing chip is DERIVED
// from date_needed (deriveTiming in features/jobs/timing.ts) — there is no
// urgency column and none is added. Money via formatETB (integer cents, C7).
// Inline SVG icons only (no icon library, C6).
//
// A10: import from features/jobs/TIMING, not features/jobs/logic. logic.ts
// re-exports these for compatibility, but reaching them through it pulls the
// post-job wizard's validation (and browse/logic, auth/validation, lib/phone
// behind it) onto Home's cold-load path. This card renders on Home.

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useLocale } from '../lib/i18n';
import { formatETB } from '../lib/format';
import { microCaps } from '../lib/typography';
import { StatusBadge, type JobStatus } from './StatusBadge';
import {
  deriveTiming,
  formatDateNeeded,
  isIsoDate,
  localTodayIso,
  TIMING_CHIP_KEY,
} from '../features/jobs/timing';

function IconMapPin() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s-7-5.7-7-11a7 7 0 1114 0c0 5.3-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export interface JobCardProps {
  id: string;
  title: string;
  status: JobStatus;
  /** Emoji from service_categories.icon (pages resolve the slug). */
  categoryIcon?: string | null;
  /** Already-localized category name (name_am / name_en — pages resolve). */
  categoryName?: string | null;
  description?: string | null;
  /** Already-localized neighborhood label (browse/logic neighborhoodLabel). */
  neighborhood?: string | null;
  /**
   * jobs.date_needed (YYYY-MM-DD or null; null renders the "Flexible" chip).
   * OMIT the prop entirely when the row has no date information at all
   * (e.g. JobTeaserRow) — then no chip is shown rather than a false one.
   */
  dateNeeded?: string | null;
  /** Integer ETB cents (jobs.budget_cents). */
  budgetCents?: number | null;
  /** Poster's display name — renders the "By {name}" byline. */
  posterName?: string | null;
  /** Page-specific extra row (application count, posted-ago, badges, …). */
  children?: ReactNode;
}

export function JobCard({
  id,
  title,
  status,
  categoryIcon,
  categoryName,
  description,
  neighborhood,
  dateNeeded,
  budgetCents,
  posterName,
  children,
}: JobCardProps) {
  const { t, locale } = useLocale();
  // undefined = the row carries no date info -> no chip (never a false one).
  const timing =
    dateNeeded === undefined ? null : deriveTiming(dateNeeded, localTodayIso());
  // N15: a concrete date the chip can't express (past, or beyond a week)
  // renders as the formatted date instead — dual Ethiopic (Gregorian) in am.
  const timingDate =
    timing === null && typeof dateNeeded === 'string' && isIsoDate(dateNeeded)
      ? formatDateNeeded(dateNeeded, locale)
      : '';

  return (
    <Link
      to={`/jobs/${id}`}
      className="block rounded-2xl bg-white p-4 shadow-card transition-colors active:bg-primary-50"
    >
      {(categoryIcon || categoryName) && (
        <div className="mb-1 flex items-center gap-1.5">
          {categoryIcon && (
            <span className="text-base leading-none" aria-hidden="true">
              {categoryIcon}
            </span>
          )}
          {categoryName && (
            /* N14: caps/tracking are en-only — fidel has no case (africa-G.4) */
            <span
              className={`text-[11px] font-semibold text-ink-faint ${microCaps(locale)}`}
            >
              {categoryName}
            </span>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold leading-tight text-ink">
          {title}
        </h3>
        <StatusBadge kind="job" status={status} />
      </div>

      {description && (
        /* N14 floor: multi-line (possibly Amharic) body never below text-sm */
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-faint">
          {description}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-ink-faint">
          {neighborhood && (
            <span className="flex items-center gap-1">
              <IconMapPin />
              <span className="truncate">{neighborhood}</span>
            </span>
          )}
          {(timing || timingDate) && (
            <span className="flex items-center gap-1">
              <IconClock />
              {timing ? t(TIMING_CHIP_KEY[timing]) : timingDate}
            </span>
          )}
        </div>
        {budgetCents != null && (
          <span className="shrink-0 font-bold text-ink">
            {formatETB(budgetCents)}
          </span>
        )}
      </div>

      {posterName && (
        <div className="mt-2 text-[11px] text-ink-faint">
          {t('jobs.postedByName', { name: posterName })}
        </div>
      )}

      {children}
    </Link>
  );
}
