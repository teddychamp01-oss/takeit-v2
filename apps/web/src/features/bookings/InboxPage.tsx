// Inbox — every booking the signed-in user is a party to, BOTH roles (SPEC
// C4 dual-role), with booking status and per-booking unread message counts.
// Role filter chips appear only when the user actually has bookings in both
// roles. The unread scan is capped; a truncated scan renders counts as
// lower bounds ("n+"), never as silently exact numbers (law 6).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { formatETB, formatRelativeTime } from '../../lib/format';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { SpinnerBlock } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { fetchMyBookings, fetchUnreadMessages } from './api';
import { useAsync } from './useAsync';
import {
  bookingRole,
  countUnreadByBooking,
  UNREAD_SCAN_LIMIT,
  extractEmbedded,
  filterBookingsByRole,
  hasBothRoles,
  unreadBadgeText,
  type RoleFilter,
} from './logic';
import type { InboxBookingRow } from './types';

const FILTERS: readonly RoleFilter[] = ['all', 'customer', 'worker'];

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-touch shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
        active ? 'bg-primary text-white' : 'bg-white text-ink-light shadow-sm'
      }`}
    >
      {label}
    </button>
  );
}

function InboxRow({
  row,
  uid,
  unreadText,
  showRoleTag,
}: {
  row: InboxBookingRow;
  uid: string;
  unreadText: string | null;
  showRoleTag: boolean;
}) {
  const { locale, t } = useLocale();
  const role = bookingRole(row, uid);
  const job = extractEmbedded(row.jobs);
  const counterpart = extractEmbedded(
    role === 'customer' ? row.worker : row.customer,
  );

  return (
    <Link
      to={`/bookings/${row.id}`}
      className="block rounded-2xl bg-white p-4 shadow-sm transition-colors active:bg-primary-50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-semibold text-ink">
          {job?.title ?? t('bookings.bookingTitle')}
        </p>
        {unreadText && (
          <span
            aria-label={t('bookings.unreadAria', { count: unreadText })}
            className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white"
          >
            {unreadText}
          </span>
        )}
      </div>
      {counterpart && (
        <p className="mt-0.5 truncate text-sm text-ink-light">
          {t('bookings.withName', { name: counterpart.display_name })}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusBadge kind="booking" status={row.status} />
        {showRoleTag && role && (
          <Badge tone="neutral">
            {role === 'customer'
              ? t('bookings.roleCustomer')
              : t('bookings.roleWorker')}
          </Badge>
        )}
        <span className="ml-auto text-xs text-ink-faint">
          {formatRelativeTime(row.updated_at, locale)}
        </span>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-ink">
        {formatETB(row.agreed_price_cents)}
      </p>
    </Link>
  );
}

export default function InboxPage() {
  const { t } = useLocale();
  const { user, loading: sessionLoading } = useSession();
  const uid = user?.id ?? null;
  const [filter, setFilter] = useState<RoleFilter>('all');

  const bookingsQ = useAsync(
    () => fetchMyBookings(uid ?? ''),
    `inbox:${uid ?? ''}`,
    !!uid,
  );

  // A11 — the unread scan is SCOPED to the bookings this page renders.
  //
  // This is a DELIBERATE WATERFALL: unreadQ now waits for bookingsQ instead of
  // running beside it. That is acceptable here and only here, because unreadQ
  // does not gate the page — `bookingsQ.loading` does (below), and the badges
  // fill in after paint. Do NOT "fix" this back to a parallel fetch: an
  // unscoped scan walks the whole RLS-visible messages slice, and the user
  // with zero unread messages is the one who pays for all of it.
  const bookingIds = bookingsQ.data?.rows.map((row) => row.id) ?? [];
  const unreadQ = useAsync(
    () => fetchUnreadMessages(uid ?? '', bookingIds),
    `inbox-unread:${uid ?? ''}:${bookingIds.join(',')}`,
    !!uid && bookingIds.length > 0,
  );

  const header = <PageHeader title={t('bookings.inboxTitle')} />;

  if (sessionLoading || bookingsQ.loading) {
    return (
      <div>
        {header}
        <SpinnerBlock />
      </div>
    );
  }

  if (bookingsQ.failed || !bookingsQ.data || !uid) {
    return (
      <div>
        {header}
        <EmptyState
          title={t('bookings.loadFailedTitle')}
          body={t('bookings.loadFailedBody')}
          action={
            <Button variant="secondary" onClick={bookingsQ.reload}>
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  const { rows, total } = bookingsQ.data;

  if (rows.length === 0) {
    return (
      <div>
        {header}
        <EmptyState
          title={t('bookings.inboxEmptyTitle')}
          body={t('bookings.inboxEmptyBody')}
          action={
            /* N11a: exactly ONE live CTA — the empty inbox teaches the next
               step. A Link styled as the primary button (no <button> nesting). */
            <Link
              to="/browse"
              className="inline-flex min-h-touch items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-white shadow-button transition active:bg-primary-600 motion-safe:active:scale-95"
            >
              {t('bookings.inboxEmptyCta')}
            </Link>
          }
        />
      </div>
    );
  }

  const capped = total != null && total > rows.length;
  // A11: when the BOOKING list was capped, bookings past the cap were never
  // scanned for unread messages — so the counts are lower bounds and the
  // badges must say so ("n+"), not present a silently short number.
  const unread = countUnreadByBooking(
    unreadQ.data ?? [],
    UNREAD_SCAN_LIMIT,
    capped,
  );
  const showFilters = hasBothRoles(rows, uid);
  const visible = filterBookingsByRole(rows, uid, filter);

  return (
    <div>
      {header}
      <div className="space-y-3 p-4 pb-8">
        {showFilters && (
          <div className="flex gap-2 overflow-x-auto">
            {FILTERS.map((value) => (
              <FilterChip
                key={value}
                active={filter === value}
                label={
                  value === 'all'
                    ? t('bookings.filterAll')
                    : value === 'customer'
                      ? t('bookings.filterCustomer')
                      : t('bookings.filterWorker')
                }
                onClick={() => setFilter(value)}
              />
            ))}
          </div>
        )}

        {capped && (
          <p className="rounded-lg bg-ink/5 px-3 py-2 text-center text-sm leading-relaxed text-ink-faint">
            {t('bookings.inboxShowingOf', {
              shown: rows.length,
              total: total ?? rows.length,
            })}
          </p>
        )}

        {visible.map((row) => (
          <InboxRow
            key={row.id}
            row={row}
            uid={uid}
            unreadText={unreadBadgeText(
              unread.counts[row.id] ?? 0,
              unread.truncated,
            )}
            showRoleTag={showFilters && filter === 'all'}
          />
        ))}
      </div>
    </div>
  );
}
