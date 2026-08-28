// Worker surface card — every trust signal in one place (SPEC frontend rules:
// verified badge, rating, jobs count on EVERY worker surface).

import { Link } from 'react-router-dom';
import { useLocale } from '../lib/i18n';
import { formatDistanceKm, formatETB } from '../lib/format';
import { getNetQuality } from '../lib/netQuality';
import { RatingStars } from './RatingStars';
import { VerifiedBadge, type VerificationLevel } from './VerifiedBadge';
import type { MessageKey } from '../i18n';

export type AvailabilityStatus =
  | 'available_now'
  | 'available_today'
  | 'busy'
  | 'off';

const AVAILABILITY: Record<
  AvailabilityStatus,
  { key: MessageKey; dot: string; text: string }
> = {
  available_now: {
    key: 'common.availableNow',
    dot: 'bg-verified',
    text: 'text-verified',
  },
  available_today: {
    key: 'common.availableToday',
    dot: 'bg-primary',
    text: 'text-primary-700',
  },
  busy: {
    key: 'common.busy',
    dot: 'bg-primary-300',
    text: 'text-ink-faint',
  },
  off: { key: 'common.off', dot: 'bg-ink/20', text: 'text-ink-faint' },
};

export interface WorkerCardProps {
  id: string;
  name: string;
  avatarUrl?: string | null;
  verificationLevel: VerificationLevel;
  ratingAvg: number | null;
  reviewCount: number;
  jobsCompleted: number;
  priceMinCents?: number | null;
  priceMaxCents?: number | null;
  distanceKm?: number | null;
  availability: AvailabilityStatus;
  /**
   * ALREADY-LOCALIZED category display names — pages resolve slugs before
   * passing them in (same convention as JobCard's categoryName; see
   * categoryNamesFor in features/home/logic.ts). Joined into a one-line
   * summary under the name.
   */
  categories?: string[];
  /**
   * A13 — the worker's raw category SLUGS, carried to WorkerDetailPage on the
   * router state so its packages section can start fetching without waiting
   * for fetchWorkerDetail. Never rendered; a HINT only (see
   * workerCategoriesHint). Omit it and the detail page simply falls back to
   * the chained fetch, exactly as a cold deep link does.
   */
  categorySlugs?: readonly string[];
  /** Rail variant: fixed w-44, shrink-0 — for horizontal edge-bleed lists. */
  compact?: boolean;
}

/**
 * Avatar with brand-gradient initial fallback (never a blank circle).
 *
 * N17b (asia-#20): on save-data / 2G-class links (netQuality.constrained)
 * the avatar URL is SKIPPED entirely and the initial fallback renders —
 * data is a household cost in Addis, and the fallback already exists on
 * every card. N9 (pwa-F13): explicit width/height pin the box so a slow
 * image can never shift layout; rail (compact) avatars are NOT lazy —
 * the Home rails are the first rails — while below-fold list avatars are.
 */
function Avatar({
  avatarUrl,
  name,
  sizeCls,
  sizePx,
  lazy,
}: {
  avatarUrl?: string | null;
  name: string;
  sizeCls: string;
  /** Intrinsic square dimension in px — must match sizeCls (CLS guard). */
  sizePx: number;
  lazy: boolean;
}) {
  const showImage = !!avatarUrl && !getNetQuality().constrained;
  return showImage ? (
    <img
      src={avatarUrl as string}
      alt=""
      width={sizePx}
      height={sizePx}
      loading={lazy ? 'lazy' : undefined}
      className={`${sizeCls} shrink-0 rounded-full object-cover`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`brand-gradient flex ${sizeCls} shrink-0 items-center justify-center rounded-full font-bold text-white`}
    >
      {name.trim().charAt(0)}
    </span>
  );
}

