// Worker detail — the full trust surface: verification level, badge level,
// rating + breakdown, jobs completed, guarantor count (when visible under
// RLS), packages, REVEALED reviews only, saved-workers toggle, and 'Request
// booking' deep-linking into the post-job flow prefilled.
//
// C3: the phone shown here is profiles.phone_masked (already masked
// server-side) rendered through <MaskedPhone bookingConfirmed={false}> — the
// full number never exists on this page.

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { formatETB, formatRelativeTime } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { SpinnerBlock } from '../../components/Spinner';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { RatingStars } from '../../components/RatingStars';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { MaskedPhone } from '../../components/MaskedPhone';
import {
  fetchGuarantorCount,
  fetchIsSaved,
  fetchRevealedRatings,
  fetchRevealedReviews,
  fetchWorkerDetail,
  fetchWorkerPackages,
  saveWorker,
  unsaveWorker,
} from './api';
import {
  displayRating,
  neighborhoodLabel,
  postJobDeepLink,
  primaryCategory,
  ratingBreakdown,
} from './logic';
import { useAsync } from './useAsync';
import { ErrorCard, PackageCard, SectionTitle, SignInCard } from './ui';
import type { MessageKey } from '../../i18n';
import type { AvailabilityStatus } from '../../components/WorkerCard';

const AVAILABILITY_KEY: Record<AvailabilityStatus, MessageKey> = {
  available_now: 'common.availableNow',
  available_today: 'common.availableToday',
  busy: 'common.busy',
  off: 'common.off',
};

const BADGE_KEY: Record<string, MessageKey> = {
  new: 'common.badgeNew',
  rising: 'common.badgeRising',
  trusted: 'common.badgeTrusted',
  pro: 'common.badgePro',
  top: 'common.badgeTop',
};

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s-7.5-4.7-10-9.3C.5 8.6 2.4 5 6 5c2.2 0 3.8 1.2 6 3.6C14.2 6.2 15.8 5 18 5c3.6 0 5.5 3.6 4 6.7C19.5 16.3 12 21 12 21z" />
    </svg>
  );
}

