// My jobs — three views on one screen (C4 dual-role):
//   * "Posted by me": the customer's jobs with StatusBadge + application count
//   * "Open jobs": the worker feed — a plain SELECT whose matching (category
//     AND travel radius) runs server-side in the jobs_select RLS policy
//   * "My applications" (v1-adoption plan T13): the worker's applications
//     across ALL jobs with status chips — before this tab, a worker had to
//     revisit every job detail to learn an application's fate
// Job rows render through the shared JobCard (v1-adoption plan T3).
// Every list reports what its cap dropped (repo law: silence is not safety).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { formatRelativeTime } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { JobCard } from '../../components/JobCard';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { SpinnerBlock } from '../../components/Spinner';
import { Button } from '../../components/Button';
import { WorkerActivationCard } from '../profile/ui';
import { fetchOwnProfile, fetchOwnWorkerProfile } from '../profile/api';
import type { WorkerProfileRow } from '../profile/types';
import type { MessageKey } from '../../i18n';
import {
  APPLICATION_STATUS_DEF,
  extractApplicationsCount,
  extractEmbedded,
} from './logic';
import {
  fetchActiveCategories,
  fetchMyJobs,
  fetchOpenJobsFeed,
  fetchOwnApplications,
  fetchOwnFlags,
  type CategoryRow,
  type JobListRow,
  type ListPage,
  type OwnApplicationRow,
} from './api';

type Tab = 'mine' | 'feed' | 'applications';

const TAB_KEY: Record<Tab, MessageKey> = {
  mine: 'jobs.tabMine',
  feed: 'jobs.tabFeed',
  applications: 'jobs.tabApplications',
};

interface ListState<T> {
  status: 'loading' | 'error' | 'ready';
  page: ListPage<T> | null;
}

const INITIAL_LIST = { status: 'loading', page: null } as const;

