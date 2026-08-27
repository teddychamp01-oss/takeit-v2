// Worker surface card — every trust signal in one place (SPEC frontend rules:
// verified badge, rating, jobs count on EVERY worker surface).

import { Link } from 'react-router-dom';
import { useLocale } from '../lib/i18n';
import { formatDistanceKm, formatETB } from '../lib/format';
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
}: WorkerCardProps) {
  const { locale, t } = useLocale();
  const avail = AVAILABILITY[availability];

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
      className="block rounded-2xl bg-white p-4 shadow-sm transition-colors active:bg-primary-50"
    >
      <div className="flex items-start gap-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            loading="lazy"
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700"
          >
            {name.trim().charAt(0)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold text-ink">{name}</span>
            <VerifiedBadge level={verificationLevel} showLabel={false} />
          </div>
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
