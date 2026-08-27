import type { ReactNode } from 'react';

function DefaultIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="h-12 w-12 text-ink/20"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden="true"
    >
      <rect x="8" y="12" width="32" height="26" rx="5" />
      <path d="M8 24h10l3 4h6l3-4h10" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon ?? <DefaultIcon />}
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {body && <p className="max-w-xs text-sm text-ink-light">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
