// Double-blind review flow (SPEC reviews table: hidden until both submit or
// 48h). Rendered only once the booking is customer_confirmed (the RPC's own
// guard). What RLS returns already encodes the blind: my review is always
// visible to me; the other side's appears only once published or >48h old —
// so the "hidden" state here is computed from what is visible (splitReviews).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { formatRelativeTime } from '../../lib/format';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { RatingStars } from '../../components/RatingStars';
import { Spinner } from '../../components/Spinner';
import { TextArea } from '../../components/TextArea';
import { useToast } from '../../components/Toast';
// Cross-feature imports sanctioned by plan N2 (rebook loop): the SAME
// saved_workers write and /post deep link the browse feature uses.
import { fetchIsSaved, saveWorker } from '../browse/api';
import { postJobDeepLink } from '../browse/logic';
import { fetchBookingReviews, submitReview } from './api';
import { useAsync } from './useAsync';
import {
  buildSubmitReviewArgs,
  getErrorMessage,
  isReviewHidden,
  reviewRevealAtIso,
  rpcErrorKey,
  splitReviews,
  validateReviewForm,
  type BookingRole,
  type ReviewFormErrors,
} from './logic';
import type { MessageKey } from '../../i18n';
import type { BookingReviewRow } from './types';

/** Link styled like the primary Button (a Link cannot nest inside <button>). */
const PRIMARY_LINK_CLASSES =
  'inline-flex min-h-touch w-full items-center justify-center gap-2 ' +
  'rounded-xl bg-primary px-5 text-base font-semibold text-white ' +
  'shadow-button transition active:bg-primary-600 motion-safe:active:scale-95';

