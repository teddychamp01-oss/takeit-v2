// Worker detail — the full trust surface: verification level, badge level,
// rating + breakdown, jobs completed, guarantor count (when visible under
// RLS), packages, REVEALED reviews only, saved-workers toggle, and 'Request
// booking' deep-linking into the post-job flow prefilled.
//
// C3: the phone shown here is profiles.phone_masked (already masked
// server-side) rendered through <MaskedPhone bookingConfirmed={false}> — the
// full number never exists on this page.
//
// N5 (trust-F7/us-D1): the VerifiedBadge chip is tappable and opens a
// BottomSheet saying per level exactly what WAS checked and what was NOT.
// Every line maps 1:1 to a real flow in this repo (see SHEET_LINES) —
// attributes only, never document contents (C2) — and the sheet always
// carries the honesty line that Take It recommends meeting the worker first
// (us-D2: a check is not a substitute for meeting in person).

import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { microCaps } from '../../lib/typography';
import { useSession } from '../../hooks/useSession';
import { formatETB, formatRelativeTime } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { SpinnerBlock } from '../../components/Spinner';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { BottomSheet } from '../../components/BottomSheet';
import { RatingStars } from '../../components/RatingStars';
import {
  VerifiedBadge,
  type VerificationLevel,
} from '../../components/VerifiedBadge';
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

const LEVEL_LABEL_KEY: Record<VerificationLevel, MessageKey> = {
  none: 'common.verificationNone',
  basic: 'common.verificationBasic',
  id_verified: 'common.verificationIdVerified',
  fayda_verified: 'common.verificationFaydaVerified',
  pro_certified: 'common.verificationProCertified',
};

// ---------------------------------------------------------------------------
// N5 — badge tap-through sheet content. Each line maps 1:1 to a REAL flow:
//   basic          → Telegram/phone sign-in confirmed the account (auth flow)
//   id_verified    → manual_id: ID front/back + selfie uploaded into the
//                    PRIVATE verifications bucket, decided by the ops team
//                    (admin decideVerification); documents never shown (C2)
//   fayda_verified → fayda_ekyc via the national Fayda ID (flag-gated flow)
//   pro_certified  → certification reviewed/approved by ops (ladderProDesc)
// Never invent a check that the flow does not perform; never grant more than
// the level actually proves (Airbnb's badge dilution is the anti-pattern).
// ---------------------------------------------------------------------------
const SHEET_LINES: Record<
  Exclude<VerificationLevel, 'none'>,
  {
    checked: readonly MessageKey[];
    notChecked: readonly MessageKey[];
    /** Show the "documents stay private" caption (document-based flows). */
    docsPrivate: boolean;
  }
> = {
  basic: {
    checked: ['browse.badgeSheetBasicChecked'],
    notChecked: ['browse.badgeSheetBasicNotId', 'browse.badgeSheetNotQuality'],
    docsPrivate: false,
  },
  id_verified: {
    checked: ['browse.badgeSheetIdChecked1', 'browse.badgeSheetIdChecked2'],
    notChecked: ['browse.badgeSheetNotQuality'],
    docsPrivate: true,
  },
  fayda_verified: {
    checked: ['browse.badgeSheetFaydaChecked'],
    notChecked: ['browse.badgeSheetNotQuality'],
    docsPrivate: false,
  },
  pro_certified: {
    checked: ['browse.badgeSheetProChecked'],
    notChecked: ['browse.badgeSheetNotQuality'],
    docsPrivate: true,
  },
};

function SheetCheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="mt-0.5 h-4 w-4 shrink-0 text-verified"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.6 6.1l-4.2 4.5a.75.75 0 01-1.1 0L4.4 8.5a.75.75 0 011.1-1l1.35 1.5 3.65-3.9a.75.75 0 111.1 1z" />
    </svg>
  );
}

function SheetDashIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5 8h6" strokeLinecap="round" />
    </svg>
  );
}

