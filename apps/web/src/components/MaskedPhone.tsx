// Masked phone display (SPEC C3 — anti-disintermediation).
//
// Contract: pre-booking the server sends ONLY the masked value; `full` should
// not even reach the client until the booking is confirmed (RLS enforces
// that). This component is belt-and-braces on top: even if `full` is passed,
// it is NEVER rendered unless `bookingConfirmed` is true AND the user taps
// reveal. Do not "simplify" this into showing `full` whenever present.

import { useState } from 'react';
import { useT } from '../lib/i18n';

export interface MaskedPhoneProps {
  /** Masked display value from the server, e.g. '+2519****567'. */
  masked: string;
  /** Full number — only ever provided by the server post-confirmation. */
  full?: string | null;
  /** Reveal is allowed ONLY when the booking is confirmed. */
  bookingConfirmed: boolean;
}

export function MaskedPhone({ masked, full, bookingConfirmed }: MaskedPhoneProps) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const canReveal = bookingConfirmed && !!full;

  if (revealed && canReveal) {
    return (
      <a
        href={`tel:${full}`}
        className="font-semibold text-primary-600 underline"
      >
        {full}
      </a>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-semibold tracking-wide text-ink">{masked}</span>
      {canReveal ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="min-h-touch text-sm font-semibold text-primary-600"
        >
          {t('common.revealPhone')}
        </button>
      ) : (
        <span className="text-xs text-ink-faint">
          {t('common.phoneHiddenUntilBooking')}
        </span>
      )}
    </span>
  );
}
