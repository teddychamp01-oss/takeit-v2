import { useT } from '../lib/i18n';

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 ${filled ? 'text-primary' : 'text-ink/15'}`}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.11l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.5z" />
    </svg>
  );
}

/**
 * 5-star display (read-only). `value` 0–5; `count` optionally shows the
 * review count. New workers (no reviews) show a neutral em dash, not 0.0 —
 * an unrated worker is unknown, not bad.
 */
export function RatingStars({
  value,
  count,
}: {
  value: number | null;
  count?: number;
}) {
  const t = useT();
  const safe = value == null ? 0 : Math.max(0, Math.min(5, value));
  const rounded = Math.round(safe);
  return (
    <span
      className="inline-flex items-center gap-1"
      role="img"
      aria-label={`${t('common.rating')}: ${value == null ? '—' : safe.toFixed(1)}`}
    >
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} filled={value != null && i <= rounded} />
        ))}
      </span>
      <span className="text-sm font-semibold text-ink">
        {value == null ? '—' : safe.toFixed(1)}
      </span>
      {count != null && (
        <span className="text-xs text-ink-faint">({count})</span>
      )}
    </span>
  );
}
