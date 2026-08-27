// Trust signal — verification level chip. Renders nothing for 'none'
// (absence of trust is shown by absence, never by a scary label on cards).

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

export function VerifiedBadge({
  level,
  showLabel = true,
}: {
  level: VerificationLevel;
  showLabel?: boolean;
}) {
  const t = useT();
  if (level === 'none') return null;
  const def = LEVEL_DEF[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${def.cls}`}
      aria-label={t(def.key)}
    >
      <CheckIcon />
      {showLabel && t(def.key)}
    </span>
  );
}
