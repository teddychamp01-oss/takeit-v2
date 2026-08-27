import { useT } from '../lib/i18n';

export function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  const t = useT();
  return (
    <svg
      role="status"
      aria-label={t('common.loading')}
      className={`animate-spin text-primary ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

/** Full-area centered spinner (route fallback, gate loading states). */
export function SpinnerBlock() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}
