// Small presentational pieces shared by the admin tabs (feature-local).

import { useT } from '../../lib/i18n';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { listWasCapped } from './logic';

/** Horizontal filter/tab chip with a 44px touch target. */
export function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-touch shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
        active ? 'bg-primary text-white' : 'bg-white text-ink-light shadow-sm'
      }`}
    >
      {label}
    </button>
  );
}

/** Standard per-tab load failure with retry (raw errors never shown). */
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <EmptyState
      title={t('admin.loadFailedTitle')}
      body={t('admin.loadFailedBody')}
      action={
        <Button variant="secondary" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      }
    />
  );
}

/** Visible cap notice — a capped list must say what it dropped (law 6). */
export function CappedNotice({
  shown,
  total,
}: {
  shown: number;
  total: number | null;
}) {
  const t = useT();
  if (!listWasCapped(shown, total)) return null;
  return (
    <p className="rounded-lg bg-ink/5 px-3 py-2 text-center text-xs text-ink-faint">
      {t('admin.showingOf', { shown, total: total ?? shown })}
    </p>
  );
}