function StarPickButton({
  n,
  active,
  label,
  onPick,
}: {
  n: number;
  active: boolean;
  label: string;
  onPick: (n: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={() => onPick(n)}
      className="flex h-touch w-touch items-center justify-center"
    >
      <svg
        viewBox="0 0 20 20"
        className={`h-8 w-8 ${active ? 'text-primary' : 'text-ink/15'}`}
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.11l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.5z" />
      </svg>
    </button>
  );
}

function ReviewCard({
  title,
  review,
  hidden,
  hiddenLabel,
  publishedLabel,
}: {
  title: string;
  review: BookingReviewRow;
  hidden: boolean;
  hiddenLabel: string;
  publishedLabel: string;
}) {
  return (
    <div className="rounded-xl bg-cream p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <Badge tone={hidden ? 'neutral' : 'success'}>
          {hidden ? hiddenLabel : publishedLabel}
        </Badge>
      </div>
      <div className="mt-1.5">
        <RatingStars value={review.rating} />
      </div>
      {review.comment && (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-ink-light">
          {review.comment}
        </p>
      )}
    </div>
  );
}

interface ReviewSectionProps {
  bookingId: string;
  uid: string;
  counterpartName: string;
  /** The VIEWER's role on this booking — the rebook nudge is customer-only. */
  role: BookingRole;
  workerId: string;
  categorySlug: string | null;
}

export function ReviewSection({
  bookingId,
  uid,
  counterpartName,
  role,
  workerId,
  categorySlug,
}: ReviewSectionProps) {
  const { locale, t } = useLocale();
  const toast = useToast();
  const reviewsQ = useAsync(
    () => fetchBookingReviews(bookingId),
    `booking-reviews:${bookingId}`,
  );
  // N2b: is this worker already in saved_workers? Only asked for the
  // customer — a worker reviewing a customer gets no save/rebook nudge.
  const savedQ = useAsync(
    () => fetchIsSaved(uid, workerId),
    `review-saved:${uid}:${workerId}`,
    role === 'customer',
  );
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<ReviewFormErrors>({});
  const [submitErrorKey, setSubmitErrorKey] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedNow, setSavedNow] = useState(false);

  // Hide "Save for next time" once saved — either just now or previously.
  // While the lookup is still loading, render nothing rather than a button
  // that may vanish a frame later.
  const alreadySaved = savedNow || savedQ.data === true;

  const handleSave = () => {
    if (saveBusy) return;
    setSaveBusy(true);
    saveWorker(uid, workerId)
      .then(() => {
        setSavedNow(true);
        toast(t('reviews.workerSaved', { name: counterpartName }));
      })
      .catch(() => {
        toast(t('reviews.saveWorkerFailed'), 'error');
      })
      .finally(() => setSaveBusy(false));
  };

  const handleSubmit = () => {
    const formErrors = validateReviewForm(rating, comment);
    setErrors(formErrors);
    if (formErrors.rating || formErrors.comment) return;
    setBusy(true);
    setSubmitErrorKey(null);
    submitReview(buildSubmitReviewArgs(bookingId, rating, comment))
      .then(() => {
        // 'Your review was recorded…' — sets the double-blind expectation.
        toast(t('reviews.submitted'));
        setJustSubmitted(true);
        reviewsQ.reload();
      })
      .catch((e: unknown) => {
        const key = rpcErrorKey(getErrorMessage(e));
        // rpcErrorKey's fallback is a bookings key; keep the reviews context.
        const contextKey =
          key === 'bookings.errorGeneric' ? 'reviews.submitFailed' : key;
        setSubmitErrorKey(contextKey);
        toast(t(contextKey), 'error');
      })
      .finally(() => setBusy(false));
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-ink">{t('reviews.title')}</h2>
      {/* N14 floor: multi-line Amharic body never below text-sm */}
      <p className="mt-1 text-sm leading-relaxed text-ink-light">
        {t('reviews.doubleBlindExplain')}
      </p>

      {/* A7: useAsync now keeps the previous rows during a reload(), so this
          spinner is gated on there being nothing to show. Otherwise the
          reload after submitting a review would render the spinner ON TOP of
          the still-visible old list — two states at once. */}
      {reviewsQ.loading && !reviewsQ.data && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {reviewsQ.failed && (
        <div className="py-4 text-center">
          <p className="text-sm text-ink-light">{t('reviews.loadFailed')}</p>
          <Button
            variant="secondary"
            className="mt-2"
            onClick={reviewsQ.reload}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}

      {reviewsQ.data &&
        (() => {
          const { mine, theirs } = splitReviews(reviewsQ.data, uid);
          return (
            <div className="mt-3 space-y-3">
              {mine === null ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-ink">
                    {t('reviews.leaveReview')}
                  </p>
                  <div>
                    <p className="mb-1 text-sm font-medium text-ink">
                      {t('reviews.ratingLabel')}
                    </p>
                    <div
                      role="group"
                      aria-label={t('reviews.ratingLabel')}
                      className="flex"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <StarPickButton
                          key={n}
                          n={n}
                          active={n <= rating}
                          label={t('reviews.starAria', { n })}
                          onPick={setRating}
                        />
                      ))}
                    </div>
                    {errors.rating && (
                      <p className="mt-1 text-sm text-status-disputed">
                        {t(errors.rating)}
                      </p>
                    )}
                  </div>
                  <TextArea
                    label={t('reviews.commentLabel')}
                    placeholder={t('reviews.commentPlaceholder')}
                    rows={3}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    error={errors.comment ? t(errors.comment) : undefined}
                  />
                  {submitErrorKey && (
                    <p className="text-sm text-status-disputed">
                      {t(submitErrorKey)}
                    </p>
                  )}
                  <Button full onClick={handleSubmit} disabled={busy}>
                    {t('common.submit')}
                  </Button>
                </div>
              ) : (
                <>
                  {justSubmitted && (
                    <p className="rounded-lg bg-verified-light px-3 py-2 text-sm font-medium text-verified">
                      {t('reviews.submitted')}
                    </p>
                  )}
                  {/* N2b rebook nudge at the peak-satisfaction moment:
                      save the worker + book again, customer side only. */}
                  {justSubmitted && role === 'customer' && (
                    <div className="space-y-2">
                      {!savedQ.loading && !alreadySaved && (
                        <Button
                          full
                          variant="secondary"
                          disabled={saveBusy}
                          onClick={handleSave}
                        >
                          {t('reviews.saveForNextTime', {
                            name: counterpartName,
                          })}
                        </Button>
                      )}
                      <Link
                        to={postJobDeepLink(workerId, categorySlug)}
                        className={PRIMARY_LINK_CLASSES}
                      >
                        {t('bookings.bookAgain')}
                      </Link>
                    </div>
                  )}
                  <ReviewCard
                    title={t('reviews.yourReview')}
                    review={mine}
                    hidden={isReviewHidden(mine)}
                    hiddenLabel={t('reviews.hiddenBadge')}
                    publishedLabel={t('reviews.publishedBadge')}
                  />
                  {isReviewHidden(mine) && (
                    <p className="text-sm leading-relaxed text-ink-faint">
                      {theirs === null
                        ? t('reviews.waitingOther', { name: counterpartName })
                        : t('reviews.revealsAt', {
                            time: formatRelativeTime(
                              reviewRevealAtIso(mine.created_at),
                              locale,
                            ),
                          })}
                    </p>
                  )}
                </>
              )}
              {theirs !== null && (
                <ReviewCard
                  title={t('reviews.theirReview', { name: counterpartName })}
                  review={theirs}
                  hidden={false}
                  hiddenLabel={t('reviews.hiddenBadge')}
                  publishedLabel={t('reviews.publishedBadge')}
                />
              )}
            </div>
          );
        })()}
    </section>
  );
}
