// Booking detail — the state machine surface for both roles (SPEC C4:
// dual-role is per booking), plus the Phase-1 off-app payment log, the
// double-blind review flow and the booking-scoped realtime chat.
//
// ≤3 primary actions on screen (SPEC frontend rules): ONE forward
// state-machine button (start / worker done / customer confirm — role- and
// status-dependent), and cancel/dispute as secondary buttons that open a
// reason sheet. All status changes go through the SECURITY DEFINER RPCs —
// the client never writes a status column (RLS would refuse anyway).
//
// C3: the counterpart's phone renders through MaskedPhone with
// bookingConfirmed only at customer_confirmed — the same point the server
// stops masking numbers in chat. profiles carry ONLY phone_masked, so a raw
// number cannot reach this page at all.

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
// N15: date_needed renders as dual Ethiopic (Gregorian) in am — same
// formatter the jobs feature uses, so the two screens can never disagree.
import { formatDateNeeded } from '../jobs/logic';
import { useSession } from '../../hooks/useSession';
import { formatETB } from '../../lib/format';
import { Badge } from '../../components/Badge';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { MaskedPhone } from '../../components/MaskedPhone';
import { PageHeader } from '../../components/PageHeader';
import { RatingStars } from '../../components/RatingStars';
import { SpinnerBlock } from '../../components/Spinner';
import { StatusBadge, type BookingStatus } from '../../components/StatusBadge';
import { SupportLink } from '../../components/SupportLink';
import { TextArea } from '../../components/TextArea';
import { useToast } from '../../components/Toast';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { displayRating, postJobDeepLink } from '../browse/logic';
import {
  cancelBooking,
  confirmCompletion,
  disputeBooking,
  fetchBooking,
  fetchWorkerTrust,
  markWorkerDone,
  startBooking,
} from './api';
import { useAsync } from './useAsync';
import { ChatSection } from './ChatSection';
import { PaymentCard } from './PaymentCard';
import { ReviewSection } from './ReviewSection';
import {
  BOOKING_ACTION_LABEL,
  BOOKING_ACTION_TOAST,
  BOOKING_STAGE_LABEL,
  BOOKING_STAGES,
  bookingRole,
  bookingStageIndex,
  buildCancelArgs,
  buildDisputeArgs,
  canBookAgain,
  canCancel,
  canDispute,
  canLogPayment,
  canReview,
  extractEmbedded,
  getErrorMessage,
  isContactUnlocked,
  primaryActionFor,
  rpcErrorKey,
  showSafetyShield,
  showWorkerTrustCard,
  statusHintKey,
  validateCancelReason,
  validateDisputeReason,
  type BookingAction,
} from './logic';
import type { MessageKey } from '../../i18n';
import type { PartyProfileEmbed } from './types';

type SheetMode = 'cancel' | 'dispute' | 'safety' | null;

/** Link that LOOKS like the primary Button (a Link cannot nest in <button>). */
const PRIMARY_LINK_CLASSES =
  'inline-flex min-h-touch w-full items-center justify-center gap-2 ' +
  'rounded-xl bg-primary px-5 text-base font-semibold text-white ' +
  'shadow-button transition active:bg-primary-600 motion-safe:active:scale-95';

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.5l7.5 2.8v5.9c0 4.6-3.2 8.1-7.5 10.3-4.3-2.2-7.5-5.7-7.5-10.3V5.3L12 2.5z" />
      <path d="M8.8 12l2.2 2.2 4.2-4.4" />
    </svg>
  );
}

