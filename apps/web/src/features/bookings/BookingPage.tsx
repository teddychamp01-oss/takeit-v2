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
import { useParams } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { formatETB } from '../../lib/format';
import { Badge } from '../../components/Badge';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { MaskedPhone } from '../../components/MaskedPhone';
import { PageHeader } from '../../components/PageHeader';
import { SpinnerBlock } from '../../components/Spinner';
import { StatusBadge, type BookingStatus } from '../../components/StatusBadge';
import { TextArea } from '../../components/TextArea';
import { useToast } from '../../components/Toast';
import {
  cancelBooking,
  confirmCompletion,
  disputeBooking,
  fetchBooking,
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
  canCancel,
  canDispute,
  canLogPayment,
  canReview,
  extractEmbedded,
  getErrorMessage,
  isContactUnlocked,
  primaryActionFor,
  rpcErrorKey,
  statusHintKey,
  validateCancelReason,
  validateDisputeReason,
  type BookingAction,
} from './logic';
import type { MessageKey } from '../../i18n';

type SheetMode = 'cancel' | 'dispute' | null;

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
  const { t } = useLocale();
  const toast = useToast();
  const { user, loading: sessionLoading } = useSession();
  const uid = user?.id ?? null;

  const bookingQ = useAsync(
    () => fetchBooking(id ?? ''),
    `booking:${id ?? ''}`,
    !!id && !!uid,
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

  const booking = bookingQ.data;
  const role = booking && uid ? bookingRole(booking, uid) : null;
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
    if (actionBusy || sheet === null) return;
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
            <Badge tone="primary">
              {role === 'customer'
                ? t('bookings.roleCustomer')
                : t('bookings.roleWorker')}
            </Badge>
          </div>

          {counterpart && (
            <div className="mt-3 flex items-center gap-3">
              {counterpart.avatar_url ? (
                <img
                  src={counterpart.avatar_url}
                  alt=""
                  loading="lazy"
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-base font-bold text-primary-700"
                >
                  {counterpartName.trim().charAt(0)}
                </span>
              )}
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
          />
        )}

        {/* Booking-scoped realtime chat */}
        <ChatSection bookingId={booking.id} uid={uid} status={booking.status} />
      </div>

      <BottomSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={
          sheet === 'dispute'
            ? t('bookings.disputeSheetTitle')
            : t('bookings.cancelSheetTitle')
        }
      >
        <div className="space-y-3">
          {sheet === 'dispute' && (
            <p className="text-sm text-ink-light">{t('bookings.disputeHint')}</p>
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
      </BottomSheet>
    </div>
  );
}
