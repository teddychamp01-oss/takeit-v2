// Tab 4 — reports & disputes queues with resolve actions. Writes exactly the
// ops column grants: reports(status, resolved_by, notes) and
// disputes(status, resolution, resolved_by). Resolving a dispute record does
// NOT move the booking out of 'disputed' — booking state is RPC-only and the
// schema has no admin transition; the UI says so instead of implying it.

import { useState } from 'react';
import { useLocale } from '../../lib/i18n';
import { formatRelativeTime } from '../../lib/format';
import { Badge, type BadgeTone } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { SpinnerBlock } from '../../components/Spinner';
import { TextArea } from '../../components/TextArea';
import { useAsync } from './useAsync';
import {
  fetchDisputes,
  fetchReports,
  updateDispute,
  updateReport,
} from './api';
import {
  availableDisputeActions,
  availableReportActions,
  shortId,
  type ModerationAction,
} from './logic';
import type { DisputeStatus, ReportStatus } from './types';
import { CappedNotice, Chip, LoadFailed } from './ui';
import type { MessageKey } from '../../i18n';

type QueueStatus = ReportStatus; // reports and disputes share enum values

const STATUS_FILTERS: readonly (QueueStatus | 'all')[] = [
  'all',
  'open',
  'reviewing',
  'resolved',
  'dismissed',
];

const STATUS_LABEL: Record<QueueStatus, MessageKey> = {
  open: 'admin.statusOpen',
  reviewing: 'admin.statusReviewing',
  resolved: 'admin.statusResolved',
  dismissed: 'admin.statusDismissed',
};

const STATUS_TONE: Record<QueueStatus, BadgeTone> = {
  open: 'danger',
  reviewing: 'primary',
  resolved: 'success',
  dismissed: 'neutral',
};

const ACTION_LABEL: Record<ModerationAction, MessageKey> = {
  reviewing: 'admin.actionReview',
  resolved: 'admin.actionResolve',
  dismissed: 'admin.actionDismiss',
};

function QueueStatusBadge({ status }: { status: QueueStatus }) {
  const { t } = useLocale();
  return <Badge tone={STATUS_TONE[status]}>{t(STATUS_LABEL[status])}</Badge>;
}

/** Notes textarea + ≤3 action buttons, shared by both queues. */
function ManagePanel({
  actions,
  notesLabel,
  onAction,
  busy,
  failed,
  extraNote,
}: {
  actions: ModerationAction[];
  notesLabel: string;
  onAction: (action: ModerationAction, notes: string) => void;
  busy: boolean;
  failed: boolean;
  extraNote?: string;
}) {
  const { t } = useLocale();
  const [notes, setNotes] = useState('');
  return (
    <div className="space-y-2 border-t border-ink/5 pt-3">
      {extraNote && <p className="text-xs text-ink-faint">{extraNote}</p>}
      <TextArea
        label={notesLabel}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={2}
        maxLength={2000}
        error={failed ? t('admin.updateFailed') : undefined}
      />
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            variant={action === 'resolved' ? 'primary' : 'secondary'}
            className="flex-1"
            disabled={busy}
            onClick={() => onAction(action, notes)}
          >
            {t(ACTION_LABEL[action])}
          </Button>
        ))}
      </div>
    </div>
  );
}

interface CardShellProps {
  title: string;
  status: QueueStatus;
  createdAt: string;
  meta: { label: string; value: string }[];
  body: string | null;
  closingNotes: string | null;
  actions: ModerationAction[];
  notesLabel: string;
  extraNote?: string;
  onAction: (action: ModerationAction, notes: string) => Promise<void>;
}

