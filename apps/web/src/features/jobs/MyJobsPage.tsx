// My jobs — two views on one screen (C4 dual-role):
//   * "Posted by me": the customer's jobs with StatusBadge + application count
//   * "Open jobs": the worker feed — a plain SELECT whose matching (category
//     AND travel radius) runs server-side in the jobs_select RLS policy
// Every list reports what its cap dropped (repo law: silence is not safety).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { formatETB, formatRelativeTime } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { SpinnerBlock } from '../../components/Spinner';
import { Button } from '../../components/Button';
import {
  extractApplicationsCount,
  formatDateNeeded,
} from './logic';
import {
  fetchActiveCategories,
  fetchMyJobs,
  fetchOpenJobsFeed,
  fetchOwnFlags,
  type CategoryRow,
  type JobListRow,
  type ListPage,
} from './api';

type Tab = 'mine' | 'feed';

interface ListState {
  status: 'loading' | 'error' | 'ready';
  page: ListPage<JobListRow> | null;
}

const INITIAL_LIST: ListState = { status: 'loading', page: null };

export default function MyJobsPage() {
  const { t, locale } = useLocale();
  const { user } = useSession();

  const [isWorker, setIsWorker] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('mine');
  const [mine, setMine] = useState<ListState>(INITIAL_LIST);
  const [feed, setFeed] = useState<ListState>(INITIAL_LIST);
  const [reload, setReload] = useState(0);
  const [categories, setCategories] = useState<Map<string, CategoryRow>>(
    () => new Map(),
  );

  // Which tabs exist (worker feed only for workers) + default tab.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchOwnFlags(user.id)
      .then((flags) => {
        if (cancelled) return;
        const worker = flags?.is_worker ?? false;
        setIsWorker(worker);
        if (worker && flags?.is_customer === false) setTab('feed');
      })
      .catch(() => {
        if (!cancelled) setIsWorker(false); // customer list still works
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Category names for the rows (best-effort; slugs render as fallback).
  useEffect(() => {
    let cancelled = false;
    fetchActiveCategories()
      .then((rows) => {
        if (!cancelled) setCategories(new Map(rows.map((c) => [c.slug, c])));
      })
      .catch(() => {
        // Non-fatal: rows fall back to the raw slug.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Per-tab data.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const setState = tab === 'mine' ? setMine : setFeed;
    setState({ status: 'loading', page: null });
    (tab === 'mine' ? fetchMyJobs(user.id) : fetchOpenJobsFeed(user.id))
      .then((page) => {
        if (!cancelled) setState({ status: 'ready', page });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', page: null });
      });
    return () => {
      cancelled = true;
    };
  }, [user, tab, reload]);

  const current = tab === 'mine' ? mine : feed;

  const categoryLabel = (slug: string): string => {
    const c = categories.get(slug);
    if (!c) return slug;
    const name = locale === 'am' ? c.name_am : c.name_en;
    return c.icon ? `${c.icon} ${name}` : name;
  };

  return (
    <div>
      <PageHeader title={t('jobs.myJobsTitle')} />

      {isWorker === true && (
        <div className="flex gap-2 px-4 pt-3" role="tablist">
          {(['mine', 'feed'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`min-h-touch flex-1 rounded-full text-sm font-semibold transition-colors ${
                tab === value
                  ? 'bg-primary text-white'
                  : 'bg-white text-ink-light shadow-sm'
              }`}
            >
              {t(value === 'mine' ? 'jobs.tabMine' : 'jobs.tabFeed')}
            </button>
          ))}
        </div>
      )}

      {tab === 'feed' && (
        <p className="px-4 pt-3 text-xs text-ink-faint">{t('jobs.feedHint')}</p>
      )}

      {isWorker === null || current.status === 'loading' ? (
        <SpinnerBlock />
      ) : current.status === 'error' ? (
        <EmptyState
          title={t('jobs.loadFailed')}
          action={
            <Button
              variant="secondary"
              onClick={() => setReload((n) => n + 1)}
            >
              {t('common.retry')}
            </Button>
          }
        />
      ) : current.page && current.page.rows.length === 0 ? (
        tab === 'mine' ? (
          <EmptyState
            title={t('jobs.emptyMineTitle')}
            body={t('jobs.emptyMineBody')}
            action={
              <Link
                to="/post"
                className="inline-flex min-h-touch items-center rounded-xl bg-primary px-5 font-semibold text-white"
              >
                {t('jobs.postTitle')}
              </Link>
            }
          />
        ) : (
          <EmptyState
            title={t('jobs.emptyFeedTitle')}
            body={t('jobs.emptyFeedBody')}
            action={
              <Link
                to="/me/worker"
                className="inline-flex min-h-touch items-center rounded-xl bg-primary px-5 font-semibold text-white"
              >
                {t('jobs.emptyFeedCta')}
              </Link>
            }
          />
        )
      ) : current.page ? (
        <ul className="space-y-3 px-4 py-4">
          {current.page.rows.map((job) => (
            <li key={job.id}>
              <JobRow
                job={job}
                categoryLabel={categoryLabel(job.category_slug)}
                showApplications={tab === 'mine'}
              />
            </li>
          ))}
          {current.page.total > current.page.rows.length && (
            <li className="pt-1 text-center text-xs text-ink-faint">
              {t('jobs.truncatedNote', {
                shown: current.page.rows.length,
                total: current.page.total,
              })}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

function JobRow({
  job,
  categoryLabel,
  showApplications,
}: {
  job: JobListRow;
  categoryLabel: string;
  showApplications: boolean;
}) {
  const { t, locale } = useLocale();
  const applicationCount = extractApplicationsCount(job.applications);
  const when = [
    job.date_needed ? formatDateNeeded(job.date_needed, locale) : '',
    job.time_window ?? '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      to={`/jobs/${job.id}`}
      className="block rounded-2xl bg-white p-4 shadow-sm transition-colors active:bg-primary-50"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold text-ink">
          {job.title}
        </span>
        <StatusBadge kind="job" status={job.status} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-faint">
        <span>{categoryLabel}</span>
        {when && <span>{when}</span>}
        {job.budget_cents != null && (
          <span className="font-medium text-ink-light">
            {formatETB(job.budget_cents)}
          </span>
        )}
        {job.is_diaspora && (
          <span className="rounded-full bg-primary-100 px-2 py-0.5 font-medium text-primary-700">
            {t('jobs.diasporaBadge')}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        {showApplications ? (
          <span
            className={`font-semibold ${applicationCount > 0 ? 'text-primary-700' : 'text-ink-faint'}`}
          >
            {t('jobs.applicationsCount', { count: applicationCount })}
          </span>
        ) : (
          <span className="text-ink-faint">
            {t('jobs.workersCount', { count: job.workers_needed })}
          </span>
        )}
        <span className="text-ink-faint">
          {formatRelativeTime(job.created_at, locale)}
        </span>
      </div>
    </Link>
  );
}
