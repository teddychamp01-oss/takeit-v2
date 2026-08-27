// Small presentational pieces shared between the home and browse features
// (both owned by the home+browse agent). Anything here is feature-internal —
// promoted to src/components/ only if another feature ever needs it.

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useLocale } from '../../lib/i18n';
import { formatETB } from '../../lib/format';
import { Button } from '../../components/Button';
import {
  categoryName,
  checklistText,
  parseChecklist,
} from './logic';
import type { Category, PackageRow } from './types';

/** Inline query-failure card: localized message + retry. Never raw errors. */
export function ErrorCard({ onRetry }: { onRetry: () => void }) {
  const { t } = useLocale();
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

/** 8-category launch grid (4×2 on a phone). Data comes from service_categories. */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  const { locale } = useLocale();
  return (
    <ul className="grid grid-cols-4 gap-2">
      {categories.map((category) => (
        <li key={category.slug}>
          <Link
            to={`/browse/c/${category.slug}`}
            className="flex min-h-touch flex-col items-center gap-1 rounded-2xl bg-white p-2 pt-3 text-center shadow-sm transition-colors active:bg-primary-50"
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              {category.icon ?? '🧰'}
            </span>
            <span className="text-[11px] font-semibold leading-tight text-ink">
              {categoryName(category, locale)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Sign-in prompt shown wherever RLS hides data from signed-out visitors. */
export function SignInCard({ title, body }: { title: string; body: string }) {
  const { t } = useLocale();
  return (
    <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
      <h3 className="font-bold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-ink-light">{body}</p>
      <Link to="/auth" className="mt-3 inline-block">
        <Button variant="primary">{t('home.signInCta')}</Button>
      </Link>
    </div>
  );
}

/** Standardized offering: name, price, duration, checklist. Money via formatETB. */
export function PackageCard({ pkg }: { pkg: PackageRow }) {
  const { locale, t } = useLocale();
  const items = parseChecklist(pkg.checklist);
  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-ink">
          {locale === 'am' ? pkg.name_am : pkg.name_en}
        </h3>
        <span className="shrink-0 font-bold text-primary-700">
          {formatETB(pkg.base_price_cents)}
        </span>
      </div>
      {pkg.duration_min != null && (
        <p className="mt-0.5 text-xs text-ink-faint">
          {t('browse.packageDuration', { min: pkg.duration_min })}
        </p>
      )}
      {pkg.description && (
        <p className="mt-1 text-sm text-ink-light">{pkg.description}</p>
      )}
      {items.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-ink-faint">
            {t('browse.packageIncludes')}
          </p>
          <ul className="mt-1 space-y-0.5">
            {items.map((item, index) => (
              <li
                key={index}
                className="flex items-start gap-1.5 text-sm text-ink-light"
              >
                <span aria-hidden="true" className="mt-0.5 text-verified">
                  ✓
                </span>
                {checklistText(item, locale)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
