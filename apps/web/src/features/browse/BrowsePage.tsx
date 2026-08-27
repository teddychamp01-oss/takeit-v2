// Browse — category grid + search. The search box filters categories
// client-side instantly and (for signed-in users, RLS requires it) runs a
// LENGTH-BOUNDED, debounced worker-name search against worker_profiles.
// Worker ordering: most verified first, stable user_id tiebreak — never
// geography by the alphabet.

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { PageHeader } from '../../components/PageHeader';
import { Input } from '../../components/Input';
import { EmptyState } from '../../components/EmptyState';
import { SpinnerBlock } from '../../components/Spinner';
import { WorkerCard } from '../../components/WorkerCard';
import { fetchCategories, searchWorkersByName } from './api';
import {
  SEARCH_MAX_LEN,
  categoryMatchesQuery,
  sanitizeSearchTerm,
  workerCardFromListRow,
} from './logic';
import { useAsync } from './useAsync';
import { CategoryGrid, ErrorCard, SectionTitle, SignInCard } from './ui';

const DEBOUNCE_MS = 300;

export default function BrowsePage() {
  const { t } = useLocale();
  const { user, loading: sessionLoading } = useSession();

  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(input), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input]);

  const categories = useAsync(fetchCategories, 'categories');

  const searchable = user != null && sanitizeSearchTerm(debounced) !== null;
  const workers = useAsync(
    () => searchWorkersByName(debounced),
    `search:${debounced}`,
    searchable,
  );

  const visibleCategories = useMemo(
    () =>
      (categories.data ?? []).filter((category) =>
        categoryMatchesQuery(category, input),
      ),
    [categories.data, input],
  );

  const typing = input.trim().length > 0;

  return (
    <div>
      <PageHeader title={t('browse.title')} />
      <div className="space-y-5 p-4">
        <Input
          type="search"
          inputMode="search"
          maxLength={SEARCH_MAX_LEN}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('browse.searchPlaceholder')}
          aria-label={t('common.search')}
        />

        <section aria-label={t('browse.allCategories')}>
          <SectionTitle>{t('browse.allCategories')}</SectionTitle>
          {categories.loading ? (
            <SpinnerBlock />
          ) : categories.failed ? (
            <ErrorCard onRetry={categories.reload} />
          ) : visibleCategories.length === 0 ? (
            <EmptyState title={t('browse.noResults')} />
          ) : (
            <CategoryGrid categories={visibleCategories} />
          )}
        </section>

        {typing && (
          <section aria-label={t('browse.workersSection')}>
            <SectionTitle>{t('browse.workersSection')}</SectionTitle>
            {sessionLoading ? (
              <SpinnerBlock />
            ) : !user ? (
              <SignInCard
                title={t('browse.signInToSearch')}
                body={t('home.signInBody')}
              />
            ) : !searchable ? (
              <p className="text-sm text-ink-faint">{t('browse.searchHint')}</p>
            ) : workers.loading ? (
              <SpinnerBlock />
            ) : workers.failed ? (
              <ErrorCard onRetry={workers.reload} />
            ) : !workers.data || workers.data.rows.length === 0 ? (
              <EmptyState title={t('browse.noResults')} />
            ) : (
              <>
                {workers.data.total != null &&
                  workers.data.total > workers.data.rows.length && (
                    <p className="mb-2 text-xs text-ink-faint">
                      {t('browse.showingWorkers', {
                        shown: workers.data.rows.length,
                        total: workers.data.total,
                      })}
                    </p>
                  )}
                <ul className="space-y-2">
                  {workers.data.rows.map((row) => (
                    <li key={row.user_id}>
                      <WorkerCard {...workerCardFromListRow(row)} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