export default function WorkerDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const { user, loading: sessionLoading } = useSession();
  const navigate = useNavigate();

  const enabled = !!id && !!user;
  const worker = useAsync(() => fetchWorkerDetail(id), `worker:${id}`, enabled);
  const reviews = useAsync(
    () => fetchRevealedReviews(id),
    `reviews:${id}`,
    enabled,
  );
  const ratings = useAsync(
    () => fetchRevealedRatings(id),
    `ratings:${id}`,
    enabled,
  );
  const guarantors = useAsync(
    () => fetchGuarantorCount(id),
    `guarantors:${id}`,
    enabled,
  );
  const categories = worker.data?.categories ?? [];
  const packages = useAsync(
    () => fetchWorkerPackages(categories),
    `packages:${id}:${categories.join(',')}`,
    enabled && categories.length > 0,
  );
  const savedInitial = useAsync(
    () => (user ? fetchIsSaved(user.id, id) : Promise.resolve(false)),
    `saved:${id}:${user?.id ?? ''}`,
    enabled,
  );

  // Optimistic local override for the saved toggle (null = follow the fetch).
  const [savedOverride, setSavedOverride] = useState<boolean | null>(null);
  const saved = savedOverride ?? savedInitial.data ?? false;

  const toggleSaved = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }
    const next = !saved;
    setSavedOverride(next);
    try {
      if (next) await saveWorker(user.id, id);
      else await unsaveWorker(user.id, id);
    } catch {
      setSavedOverride(!next); // revert on failure
    }
  };

  if (sessionLoading) {
    return (
      <div>
        <PageHeader title={t('browse.workerTitle')} back />
        <SpinnerBlock />
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <PageHeader title={t('browse.workerTitle')} back />
        <div className="p-4">
          <SignInCard
            title={t('browse.signInToView')}
            body={t('home.signInBody')}
          />
        </div>
      </div>
    );
  }

  if (worker.loading) {
    return (
      <div>
        <PageHeader title={t('browse.workerTitle')} back />
        <SpinnerBlock />
      </div>
    );
  }

  if (worker.failed) {
    return (
      <div>
        <PageHeader title={t('browse.workerTitle')} back />
        <div className="p-4">
          <ErrorCard onRetry={worker.reload} />
        </div>
      </div>
    );
  }

  const row = worker.data;
  if (!row) {
    return (
      <div>
        <PageHeader title={t('browse.workerTitle')} back />
        <EmptyState title={t('browse.workerNotFound')} />
      </div>
    );
  }

  const name = row.profiles.display_name;
  const rating = displayRating(row.rating_avg, row.review_count);
  const priceRange =
    row.price_min_cents != null && row.price_max_cents != null
      ? row.price_min_cents === row.price_max_cents
        ? formatETB(row.price_min_cents)
        : `${formatETB(row.price_min_cents)} – ${formatETB(row.price_max_cents)}`
      : row.price_min_cents != null
        ? formatETB(row.price_min_cents)
        : null;
  const buckets = ratingBreakdown(ratings.data ?? []);
  const guarantorCount = guarantors.data ?? 0;

  return (
    <div>
      <PageHeader
        title={t('browse.workerTitle')}
        back
        action={
          <button
            type="button"
            onClick={toggleSaved}
            aria-pressed={saved}
            aria-label={saved ? t('browse.savedWorker') : t('browse.saveWorker')}
            className={`flex h-touch w-touch items-center justify-center rounded-full active:bg-ink/5 ${
              saved ? 'text-primary-600' : 'text-ink-faint'
            }`}
          >
            <HeartIcon filled={saved} />
          </button>
        }
      />

      <div className="space-y-5 p-4 pb-28">
        {/* Trust surface */}
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            {row.profiles.avatar_url ? (
              <img
                src={row.profiles.avatar_url}
                alt=""
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-100 text-2xl font-bold text-primary-700"
              >
                {name.trim().charAt(0)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-ink">{name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <VerifiedBadge level={row.verification_level} />
                <Badge tone="primary">
                  {t(BADGE_KEY[row.badge_level] ?? 'common.badgeNew')}
                </Badge>
                <Badge
                  tone={
                    row.availability_status === 'available_now'
                      ? 'success'
                      : 'neutral'
                  }
                >
                  {t(AVAILABILITY_KEY[row.availability_status])}
                </Badge>
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 text-sm text-ink-light">
            <div>
              <RatingStars value={rating} count={row.review_count} />
            </div>
            <p>{t('browse.jobsCompletedLong', { count: row.jobs_completed })}</p>
            {guarantorCount > 0 && (
              <p className="font-medium text-verified">
                {t('browse.guarantorsCount', { count: guarantorCount })}
              </p>
            )}
            {row.neighborhood && (
              <p>
                {neighborhoodLabel(row.neighborhood, locale)}
                {' · '}
                {t('browse.travelRadius', { km: row.travel_radius_km })}
              </p>
            )}
            {priceRange && (
              <p className="font-semibold text-ink">{priceRange}</p>
            )}
            {row.profiles.phone_masked && (
              <p className="flex items-center gap-2">
                <span className="text-ink-faint">{t('browse.phoneLabel')}:</span>
                <MaskedPhone
                  masked={row.profiles.phone_masked}
                  bookingConfirmed={false}
                />
              </p>
            )}
          </div>
        </section>

        {/* About + skills */}
        {(row.bio || row.skills.length > 0) && (
          <section aria-label={t('browse.aboutSection')}>
            <SectionTitle>{t('browse.aboutSection')}</SectionTitle>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              {row.bio && <p className="text-sm text-ink-light">{row.bio}</p>}
              {row.skills.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-ink-faint">
                    {t('browse.skillsSection')}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {row.skills.map((skill) => (
                      <Badge key={skill} tone="neutral">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Packages for the worker's categories */}
        <section aria-label={t('browse.packagesSection')}>
          <SectionTitle>{t('browse.packagesSection')}</SectionTitle>
          {packages.loading ? (
            <SpinnerBlock />
          ) : packages.failed ? (
            <ErrorCard onRetry={packages.reload} />
          ) : (packages.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-faint">{t('browse.noResults')}</p>
          ) : (
            <ul className="space-y-2">
              {(packages.data ?? []).map((pkg) => (
                <li key={pkg.id}>
                  <PackageCard pkg={pkg} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Reviews — revealed only (double-blind) */}
        <section aria-label={t('browse.reviewsSection')}>
          <SectionTitle>{t('browse.reviewsSection')}</SectionTitle>
          {reviews.loading || ratings.loading ? (
            <SpinnerBlock />
          ) : reviews.failed || ratings.failed ? (
            <ErrorCard
              onRetry={() => {
                reviews.reload();
                ratings.reload();
              }}
            />
          ) : !reviews.data || reviews.data.rows.length === 0 ? (
            <p className="text-sm text-ink-faint">{t('browse.noReviews')}</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="mb-2 text-xs font-semibold text-ink-faint">
                  {t('browse.ratingBreakdown')}
                </p>
                <ul className="space-y-1">
                  {buckets.map((bucket) => (
                    <li key={bucket.star} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-xs text-ink-light">
                        {t('browse.starCount', { star: bucket.star })}
                      </span>
                      <div
                        className="h-2 flex-1 overflow-hidden rounded-full bg-ink/5"
                        role="img"
                        aria-label={`${t('browse.starCount', { star: bucket.star })}: ${bucket.count}`}
                      >
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${bucket.pct}%` }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right text-xs text-ink-faint">
                        {bucket.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {reviews.data.total != null &&
                reviews.data.total > reviews.data.rows.length && (
                  <p className="text-xs text-ink-faint">
                    {t('browse.showingReviews', {
                      shown: reviews.data.rows.length,
                      total: reviews.data.total,
                    })}
                  </p>
                )}

              <ul className="space-y-2">
                {reviews.data.rows.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-2xl bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {t('browse.reviewerGeneric')}
                      </span>
                      <span className="text-xs text-ink-faint">
                        {formatRelativeTime(review.created_at, locale)}
                      </span>
                    </div>
                    <div className="mt-1">
                      <RatingStars value={review.rating} />
                    </div>
                    {review.comment && (
                      <p className="mt-1 text-sm text-ink-light">
                        {review.comment}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Primary action — deep-link into post-job, prefilled */}
      <div
        className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-lg px-4"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Button
          full
          onClick={() =>
            navigate(postJobDeepLink(row.user_id, primaryCategory(row.categories)))
          }
        >
          {t('browse.requestBooking')}
        </Button>
      </div>
    </div>
  );
}
