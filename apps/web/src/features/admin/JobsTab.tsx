// Tab 2 — jobs oversight: every job (ops/admin RLS read), status filter
// chips, dense read-only rows. Job state changes stay RPC-only by design —
// this tab observes, it does not mutate.

import { useState } from 'react';
import { useLocale } from '../../lib/i18n';
import { formatETB, formatRelativeTime } from '../../lib/format';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { SpinnerBlock } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { useAsync } from './useAsync';
import { fetchJobsOversight } from './api';
import type { AdminJobRow, JobStatus } from './types';
import { CappedNotice, Chip, LoadFailed } from './ui';

const STATUS_FILTERS: readonly (JobStatus | 'all')[] = [
  'all',
  'open',
  'matched',
  'in_progress',
  'completed',
  'cancelled',
  'disputed',
];

function JobRow({ row }: { row: AdminJobRow }) {
  const { locale, t } = useLocale();
  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-semibold text-ink">
          {row.title}
        </p>
        <StatusBadge kind="job" status={row.status} />
      </div>
      <p className="mt-0.5 truncate text-sm text-ink-light">
        {t('admin.customerLabel')}:{' '}
        {row.customer?.display_name || t('admin.unknownUser')}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone="neutral">{row.category_slug}</Badge>
        {row.service_neighborhood && (
          <Badge tone="neutral">{row.service_neighborhood}</Badge>
        )}
        {row.is_diaspora && <Badge tone="primary">{t('admin.diaspora')}</Badge>}
        {row.is_seed && <Badge tone="warning">{t('admin.seed')}</Badge>}
        <span className="ml-auto text-xs text-ink-faint">
          {formatRelativeTime(row.created_at, locale)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-ink">
          {row.budget_cents !== null
            ? formatETB(row.budget_cents)
            : t('admin.budgetNone')}
        </span>
        <span className="text-ink-light">
          {t('admin.workersNeeded', { count: row.workers_needed })}
        </span>
      </div>
    </article>
  );
}

const STATUS_CHIP_LABEL = {
  open: 'common.jobStatusOpen',
  matched: 'common.jobStatusMatched',
  in_progress: 'common.jobStatusInProgress',
  completed: 'common.jobStatusCompleted',
  cancelled: 'common.jobStatusCancelled',
  disputed: 'common.jobStatusDisputed',
} as const;

export function JobsTab() {
  const { t } = useLocale();
  const [filter, setFilter] = useState<JobStatus | 'all'>('all');
  const jobs = useAsync(
    () => fetchJobsOversight(filter),
    `admin-jobs:${filter}`,
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((value) => (
          <Chip
            key={value}
            active={filter === value}
            label={
              value === 'all' ? t('admin.filterAll') : t(STATUS_CHIP_LABEL[value])
            }
            onClick={() => setFilter(value)}
          />
        ))}
      </div>

      {jobs.loading ? (
        <SpinnerBlock />
      ) : jobs.failed || !jobs.data ? (
        <LoadFailed onRetry={jobs.reload} />
      ) : jobs.data.rows.length === 0 ? (
        <EmptyState
          title={t('admin.jobsEmptyTitle')}
          body={t('admin.jobsEmptyBody')}
        />
      ) : (
        <>
          <CappedNotice shown={jobs.data.rows.length} total={jobs.data.total} />
          {jobs.data.rows.map((row) => (
            <JobRow key={row.id} row={row} />
          ))}
        </>
      )}
    </div>
  );
}
