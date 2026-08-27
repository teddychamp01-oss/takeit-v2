// Phase-1 off-app payment logging (SPEC: payments Phase 1; C1 NON-CUSTODIAL).
//
// This card only writes a NOTE about a payment that happened directly between
// the two parties (cash / bank transfer) — Take It never holds the money, and
// the copy says so in both languages (bookings.paymentNonCustodial). The one
// write path is rpc_log_offapp_payment: first call logs the row with the
// caller's side confirmed; the other party's call flips their boolean
// (dual-confirm). provider is 'offapp' — set server-side, never by the client.

import { useState } from 'react';
import { useT } from '../../lib/i18n';
import { formatETB } from '../../lib/format';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Spinner } from '../../components/Spinner';
import { fetchOffappPayment, logOffappPayment } from './api';
import { useAsync } from './useAsync';
import {
  bothConfirmedPayment,
  buildLogPaymentArgs,
  getErrorMessage,
  parseBirrToCents,
  rpcErrorKey,
  viewerHasConfirmedPayment,
  type BookingRole,
} from './logic';
import type { MessageKey } from '../../i18n';

interface PaymentCardProps {
  bookingId: string;
  role: BookingRole;
  agreedPriceCents: number;
}

export function PaymentCard({
  bookingId,
  role,
  agreedPriceCents,
}: PaymentCardProps) {
  const t = useT();
  const payment = useAsync(
    () => fetchOffappPayment(bookingId),
    `offapp-payment:${bookingId}`,
  );
  const [amountBirr, setAmountBirr] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);

  const callRpc = (amountCents: number | null) => {
    setBusy(true);
    setErrorKey(null);
    logOffappPayment(buildLogPaymentArgs(bookingId, amountCents))
      .then(() => payment.reload())
      .catch((e: unknown) => setErrorKey(rpcErrorKey(getErrorMessage(e))))
      .finally(() => setBusy(false));
  };

  const handleLog = () => {
    const parsed = parseBirrToCents(amountBirr);
    if (!parsed.ok) {
      setErrorKey(parsed.errorKey);
      return;
    }
    // null = the server logs the booking's agreed price (RPC coalesce).
    callRpc(parsed.cents);
  };

  // Confirming an EXISTING log sends null so the server never sees a
  // conflicting amount (TAKEIT_PAYMENT_AMOUNT_MISMATCH guard).
  const handleConfirm = () => callRpc(null);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-ink">
        {t('bookings.paymentTitle')}
      </h2>
      <p className="mt-1 text-xs text-ink-light">
        {t('bookings.paymentNonCustodial')}
      </p>

      {payment.loading && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {payment.failed && (
        <div className="py-4 text-center">
          <p className="text-sm text-ink-light">
            {t('bookings.loadFailedTitle')}
          </p>
          <Button
            variant="secondary"
            className="mt-2"
            onClick={payment.reload}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}

      {!payment.loading && !payment.failed && (
        <>
          {errorKey && (
            <p className="mt-2 text-sm text-status-disputed">{t(errorKey)}</p>
          )}

          {payment.data === null ? (
            <div className="mt-3 space-y-3">
              <Input
                label={t('bookings.paymentAmountLabel')}
                hint={t('bookings.paymentAmountHint')}
                inputMode="decimal"
                value={amountBirr}
                onChange={(event) => setAmountBirr(event.target.value)}
                placeholder={formatETB(agreedPriceCents)}
              />
              <Button full onClick={handleLog} disabled={busy}>
                {t('bookings.paymentLog')}
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-light">
                  {t('bookings.paymentLoggedAs')}
                </span>
                <span className="text-lg font-bold text-ink">
                  {formatETB(payment.data.amount_cents)}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink">{t('bookings.roleCustomer')}</span>
                  <Badge
                    tone={payment.data.customer_confirmed ? 'success' : 'neutral'}
                  >
                    {payment.data.customer_confirmed
                      ? t('bookings.paymentConfirmedBadge')
                      : t('bookings.paymentPendingBadge')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink">{t('bookings.roleWorker')}</span>
                  <Badge
                    tone={payment.data.worker_confirmed ? 'success' : 'neutral'}
                  >
                    {payment.data.worker_confirmed
                      ? t('bookings.paymentConfirmedBadge')
                      : t('bookings.paymentPendingBadge')}
                  </Badge>
                </div>
              </div>
              {bothConfirmedPayment(payment.data) ? (
                <p className="rounded-lg bg-verified-light px-3 py-2 text-sm font-medium text-verified">
                  {t('bookings.paymentBothConfirmed')}
                </p>
              ) : (
                !viewerHasConfirmedPayment(payment.data, role) && (
                  <Button full onClick={handleConfirm} disabled={busy}>
                    {t('bookings.paymentConfirm')}
                  </Button>
                )
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
