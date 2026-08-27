// Job/booking status pill — i18n labels + status colors from the palette.
// Status values mirror the Postgres enums in the SPEC exactly.

import { useT } from '../lib/i18n';
import type { MessageKey } from '../i18n';

export type JobStatus =
  | 'open'
  | 'matched'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export type BookingStatus =
  | 'confirmed'
  | 'started'
  | 'worker_done'
  | 'customer_confirmed'
  | 'disputed'
  | 'cancelled';

interface StatusDef {
  key: MessageKey;
  cls: string;
}

const JOB_STATUS: Record<JobStatus, StatusDef> = {
  open: {
    key: 'common.jobStatusOpen',
    cls: 'bg-status-open/10 text-status-open',
  },
  matched: {
    key: 'common.jobStatusMatched',
    cls: 'bg-status-matched/10 text-status-matched',
  },
  in_progress: {
    key: 'common.jobStatusInProgress',
    cls: 'bg-status-progress/10 text-status-progress',
  },
  completed: {
    key: 'common.jobStatusCompleted',
    cls: 'bg-status-done/10 text-status-done',
  },
  cancelled: {
    key: 'common.jobStatusCancelled',
    cls: 'bg-status-cancelled/10 text-status-cancelled',
  },
  disputed: {
    key: 'common.jobStatusDisputed',
    cls: 'bg-status-disputed/10 text-status-disputed',
  },
};

const BOOKING_STATUS: Record<BookingStatus, StatusDef> = {
  confirmed: {
    key: 'common.bookingStatusConfirmed',
    cls: 'bg-status-open/10 text-status-open',
  },
  started: {
    key: 'common.bookingStatusStarted',
    cls: 'bg-status-progress/10 text-status-progress',
  },
  worker_done: {
    key: 'common.bookingStatusWorkerDone',
    cls: 'bg-status-matched/10 text-status-matched',
  },
  customer_confirmed: {
    key: 'common.bookingStatusCustomerConfirmed',
    cls: 'bg-status-done/10 text-status-done',
  },
  disputed: {
    key: 'common.bookingStatusDisputed',
    cls: 'bg-status-disputed/10 text-status-disputed',
  },
  cancelled: {
    key: 'common.bookingStatusCancelled',
    cls: 'bg-status-cancelled/10 text-status-cancelled',
  },
};

export type StatusBadgeProps =
  | { kind: 'job'; status: JobStatus }
  | { kind: 'booking'; status: BookingStatus };

export function StatusBadge(props: StatusBadgeProps) {
  const t = useT();
  const def =
    props.kind === 'job'
      ? JOB_STATUS[props.status]
      : BOOKING_STATUS[props.status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${def.cls}`}
    >
      {t(def.key)}
    </span>
  );
}