export default function MyJobsPage() {
  const { t } = useLocale();
  const { user } = useSession();
  // A5: every effect below keys on the ID, not the User OBJECT. supabase-js
  // hands SessionProvider a brand-new `user` object on each auth event
  // (token refresh included); with `[user]` deps this page re-ran all three
  // fetches — and the tab effect resets its list to `loading`, so a refresh
  // mid-scroll replaced the list with a spinner. Nothing reads any field but
  // `id` (grep: no user.email / app_metadata / user_metadata / phone here).
  const uid = user?.id ?? null;

  const [isWorker, setIsWorker] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('mine');
  const [mine, setMine] = useState<ListState<JobListRow>>(INITIAL_LIST);
  const [feed, setFeed] = useState<ListState<JobListRow>>(INITIAL_LIST);
  const [apps, setApps] = useState<ListState<OwnApplicationRow>>(INITIAL_LIST);
  const [reload, setReload] = useState(0);
  const [categories, setCategories] = useState<Map<string, CategoryRow>>(
    () => new Map(),
  );
  // Worker activation nudge (T9) pinned atop the feed tab.
  const [activation, setActivation] = useState<{
    worker: WorkerProfileRow;
    avatarUrl: string | null;
  } | null>(null);

  // Which tabs exist (worker tabs only for workers) + default tab.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    fetchOwnFlags(uid)
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
  }, [uid]);

  // Worker activation card data (T9) — fetched once the flags say worker.
  // Best-effort: a failure just hides the card (MePage carries the
  // retryable version); the feed itself is unaffected.
  useEffect(() => {
    if (!uid || isWorker !== true) return;
    let cancelled = false;
    Promise.all([fetchOwnWorkerProfile(uid), fetchOwnProfile(uid)])
      .then(([worker, profile]) => {
        if (!cancelled && worker) {
          setActivation({ worker, avatarUrl: profile?.avatar_url ?? null });
        }
      })
      .catch(() => {
        // Nudge only — never blocks the feed.
      });
    return () => {
      cancelled = true;
    };
  }, [uid, isWorker]);

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
  //
  // A8: HOLD until the flags resolve (isWorker !== null). `tab` starts at
  // 'mine' and flips to 'feed' for a worker-only account the moment
  // fetchOwnFlags answers, so firing here first issued a fetchMyJobs whose
  // answer was thrown away. The page already renders a spinner while
  // isWorker === null (below), so this waits for nothing that was on screen.
  //
  // COST, stated plainly: this serialises fetchOwnFlags → list where the two
  // used to overlap. It removes a wasted request for worker-only accounts and
  // adds one round trip of latency for everyone else. Not measured on a
  // device or a real network — see the report for this change.
  useEffect(() => {
    if (!uid || isWorker === null) return;
    let cancelled = false;
    if (tab === 'applications') {
      setApps({ status: 'loading', page: null });
      fetchOwnApplications(uid)
        .then((page) => {
          if (!cancelled) setApps({ status: 'ready', page });
        })
        .catch(() => {
          if (!cancelled) setApps({ status: 'error', page: null });
        });
    } else {
      const setState = tab === 'mine' ? setMine : setFeed;
      setState({ status: 'loading', page: null });
      (tab === 'mine' ? fetchMyJobs(uid) : fetchOpenJobsFeed(uid))
        .then((page) => {
          if (!cancelled) setState({ status: 'ready', page });
        })
        .catch(() => {
          if (!cancelled) setState({ status: 'error', page: null });
        });
    }
    return () => {
      cancelled = true;
    };
  }, [uid, isWorker, tab, reload]);

  const current: ListState<JobListRow> | ListState<OwnApplicationRow> =
    tab === 'mine' ? mine : tab === 'feed' ? feed : apps;

  const retryAction = (
    <Button variant="secondary" onClick={() => setReload((n) => n + 1)}>
      {t('common.retry')}
    </Button>
  );

  return (
    <div>
      <PageHeader title={t('jobs.myJobsTitle')} />

      {isWorker === true && (
        <div className="flex gap-2 px-4 pt-3" role="tablist">
          {(['mine', 'feed', 'applications'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`min-h-touch flex-1 rounded-full px-2 text-sm font-semibold transition-colors ${
                tab === value
                  ? 'bg-primary text-white'
                  : 'bg-white text-ink-light shadow-sm'
              }`}
            >
              {t(TAB_KEY[value])}
            </button>
          ))}
        </div>
      )}

      {tab === 'feed' && (
        <>
          {activation && (
            <div className="px-4 pt-3">
              <WorkerActivationCard
                worker={activation.worker}
                avatarUrl={activation.avatarUrl}
              />
            </div>
          )}
          <p className="px-4 pt-3 text-xs text-ink-faint">
            {t('jobs.feedHint')}
          </p>
          {/* N6c fixed anti-scam line (africa-B.3): applying is free, never
              pay before work, report anything suspicious. Always visible on
              the feed tab — loading, empty and full states alike. */}
          <p className="mx-4 mt-3 rounded-xl bg-primary-50 p-3 text-sm leading-relaxed text-primary-800">
            {t('jobs.feedAntiScam')}
          </p>
        </>
      )}

      {isWorker === null || current.status === 'loading' ? (
        <SpinnerBlock />
      ) : current.status === 'error' ? (
        <EmptyState title={t('jobs.loadFailed')} action={retryAction} />
      ) : tab === 'applications' ? (
        <ApplicationsList
          state={apps}
          onGoToFeed={() => setTab('feed')}
        />
      ) : (
        <JobsList
          tab={tab}
          state={tab === 'mine' ? mine : feed}
          categories={categories}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Job tabs (shared JobCard)
// ---------------------------------------------------------------------------
function JobsList({
  tab,
  state,
  categories,
}: {
  tab: 'mine' | 'feed';
  state: ListState<JobListRow>;
  categories: Map<string, CategoryRow>;
}) {
  const { t, locale } = useLocale();
  const page = state.page;
  if (!page) return null;

  if (page.rows.length === 0) {
    return tab === 'mine' ? (
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
        // N11b: the REAL count the feed query returned — page.total is the
        // server's exact count of RLS-matched open jobs, and with zero rows
        // it is zero: the title says "0", never a vague "none match" (law 6:
        // a live number, not an invented reassurance).
        title={t('jobs.feedMatchCount', { count: page.total })}
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
    );
  }

  return (
    <ul className="space-y-3 px-4 py-4">
      {page.rows.map((job) => {
        const category = categories.get(job.category_slug);
        return (
          <li key={job.id}>
            <JobCard
              id={job.id}
              title={job.title}
              status={job.status}
              categoryIcon={category?.icon ?? null}
              categoryName={
                category
                  ? locale === 'am'
                    ? category.name_am
                    : category.name_en
                  : job.category_slug
              }
              dateNeeded={job.date_needed}
              budgetCents={job.budget_cents}
            >
              <JobMetaRow job={job} showApplications={tab === 'mine'} />
            </JobCard>
          </li>
        );
      })}
      {page.total > page.rows.length && (
        <li className="pt-1 text-center text-xs text-ink-faint">
          {t('jobs.truncatedNote', {
            shown: page.rows.length,
            total: page.total,
          })}
        </li>
      )}
    </ul>
  );
}

/** Page-specific footer inside the shared JobCard. */
function JobMetaRow({
  job,
  showApplications,
}: {
  job: JobListRow;
  showApplications: boolean;
}) {
  const { t, locale } = useLocale();
  const applicationCount = extractApplicationsCount(job.applications);

  return (
    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
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
        {job.time_window && (
          <span className="truncate text-ink-faint">{job.time_window}</span>
        )}
        {job.is_diaspora && (
          <span className="rounded-full bg-primary-100 px-2 py-0.5 font-medium text-primary-700">
            {t('jobs.diasporaBadge')}
          </span>
        )}
      </span>
      <span className="shrink-0 text-ink-faint">
        {formatRelativeTime(job.created_at, locale)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "My applications" tab (T13)
// ---------------------------------------------------------------------------
function ApplicationsList({
  state,
  onGoToFeed,
}: {
  state: ListState<OwnApplicationRow>;
  onGoToFeed: () => void;
}) {
  const { t } = useLocale();
  const page = state.page;
  if (!page) return null;

  if (page.rows.length === 0) {
    return (
      <EmptyState
        title={t('jobs.emptyApplicationsTitle')}
        body={t('jobs.emptyApplicationsBody')}
        action={
          <Button variant="secondary" onClick={onGoToFeed}>
            {t('jobs.emptyApplicationsCta')}
          </Button>
        }
      />
    );
  }

  return (
    <ul className="space-y-3 px-4 py-4">
      {page.rows.map((row) => (
        <li key={row.id}>
          <OwnApplicationCard row={row} />
        </li>
      ))}
      {page.total > page.rows.length && (
        <li className="pt-1 text-center text-xs text-ink-faint">
          {t('jobs.truncatedNote', {
            shown: page.rows.length,
            total: page.total,
          })}
        </li>
      )}
    </ul>
  );
}

function OwnApplicationCard({ row }: { row: OwnApplicationRow }) {
  const { t, locale } = useLocale();
  // NULL when jobs_select RLS hides the job from this worker (e.g. it matched
  // someone else) — the application still shows, degraded and unlinked.
  const job = extractEmbedded(row.job);
  const def = APPLICATION_STATUS_DEF[row.status];

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold text-ink">
          {job ? job.title : t('jobs.applicationJobUnavailable')}
        </span>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${def.cls}`}
        >
          {t(def.key)}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        {job ? (
          <StatusBadge kind="job" status={job.status} />
        ) : (
          <span aria-hidden="true" />
        )}
        <span className="text-ink-faint">
          {formatRelativeTime(row.created_at, locale)}
        </span>
      </div>
    </>
  );

  if (!job) {
    return <div className="rounded-2xl bg-white p-4 opacity-70 shadow-card">{body}</div>;
  }
  return (
    <Link
      to={`/jobs/${job.id}`}
      className="block rounded-2xl bg-white p-4 shadow-card transition-colors active:bg-primary-50"
    >
      {body}
    </Link>
  );
}
