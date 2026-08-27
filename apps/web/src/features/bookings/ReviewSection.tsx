// Double-blind review flow (SPEC reviews table: hidden until both submit or
// 48h). Rendered only once the booking is customer_confirmed (the RPC's own
// guard). What RLS returns already encodes the blind: my review is always
// visible to me; the other side's appears only once published or >48h old —
// so the "hidden" state here is computed from what is visible (splitReviews).

import { useState } from 'react';
import { useLocale } from '../../lib/i18n';
import { formatRelativeTime } from '../../lib/format';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { RatingStars } from '../../components/RatingStars';
import { Spinner } from '../../components/Spinner';
import { TextArea } from '../../components/TextArea';
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
  type ReviewFormErrors,
} from './logic';
import type { MessageKey } from '../../i18n';
import type { BookingReviewRow } from './types';

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
}

export function ReviewSection({
  bookingId,
  uid,
  counterpartName,
}: ReviewSectionProps) {
  const { locale, t } = useLocale();
  const reviewsQ = useAsync(
    () => fetchBookingReviews(bookingId),
    `booking-reviews:${bookingId}`,
  );
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<ReviewFormErrors>({});
  const [submitErrorKey, setSubmitErrorKey] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const handleSubmit = () => {
    const formErrors = validateReviewForm(rating, comment);
    setErrors(formErrors);
    if (formErrors.rating || formErrors.comment) return;
    setBusy(true);
    setSubmitErrorKey(null);
    submitReview(buildSubmitReviewArgs(bookingId, rating, comment))
      .then(() => {
        setJustSubmitted(true);
        reviewsQ.reload();
      })
      .catch((e: unknown) => {
        const key = rpcErrorKey(getErrorMessage(e));
        // rpcErrorKey's fallback is a bookings key; keep the reviews context.
        setSubmitErrorKey(
          key === 'bookings.errorGeneric' ? 'reviews.submitFailed' : key,
        );
      })
      .finally(() => setBusy(false));
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-ink">{t('reviews.title')}</h2>
      <p className="mt-1 text-xs text-ink-light">
        {t('reviews.doubleBlindExplain')}
      </p>

      {reviewsQ.loading && (
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
                  <ReviewCard
                    title={t('reviews.yourReview')}
                    review={mine}
                    hidden={isReviewHidden(mine)}
                    hiddenLabel={t('reviews.hiddenBadge')}
                    publishedLabel={t('reviews.publishedBadge')}
                  />
                  {isReviewHidden(mine) && (
                    <p className="text-xs text-ink-faint">
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