function ModerationCard({
  title,
  status,
  createdAt,
  meta,
  body,
  closingNotes,
  actions,
  notesLabel,
  extraNote,
  onAction,
}: CardShellProps) {
  const { locale, t } = useLocale();
  const [managing, setManaging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function runAction(action: ModerationAction, notes: string) {
    setBusy(true);
    setFailed(false);
    try {
      await onAction(action, notes);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <article className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 font-semibold text-ink">{title}</p>
        <QueueStatusBadge status={status} />
      </div>
      {body && <p className="text-sm text-ink-light">{body}</p>}
      <div className="space-y-0.5">
        {meta.map((item) => (
          <p key={item.label} className="text-xs text-ink-faint">
            <span className="font-semibold">{item.label}:</span> {item.value}
          </p>
        ))}
        <p className="text-xs text-ink-faint">
          {formatRelativeTime(createdAt, locale)}
        </p>
      </div>
      {closingNotes && (
        <p className="rounded-lg bg-ink/5 px-3 py-2 text-sm text-ink-light">
          {closingNotes}
        </p>
      )}
      {actions.length > 0 &&
        (managing ? (
          <ManagePanel
            actions={actions}
            notesLabel={notesLabel}
            onAction={runAction}
            busy={busy}
            failed={failed}
            extraNote={extraNote}
          />
        ) : (
          <Button variant="secondary" onClick={() => setManaging(true)}>
            {t('admin.manage')}
          </Button>
        ))}
    </article>
  );
}

function ReportsQueue({ resolverId }: { resolverId: string }) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<ReportStatus | 'all'>('open');
  const reports = useAsync(
    () => fetchReports(filter),
    `admin-reports:${filter}`,
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((value) => (
          <Chip
            key={value}
            active={filter === value}
            label={
              value === 'all' ? t('admin.filterAll') : t(STATUS_LABEL[value])
            }
            onClick={() => setFilter(value)}
          />
        ))}
      </div>
      {reports.loading ? (
        <SpinnerBlock />
      ) : reports.failed || !reports.data ? (
        <LoadFailed onRetry={reports.reload} />
      ) : reports.data.rows.length === 0 ? (
        <EmptyState title={t('admin.reportsEmpty')} />
      ) : (
        <>
          <CappedNotice
            shown={reports.data.rows.length}
            total={reports.data.total}
          />
          {reports.data.rows.map((row) => (
            <ModerationCard
              key={row.id}
              title={row.reason}
              status={row.status}
              createdAt={row.created_at}
              body={row.description}
              closingNotes={row.notes}
              meta={[
                {
                  label: t('admin.reporterLabel'),
                  value: row.reporter?.display_name || t('admin.unknownUser'),
                },
                {
                  label: t('admin.reportedLabel'),
                  value: row.reported?.display_name || t('admin.unknownUser'),
                },
                ...(row.booking_id
                  ? [
                      {
                        label: t('admin.bookingLabel'),
                        value: shortId(row.booking_id),
                      },
                    ]
                  : []),
              ]}
              actions={availableReportActions(row.status)}
              notesLabel={t('admin.resolutionNotesLabel')}
              onAction={async (action, notes) => {
                await updateReport(
                  row.id,
                  action,
                  notes.trim() || null,
                  resolverId,
                );
                reports.reload();
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}

function DisputesQueue({ resolverId }: { resolverId: string }) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<DisputeStatus | 'all'>('open');
  const disputes = useAsync(
    () => fetchDisputes(filter),
    `admin-disputes:${filter}`,
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((value) => (
          <Chip
            key={value}
            active={filter === value}
            label={
              value === 'all' ? t('admin.filterAll') : t(STATUS_LABEL[value])
            }
            onClick={() => setFilter(value)}
          />
        ))}
      </div>
      {disputes.loading ? (
        <SpinnerBlock />
      ) : disputes.failed || !disputes.data ? (
        <LoadFailed onRetry={disputes.reload} />
      ) : disputes.data.rows.length === 0 ? (
        <EmptyState title={t('admin.disputesEmpty')} />
      ) : (
        <>
          <CappedNotice
            shown={disputes.data.rows.length}
            total={disputes.data.total}
          />
          {disputes.data.rows.map((row) => (
            <ModerationCard
              key={row.id}
              title={row.reason}
              status={row.status}
              createdAt={row.created_at}
              body={null}
              closingNotes={row.resolution}
              meta={[
                {
                  label: t('admin.openerLabel'),
                  value: row.opener?.display_name || t('admin.unknownUser'),
                },
                {
                  label: t('admin.bookingLabel'),
                  value: shortId(row.booking_id),
                },
              ]}
              actions={availableDisputeActions(row.status)}
              notesLabel={t('admin.resolutionNotesLabel')}
              extraNote={t('admin.bookingStaysDisputed')}
              onAction={async (action, notes) => {
                await updateDispute(
                  row.id,
                  action,
                  notes.trim() || null,
                  resolverId,
                );
                disputes.reload();
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}

export function ReportsTab({ resolverId }: { resolverId: string }) {
  const { t } = useLocale();
  const [section, setSection] = useState<'reports' | 'disputes'>('reports');
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Chip
          active={section === 'reports'}
          label={t('admin.reportsSection')}
          onClick={() => setSection('reports')}
        />
        <Chip
          active={section === 'disputes'}
          label={t('admin.disputesSection')}
          onClick={() => setSection('disputes')}
        />
      </div>
      {section === 'reports' ? (
        <ReportsQueue resolverId={resolverId} />
      ) : (
        <DisputesQueue resolverId={resolverId} />
      )}
    </div>
  );
}