function PartyAvatar({
  party,
  name,
  size,
}: {
  party: PartyProfileEmbed;
  name: string;
  size: 'compact' | 'large';
}) {
  const cls =
    size === 'large'
      ? 'h-16 w-16 shrink-0 rounded-full'
      : 'h-10 w-10 shrink-0 rounded-full';
  const px = size === 'large' ? 64 : 40;
  return party.avatar_url ? (
    <img
      src={party.avatar_url}
      alt=""
      // The large variant is the page's above-fold identity image (near-LCP):
      // never lazy. Compact rows (chat) stay lazy. Intrinsic dims guard CLS.
      loading={size === 'large' ? 'eager' : 'lazy'}
      width={px}
      height={px}
      className={`${cls} object-cover`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${cls} flex items-center justify-center bg-primary-100 font-bold text-primary-700 ${
        size === 'large' ? 'text-2xl' : 'text-base'
      }`}
    >
      {name.trim().charAt(0)}
    </span>
  );
}

function StageCheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5l3.2 3.2L13 5" />
    </svg>
  );
}

/**
 * Vertical happy-path stepper (v1-adoption T4). PRESENTATION ONLY — it never
 * triggers a transition; the RPC buttons below it do. Off-path statuses
 * (cancelled/disputed) return null here and keep the StatusBadge as the
 * single status surface.
 */
function BookingStepper({ status }: { status: BookingStatus }) {
  const { t } = useLocale();
  const currentIndex = bookingStageIndex(status);
  if (currentIndex === null) return null;
  return (
    <ol
      aria-label={t('bookings.stepperAria')}
      className="mt-3 border-t border-ink/5 pt-3"
    >
      {BOOKING_STAGES.map((stage, i) => {
        const done = i <= currentIndex;
        const active = i === currentIndex;
        const last = i === BOOKING_STAGES.length - 1;
        return (
          <li
            key={stage}
            className="flex gap-3"
            aria-current={active ? 'step' : undefined}
          >
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold ${
                  done
                    ? 'brand-gradient border-transparent text-white'
                    : 'border-ink/15 text-ink-faint'
                }`}
              >
                {done ? <StageCheckIcon /> : i + 1}
              </span>
              {!last && (
                <span
                  aria-hidden="true"
                  className={`w-0.5 flex-1 rounded-full ${
                    i < currentIndex ? 'bg-primary' : 'bg-ink/10'
                  }`}
                />
              )}
            </div>
            <p
              className={`pt-1.5 text-sm font-semibold ${last ? '' : 'pb-4'} ${
                active
                  ? 'text-primary'
                  : done
                    ? 'text-ink'
                    : 'text-ink-faint'
              }`}
            >
              {t(BOOKING_STAGE_LABEL[stage])}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const toast = useToast();
  const { user, loading: sessionLoading } = useSession();
  const uid = user?.id ?? null;

  const bookingQ = useAsync(
    () => fetchBooking(id ?? ''),
    `booking:${id ?? ''}`,
    !!id && !!uid,
  );

  // Derived BEFORE the early returns so the trust hook below runs
  // unconditionally (rules of hooks). Both are null until the booking loads.
  const booking = bookingQ.data;
  const role = booking && uid ? bookingRole(booking, uid) : null;

  // N7 worker trust card: one extra worker_profiles read, only while the
  // customer is looking at an arriving/working worker. A failed fetch only
  // degrades the card (name + avatar remain) — it never blocks the page.
  const trustEnabled = !!booking && showWorkerTrustCard(role, booking.status);
  const trustQ = useAsync(
    () => fetchWorkerTrust(booking?.worker_id ?? ''),
    `booking-trust:${booking?.worker_id ?? ''}`,
    trustEnabled,
  );

  const [actionBusy, setActionBusy] = useState(false);
  const [actionErrorKey, setActionErrorKey] = useState<MessageKey | null>(null);
  const [sheet, setSheet] = useState<SheetMode>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<MessageKey | null>(null);

  if (sessionLoading || bookingQ.loading) {
    return (
      <div>
        <PageHeader title={t('bookings.bookingTitle')} back />
        <SpinnerBlock />
      </div>
    );
  }

  if (bookingQ.failed) {
    return (
      <div>
        <PageHeader title={t('bookings.bookingTitle')} back />
        <EmptyState
          title={t('bookings.loadFailedTitle')}
          body={t('bookings.loadFailedBody')}
          action={
            <Button variant="secondary" onClick={bookingQ.reload}>
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  if (!booking || !uid || role === null) {
    // Not found, not visible, or the viewer is not a party (an ops/admin
    // account can SELECT the row via RLS but this page is for the parties).
    return (
      <div>
        <PageHeader title={t('bookings.bookingTitle')} back />
        <EmptyState
          title={t('bookings.notFoundTitle')}
          body={t('bookings.notFoundBody')}
        />
      </div>
    );
  }

  const job = extractEmbedded(booking.jobs);
  const counterpart = extractEmbedded(
    role === 'customer' ? booking.worker : booking.customer,
  );
  const counterpartName = counterpart?.display_name ?? '';
  const primaryAction = primaryActionFor(role, booking.status);
  const unlocked = isContactUnlocked(booking.status);

  const runAction = (action: BookingAction) => {
    if (actionBusy) return;
    setActionBusy(true);
    setActionErrorKey(null);
    const call =
      action === 'start'
        ? startBooking({ p_booking_id: booking.id })
        : action === 'worker_done'
          ? markWorkerDone({ p_booking_id: booking.id })
          : confirmCompletion({ p_booking_id: booking.id });
    call
      .then(() => {
        toast(t(BOOKING_ACTION_TOAST[action]));
        return bookingQ.reload();
      })
      .catch((e: unknown) => {
        const key = rpcErrorKey(getErrorMessage(e));
        setActionErrorKey(key);
        toast(t(key), 'error');
      })
      .finally(() => setActionBusy(false));
  };

  const openSheet = (mode: Exclude<SheetMode, null>) => {
    setReason('');
    setReasonError(null);
    setSheet(mode);
  };

  const submitSheet = () => {
    // 'safety' renders no form — only cancel/dispute ever submit from here.
    if (actionBusy || sheet === null || sheet === 'safety') return;
    const invalid =
      sheet === 'cancel'
        ? validateCancelReason(reason)
        : validateDisputeReason(reason);
    if (invalid) {
      setReasonError(invalid);
      return;
    }
    setActionBusy(true);
    setActionErrorKey(null);
    const call =
      sheet === 'cancel'
        ? cancelBooking(buildCancelArgs(booking.id, reason))
        : disputeBooking(buildDisputeArgs(booking.id, reason));
    call
      .then(() => {
        toast(t(BOOKING_ACTION_TOAST[sheet]));
        setSheet(null);
        bookingQ.reload();
      })
      .catch((e: unknown) => {
        const key = rpcErrorKey(getErrorMessage(e));
        setActionErrorKey(key);
        // The reason sheet covers the inline error line — the toast is the
        // feedback the user actually sees while the sheet is still open.
        toast(t(key), 'error');
      })
      .finally(() => setActionBusy(false));
  };

  return (
    <div>
      <PageHeader
        title={job?.title ?? t('bookings.bookingTitle')}
        back
      />
      <div className="space-y-4 p-4 pb-8">
        {/* Summary + state machine */}
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusBadge kind="booking" status={booking.status} />
            <div className="flex items-center gap-1">
              <Badge tone="primary">
                {role === 'customer'
                  ? t('bookings.roleCustomer')
                  : t('bookings.roleWorker')}
              </Badge>
              {/* N13: ONE shield entry on the live screen, both roles */}
              {showSafetyShield(booking.status) && (
                <button
                  type="button"
                  onClick={() => setSheet('safety')}
                  aria-label={t('bookings.safetyShieldAria')}
                  className="flex h-touch w-touch items-center justify-center rounded-full text-primary-600 active:bg-ink/5"
                >
                  <ShieldIcon />
                </button>
              )}
            </div>
          </div>

          {/* Identity block — ABOVE the stepper (N7 coordinates with T4).
              For the customer at confirmed/started this is the trust card:
              the customer is the face-match, so the photo is large and the
              trust numbers are present. Everyone else gets the compact row. */}
          {counterpart &&
            (showWorkerTrustCard(role, booking.status) ? (
              <div className="mt-3">
                <div className="flex items-center gap-3">
                  <PartyAvatar
                    party={counterpart}
                    name={counterpartName}
                    size="large"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-ink">
                      {counterpartName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {trustQ.data && (
                        <VerifiedBadge level={trustQ.data.verification_level} />
                      )}
                      {counterpart.phone_masked && (
                        <MaskedPhone
                          masked={counterpart.phone_masked}
                          bookingConfirmed={unlocked}
                        />
                      )}
                    </div>
                    {trustQ.data && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <RatingStars
                          value={displayRating(
                            trustQ.data.rating_avg,
                            trustQ.data.review_count,
                          )}
                          count={trustQ.data.review_count}
                        />
                        <span className="text-xs text-ink-faint">
                          {t('browse.jobsCompletedLong', {
                            count: trustQ.data.jobs_completed,
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {booking.status === 'confirmed' && (
                  <p className="mt-2 rounded-lg bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700">
                    {t('bookings.checkArrival')}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-3">
                <PartyAvatar
                  party={counterpart}
                  name={counterpartName}
                  size="compact"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {t('bookings.withName', { name: counterpartName })}
                  </p>
                  {counterpart.phone_masked && (
                    <MaskedPhone
                      masked={counterpart.phone_masked}
                      bookingConfirmed={unlocked}
                    />
                  )}
                </div>
              </div>
            ))}

          {/* N15: the job's needed date, Ethiopic-first for am — a 7–8 year
              calendar offset is a real mis-booking hazard (africa-G.3). */}
          {job?.date_needed && (
            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-ink/5 pt-3">
              <span className="shrink-0 text-sm text-ink-light">
                {t('bookings.scheduledDate')}
              </span>
              <span className="text-right text-sm font-semibold text-ink">
                {formatDateNeeded(job.date_needed, locale)}
              </span>
            </div>
          )}

          <div className="mt-3 flex items-baseline justify-between border-t border-ink/5 pt-3">
            <span className="text-sm text-ink-light">
              {t('bookings.agreedPrice')}
            </span>
            <span className="text-xl font-bold text-ink">
              {formatETB(booking.agreed_price_cents)}
            </span>
          </div>

          {/* Happy-path stepper (T4); cancelled/disputed render nothing here
              and stay on the StatusBadge above. */}
          <BookingStepper status={booking.status} />

          <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-sm text-ink-light">
            {t(statusHintKey(role, booking.status))}
          </p>
          {unlocked && (
            <p className="mt-2 text-xs text-verified">
              {t('bookings.contactUnlocked')}
            </p>
          )}

          {actionErrorKey && (
            <p className="mt-2 text-sm text-status-disputed">
              {t(actionErrorKey)}
            </p>
          )}

          {primaryAction && (
            <Button
              full
              className="mt-3"
              disabled={actionBusy}
              onClick={() => runAction(primaryAction)}
            >
              {t(BOOKING_ACTION_LABEL[primaryAction])}
            </Button>
          )}

          {/* N2a rebook loop: at the terminal happy state the customer's one
              action is booking this worker again — same deep link the worker
              detail page uses (/post?worker=&category=). */}
          {canBookAgain(role, booking.status) && (
            <Link
              to={postJobDeepLink(
                booking.worker_id,
                job?.category_slug ?? null,
              )}
              className={`${PRIMARY_LINK_CLASSES} mt-3`}
            >
              {t('bookings.bookAgain')}
            </Link>
          )}

          {(canCancel(booking.status) || canDispute(booking.status)) && (
            <div className="mt-2 flex gap-2">
              {canCancel(booking.status) && (
                <Button
                  variant="ghost"
                  className="flex-1"
                  disabled={actionBusy}
                  onClick={() => openSheet('cancel')}
                >
                  {t('bookings.actionCancel')}
                </Button>
              )}
              {canDispute(booking.status) && (
                <Button
                  variant="ghost"
                  className="flex-1 text-status-disputed"
                  disabled={actionBusy}
                  onClick={() => openSheet('dispute')}
                >
                  {t('bookings.actionDispute')}
                </Button>
              )}
            </div>
          )}
        </section>

        {/* Phase-1 off-app payment log (C1: note only, never custody) */}
        {canLogPayment(booking.status) && (
          <PaymentCard
            bookingId={booking.id}
            role={role}
            agreedPriceCents={booking.agreed_price_cents}
          />
        )}

        {/* Double-blind reviews — open at customer_confirmed */}
        {canReview(booking.status) && (
          <ReviewSection
            bookingId={booking.id}
            uid={uid}
            counterpartName={counterpartName}
            role={role}
            workerId={booking.worker_id}
            categorySlug={job?.category_slug ?? null}
          />
        )}

        {/* Booking-scoped realtime chat */}
        <ChatSection bookingId={booking.id} uid={uid} status={booking.status} />
      </div>

      <BottomSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={
          sheet === 'safety'
            ? t('bookings.safetyTitle')
            : sheet === 'dispute'
              ? t('bookings.disputeSheetTitle')
              : t('bookings.cancelSheetTitle')
        }
      >
        {sheet === 'safety' ? (
          /* N13 safety sheet: report → the existing dispute flow; plus a
             human on Telegram. No emergency-numbers row — the numbers are
             not ops-verified (plan N13 gate). */
          <div className="space-y-3">
            <Button
              full
              variant="secondary"
              onClick={() => openSheet('dispute')}
            >
              {t('bookings.safetyReportProblem')}
            </Button>
            <SupportLink />
          </div>
        ) : (
          <div className="space-y-3">
            {sheet === 'dispute' && (
              <p className="text-sm text-ink-light">
                {t('bookings.disputeHint')}
              </p>
            )}
            <TextArea
              label={
                sheet === 'dispute'
                  ? t('bookings.disputeReasonLabel')
                  : t('bookings.cancelReasonLabel')
              }
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(null);
              }}
              error={reasonError ? t(reasonError) : undefined}
            />
            <Button
              full
              variant={sheet === 'dispute' ? 'danger' : 'primary'}
              disabled={actionBusy}
              onClick={submitSheet}
            >
              {sheet === 'dispute'
                ? t('bookings.disputeSubmit')
                : t('bookings.cancelConfirm')}
            </Button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