/** The "what we checked" sheet — level 'none' never reaches here (no badge). */
function VerificationSheet({
  level,
  open,
  onClose,
}: {
  level: Exclude<VerificationLevel, 'none'>;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const def = SHEET_LINES[level];
  return (
    <BottomSheet open={open} onClose={onClose} title={t('browse.badgeSheetTitle')}>
      <div className="space-y-4 pb-1">
        <VerifiedBadge level={level} />

        <div>
          <h3 className="text-sm font-bold text-ink">
            {t('browse.badgeSheetCheckedTitle')}
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {def.checked.map((key) => (
              <li
                key={key}
                className="flex items-start gap-2 text-sm leading-relaxed text-ink-light"
              >
                <SheetCheckIcon />
                {t(key)}
              </li>
            ))}
          </ul>
          {def.docsPrivate && (
            <p className="mt-2 text-sm leading-relaxed text-ink-faint">
              {t('browse.badgeSheetDocsPrivate')}
            </p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-bold text-ink">
            {t('browse.badgeSheetNotCheckedTitle')}
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {def.notChecked.map((key) => (
              <li
                key={key}
                className="flex items-start gap-2 text-sm leading-relaxed text-ink-light"
              >
                <SheetDashIcon />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>

        {/* Honesty line (us-D2) — always present, visually distinct. */}
        <p className="rounded-xl bg-primary-50 p-3 text-sm leading-relaxed text-ink">
          {t('browse.badgeSheetMeetFirst')}
        </p>
      </div>
    </BottomSheet>
  );
}

/** One cell of the stat trio (T10) — value above a tiny label. */
function StatCell({ value, label }: { value: ReactNode; label: string }) {
  const { locale } = useLocale();
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 px-1">
      {value}
      {/* N14: caps/tracking en-only — fidel has no case (africa-G.4) */}
      <p
        className={`text-[10px] font-semibold text-ink-faint ${microCaps(locale)}`}
      >
        {label}
      </p>
    </div>
  );
}

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

  // N5: "what we checked" sheet, opened from the VerifiedBadge chip.
  const [badgeSheetOpen, setBadgeSheetOpen] = useState(false);

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
              /* N9: explicit dimensions guard CLS; top-of-page identity
                 photo is an LCP candidate — never lazy. */
              <img
                src={row.profiles.avatar_url}
                alt=""
                width={64}
                height={64}
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
                {/* N5: tapping the badge opens the "what we checked" sheet.
                    Renders nothing for 'none', so the sheet stays honest. */}
                <VerifiedBadge
                  level={row.verification_level}
                  onClick={() => setBadgeSheetOpen(true)}
                />
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

        {/* Stat trio (T10): Rating / Jobs completed / Verification level —
            all three values already fetched with the worker row. */}
        <section
          aria-label={t('browse.statsSection')}
          className="rounded-2xl bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-3 divide-x divide-ink/10">
            <StatCell
              value={
                <p className="text-lg font-extrabold text-ink">
                  {rating == null ? '—' : rating.toFixed(1)}
                </p>
              }
              label={t('common.rating')}
            />
            <StatCell
              value={
                <p className="text-lg font-extrabold text-ink">
                  {row.jobs_completed}
                </p>
              }
              label={t('browse.statJobsCompleted')}
            />
            <StatCell
              value={
                // 'none' renders as '—': absence of trust is shown by
                // absence, never by a scary label (VerifiedBadge's rule).
                <p className="text-center text-sm font-bold leading-tight text-ink">
                  {row.verification_level === 'none'
                    ? '—'
                    : t(LEVEL_LABEL_KEY[row.verification_level])}
                </p>
              }
              label={t('browse.statVerification')}
            />
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
          {/* N5/trust-F8: say the structural fake-review defense out loud.
              True whether the list is empty or full, so it sits above both. */}
          {!reviews.loading && !ratings.loading && !reviews.failed && !ratings.failed && (
            <p className="mb-2 text-sm leading-relaxed text-ink-faint">
              {t('browse.reviewsProvenance')}
            </p>
          )}
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

      {/* N5: badge tap-through sheet ('none' has no badge, so no sheet). */}
      {row.verification_level !== 'none' && (
        <VerificationSheet
          level={row.verification_level}
          open={badgeSheetOpen}
          onClose={() => setBadgeSheetOpen(false)}
        />
      )}

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
