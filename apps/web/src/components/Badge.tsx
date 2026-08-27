import type { ReactNode } from 'react';

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-ink/5 text-ink-light',
  primary: 'bg-primary-100 text-primary-700',
  success: 'bg-verified-light text-verified',
  warning: 'bg-primary-50 text-primary-800',
  danger: 'bg-status-disputed/10 text-status-disputed',
  info: 'bg-status-open/10 text-status-open',
};

export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
