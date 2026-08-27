// Trust signal — verification level chip. Renders nothing for 'none'
// (absence of trust is shown by absence, never by a scary label on cards).
//
// N5 (trust-F7): an optional onClick turns the chip into a real <button> so
// surfaces like WorkerDetailPage can open the "what we checked" sheet from
// the badge itself. A tappable chip carries a small info glyph so the
// affordance is visible, and aria-haspopup announces the dialog.

import { useT } from '../lib/i18n';
import type { MessageKey } from '../i18n';

export type VerificationLevel =
  | 'none'
  | 'basic'
  | 'id_verified'
  | 'fayda_verified'
  | 'pro_certified';

const LEVEL_DEF: Record<
  Exclude<VerificationLevel, 'none'>,
  { key: MessageKey; cls: string }
> = {
  basic: { key: 'common.verificationBasic', cls: 'bg-ink/5 text-ink-light' },
  id_verified: {
    key: 'common.verificationIdVerified',
    cls: 'bg-verified-light text-verified',
  },
  fayda_verified: {
    key: 'common.verificationFaydaVerified',
    cls: 'bg-verified-light text-verified',
  },
  pro_certified: {
    key: 'common.verificationProCertified',
    cls: 'bg-primary-100 text-primary-700',
  },
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.6 6.1l-4.2 4.5a.75.75 0 01-1.1 0L4.4 8.5a.75.75 0 011.1-1l1.35 1.5 3.65-3.9a.75.75 0 111.1 1z" />
    </svg>
  );
}

/** Small circled-i glyph — shown only when the chip is tappable. */
function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 opacity-70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7.2v3.6" strokeLinecap="round" />
      <circle cx="8" cy="4.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function VerifiedBadge({
  level,
  showLabel = true,
  onClick,
}: {
  level: VerificationLevel;
  showLabel?: boolean;
  /** When set, the chip renders as a button (e.g. opens the badge sheet). */
  onClick?: () => void;
}) {
  const t = useT();
  if (level === 'none') return null;
  const def = LEVEL_DEF[level];
  const cls = `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${def.cls}`;

  if (onClick) {
    // The visual chip stays compact, but the hit area must meet the repo's
    // 44px touch token: padding grows the target, the negative margin gives
    // the space back to the layout, so neighbors don't shift.
    return (
      <button
        type="button"
        onClick={onClick}
        aria-haspopup="dialog"
        aria-label={t(def.key)}
        className="-m-2.5 inline-flex min-h-touch min-w-touch items-center justify-center p-2.5 active:opacity-80"
      >
        <span className={cls}>
          <CheckIcon />
          {showLabel && t(def.key)}
          <InfoIcon />
        </span>
      </button>
    );
  }

  return (
    <span className={cls} aria-label={t(def.key)}>
      <CheckIcon />
      {showLabel && t(def.key)}
    </span>
  );
}
