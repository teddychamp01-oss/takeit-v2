import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n';

export function PageHeader({
  title,
  back = false,
  action,
}: {
  title: string;
  /** Show a back button (uses history). */
  back?: boolean;
  /** Right-aligned action slot (≤1 primary action — SPEC screen rules). */
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  const t = useT();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-ink/5 bg-cream/95 px-3 py-2 backdrop-blur">
      {back && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="flex h-touch w-touch items-center justify-center rounded-full text-ink active:bg-ink/5"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate px-1 text-lg font-bold text-ink">
        {title}
      </h1>
      {action}
    </header>
  );
}
