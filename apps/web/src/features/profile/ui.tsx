// Small presentational pieces internal to the profile + verification feature.
// Promoted to src/components/ only if another feature ever needs one.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLocale, useT } from '../../lib/i18n';
import { microCaps } from '../../lib/typography';
import { Button } from '../../components/Button';
import { Badge, type BadgeTone } from '../../components/Badge';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { computeProfileCompletion } from './logic';
import type { MessageKey } from '../../i18n';
import type {
  GuarantorStatus,
  VerificationStatus,
  WorkerProfileRow,
} from './types';

/** Inline query-failure card: localized message + retry. Never raw errors. */
export function ErrorCard({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-5 text-center shadow-sm">
      <p className="text-sm text-ink-light">{t('common.error')}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-base font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-ink-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** Thumb-sized navigation row (44px+ target) with a trailing chevron. */
export function RowLink({
  to,
  title,
  hint,
  trailing,
}: {
  to: string;
  title: string;
  hint?: string;
  trailing?: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-touch items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm transition-colors active:bg-primary-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink">{title}</span>
        {hint && (
          <span className="block truncate text-xs text-ink-faint">{hint}</span>
        )}
      </span>
      {trailing}
      <Chevron />
    </Link>
  );
}

const VERIFICATION_STATUS_DEF: Record<
  VerificationStatus,
  { key: MessageKey; tone: BadgeTone }
> = {
  pending: { key: 'verification.statusPending', tone: 'warning' },
  approved: { key: 'verification.statusApproved', tone: 'success' },
  rejected: { key: 'verification.statusRejected', tone: 'danger' },
};

export function VerificationStatusBadge({
  status,
}: {
  status: VerificationStatus;
}) {
  const t = useT();
  const def = VERIFICATION_STATUS_DEF[status];
  return <Badge tone={def.tone}>{t(def.key)}</Badge>;
}

const GUARANTOR_STATUS_DEF: Record<
  GuarantorStatus,
  { key: MessageKey; tone: BadgeTone }
> = {
  pending: { key: 'verification.gStatusPending', tone: 'warning' },
  verified: { key: 'verification.gStatusVerified', tone: 'success' },
  rejected: { key: 'verification.gStatusRejected', tone: 'danger' },
};

export function GuarantorStatusBadge({ status }: { status: GuarantorStatus }) {
  const t = useT();
  const def = GUARANTOR_STATUS_DEF[status];
  return <Badge tone={def.tone}>{t(def.key)}</Badge>;
}

/**
 * Worker activation nudge (T9): current verification level + CTA to
 * /me/verification, plus a profile-completion meter COMPUTED from real
 * fields via computeProfileCompletion — NEVER a hardcoded % (Gate 3).
 * Mounted on MePage for worker-role users (and on MyJobsPage's feed tab).
 */
export function WorkerActivationCard({
  worker,
  avatarUrl,
}: {
  worker: WorkerProfileRow;
  /** From the profiles row — avatars live there, not on worker_profiles. */
  avatarUrl: string | null;
}) {
  const { t, locale } = useLocale();
  const completion = computeProfileCompletion({
    bio: worker.bio,
    categories: worker.categories,
    price_min_cents: worker.price_min_cents,
    price_max_cents: worker.price_max_cents,
    neighborhood: worker.neighborhood,
    avatar_url: avatarUrl,
    availability: worker.availability,
  });
  const level = worker.verification_level;
  const needsVerification = level === 'none' || level === 'basic';
  return (
    <section className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* N14: caps/tracking en-only — fidel has no case (africa-G.4) */}
          <p className={`text-xs font-bold text-ink-faint ${microCaps(locale)}`}>
            {t('profile.activationVerification')}
          </p>
          <div className="mt-1">
            {level === 'none' ? (
              <span className="text-sm font-semibold text-ink-light">
                {t('common.verificationNone')}
              </span>
            ) : (
              <VerifiedBadge level={level} />
            )}
          </div>
        </div>
        <Link
          to="/me/verification"
          className="inline-flex min-h-touch shrink-0 items-center rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-button transition active:bg-primary-600 motion-safe:active:scale-95"
        >
          {needsVerification
            ? t('verification.getVerified')
            : t('profile.activationManageCta')}
        </Link>
      </div>
      {completion.percent < 100 && (
        <div className="mt-3 border-t border-ink/10 pt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-faint">{t('profile.completionLabel')}</span>
            <span className="font-bold text-ink">{completion.percent}%</span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-ink/5"
            role="img"
            aria-label={`${t('profile.completionLabel')}: ${completion.percent}%`}
          >
            <div
              className="brand-gradient h-full rounded-full"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          <Link
            to="/me/worker"
            className="mt-1 inline-flex min-h-touch items-center text-xs font-semibold text-primary-600"
          >
            {t('profile.completionCta')}
          </Link>
        </div>
      )}
    </section>
  );
}

/** Selectable chip (day-of-week, category) — 44px target, aria-pressed. */
export function ChoiceChip({
  selected,
  onToggle,
  children,
}: {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`min-h-touch rounded-xl border px-3 text-sm font-semibold transition-colors ${
        selected
          ? 'border-primary bg-primary-50 text-primary-700'
          : 'border-ink/15 bg-white text-ink-light'
      }`}
    >
      {children}
    </button>
  );
}