/** Single-star rating for tight spots. Unrated shows —, never 0.0. */
function RatingMini({ value, label }: { value: number | null; label: string }) {
  const safe = value == null ? null : Math.max(0, Math.min(5, value));
  return (
    <span
      className="inline-flex items-center gap-1 font-semibold text-ink"
      role="img"
      aria-label={`${label}: ${safe == null ? '—' : safe.toFixed(1)}`}
    >
      <svg
        viewBox="0 0 20 20"
        className="h-3 w-3 text-primary"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.11l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.5z" />
      </svg>
      {safe == null ? '—' : safe.toFixed(1)}
    </span>
  );
}

export function WorkerCard({
  id,
  name,
  avatarUrl,
  verificationLevel,
  ratingAvg,
  reviewCount,
  jobsCompleted,
  priceMinCents,
  priceMaxCents,
  distanceKm,
  availability,
  categories,
  categorySlugs,
  compact = false,
}: WorkerCardProps) {
  const { locale, t } = useLocale();
  const avail = AVAILABILITY[availability];
  const categoriesLine =
    categories && categories.length > 0 ? categories.join(' • ') : null;
  // A13: undefined (not an empty object) when there is nothing to hint, so a
  // navigation without slugs is indistinguishable from a cold deep link.
  const linkState =
    categorySlugs && categorySlugs.length > 0
      ? { workerCategories: categorySlugs }
      : undefined;

  if (compact) {
    return (
      <Link
        to={`/workers/${id}`}
        state={linkState}
        className="block w-44 shrink-0 rounded-2xl bg-white p-3 shadow-card transition-colors active:bg-primary-50"
      >
        <div className="flex items-center gap-2">
          <span className="relative shrink-0">
            {/* Rail cards sit in the first rails on Home — never lazy. */}
            <Avatar
              avatarUrl={avatarUrl}
              name={name}
              sizeCls="h-10 w-10"
              sizePx={40}
              lazy={false}
            />
            <span
              aria-hidden="true"
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${avail.dot}`}
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-ink">
              {name}
            </span>
            <VerifiedBadge level={verificationLevel} showLabel={false} />
          </span>
        </div>
        {categoriesLine && (
          <p className="mt-2 line-clamp-1 text-xs text-ink-faint">
            {categoriesLine}
          </p>
        )}
        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
          <RatingMini value={ratingAvg} label={t('common.rating')} />
          {priceMinCents != null && (
            <span className="shrink-0 font-bold text-ink">
              {t('browse.priceFromShort', {
                price: formatETB(priceMinCents),
              })}
            </span>
          )}
        </div>
        <span className="sr-only">{t(avail.key)}</span>
      </Link>
    );
  }

  const priceRange =
    priceMinCents != null && priceMaxCents != null
      ? priceMinCents === priceMaxCents
        ? formatETB(priceMinCents)
        : `${formatETB(priceMinCents)} – ${formatETB(priceMaxCents)}`
      : priceMinCents != null
        ? formatETB(priceMinCents)
        : null;

  return (
    <Link
      to={`/workers/${id}`}
      state={linkState}
      className="block rounded-2xl bg-white p-4 shadow-card transition-colors active:bg-primary-50"
    >
      <div className="flex items-start gap-3">
        {/* Full cards live in below-fold vertical lists — lazy is right. */}
        <Avatar
          avatarUrl={avatarUrl}
          name={name}
          sizeCls="h-12 w-12 text-lg"
          sizePx={48}
          lazy
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold text-ink">{name}</span>
            <VerifiedBadge level={verificationLevel} showLabel={false} />
          </div>
          {categoriesLine && (
            <p className="mt-0.5 truncate text-xs text-ink-faint">
              {categoriesLine}
            </p>
          )}
          <div className="mt-0.5">
            <RatingStars value={ratingAvg} count={reviewCount} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-faint">
            <span>{t('common.jobsCountShort', { count: jobsCompleted })}</span>
            {priceRange && (
              <span className="font-medium text-ink-light">{priceRange}</span>
            )}
            {distanceKm != null && (
              <span>{formatDistanceKm(distanceKm, locale)}</span>
            )}
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${avail.text}`}
        >
          <span className={`h-2 w-2 rounded-full ${avail.dot}`} />
          {t(avail.key)}
        </span>
      </div>
    </Link>
  );
}
