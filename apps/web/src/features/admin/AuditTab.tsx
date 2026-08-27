// Tab 6 — audit log viewer with entity filters. audit_log SELECT is gated to
// the 'admin' ROLE only (not ops) by RLS; when the caller is not admin the
// tab says so explicitly instead of showing a silently empty list.

import { useState } from 'react';
import { useLocale } from '../../lib/i18n';
import { formatRelativeTime } from '../../lib/format';
import { EmptyState } from '../../components/EmptyState';
import { SpinnerBlock } from '../../components/Spinner';
import { useAsync } from './useAsync';
import { fetchAuditLog } from './api';
import { AUDIT_ENTITIES, shortId, type AuditEntity } from './logic';
import type { AuditLogRow } from './types';
import { CappedNotice, Chip, LoadFailed } from './ui';

function AuditRow({ row }: { row: AuditLogRow }) {
  const { locale, t } = useLocale();
  const hasDiff =
    row.diff !== null &&
    typeof row.diff === 'object' &&
    Object.keys(row.diff as object).length > 0;
  return (
    <article className="rounded-2xl bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {row.action}
        </p>
        <span className="shrink-0 text-xs text-ink-faint">
          {formatRelativeTime(row.created_at, locale)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink-light">
        {row.entity}
        {row.entity_id ? ` · ${shortId(row.entity_id)}` : ''}
      </p>
      <p className="text-xs text-ink-faint">
        {t('admin.auditActorLabel')}:{' '}
        {row.actor_id ? shortId(row.actor_id) : t('admin.auditSystemActor')}
      </p>
      {hasDiff && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs font-semibold text-primary-600">
            {t('admin.auditDiffLabel')}
          </summary>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-ink/5 p-2 text-xs text-ink-light">
            {JSON.stringify(row.diff, null, 2)}
          </pre>
        </details>
      )}
    </article>
  );
}

export function AuditTab({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useLocale();
  const [entity, setEntity] = useState<AuditEntity | 'all'>('all');
  const log = useAsync(
    () => fetchAuditLog(entity),
    `admin-audit:${entity}`,
    isAdmin,
  );

  if (!isAdmin) {
    return (
      <EmptyState
        title={t('admin.auditEmptyTitle')}
        body={t('admin.auditAdminOnly')}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip
          active={entity === 'all'}
          label={t('admin.auditAllEntities')}
          onClick={() => setEntity('all')}
        />
        {AUDIT_ENTITIES.map((value) => (
          <Chip
            key={value}
            active={entity === value}
            label={value}
            onClick={() => setEntity(value)}
          />
        ))}
      </div>

      {log.loading ? (
        <SpinnerBlock />
      ) : log.failed || !log.data ? (
        <LoadFailed onRetry={log.reload} />
      ) : log.data.rows.length === 0 ? (
        <EmptyState
          title={t('admin.auditEmptyTitle')}
          body={t('admin.auditEmptyBody')}
        />
      ) : (
        <>
          <CappedNotice shown={log.data.rows.length} total={log.data.total} />
          {log.data.rows.map((row) => (
            <AuditRow key={row.id} row={row} />
          ))}
        </>
      )}
    </div>
  );
}
