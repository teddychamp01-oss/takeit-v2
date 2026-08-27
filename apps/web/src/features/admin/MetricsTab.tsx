// Tab 5 — metrics tiles. Every number is MEASURED: a head/exact count query
// against the live tables at render time (Gate 3 — nothing here is derived
// or estimated client-side; a failed count says so instead of guessing).

import { useLocale } from '../../lib/i18n';
import { Button } from '../../components/Button';
import { SpinnerBlock } from '../../components/Spinner';
import { useAsync } from './useAsync';
import { fetchMetrics } from './api';
import type { MetricKey } from './types';
import { LoadFailed } from './ui';
import type { MessageKey } from '../../i18n';

const METRIC_LABEL: Record<MetricKey, MessageKey> = {
  pendingVerifications: 'admin.metricPendingVerifications',
  openJobs: 'admin.metricOpenJobs',
  inProgressJobs: 'admin.metricInProgressJobs',
  disputedJobs: 'admin.metricDisputedJobs',
  openReports: 'admin.metricOpenReports',
  openDisputes: 'admin.metricOpenDisputes',
  completedBookings: 'admin.metricCompletedBookings',
  totalWorkers: 'admin.metricTotalWorkers',
};

export function MetricsTab() {
  const { t } = useLocale();
  const metrics = useAsync(fetchMetrics, 'admin-metrics');

  if (metrics.loading) return <SpinnerBlock />;
  if (metrics.failed || !metrics.data) {
    return <LoadFailed onRetry={metrics.reload} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-faint">{t('admin.metricsMeasuredNote')}</p>
        <Button variant="ghost" onClick={metrics.reload}>
          {t('admin.refresh')}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {metrics.data.map((metric) => (
          <div
            key={metric.key}
            className="rounded-2xl bg-white p-4 shadow-sm"
          >
            {metric.count !== null ? (
              <p className="text-2xl font-bold text-ink">{metric.count}</p>
            ) : (
              <p className="text-sm font-semibold text-status-disputed">
                {t('admin.metricFailed')}
              </p>
            )}
            <p className="mt-1 text-xs text-ink-light">
              {t(METRIC_LABEL[metric.key])}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
