// Tab 3 — users search. PII is masked by default and revealed per-row on
// tap. Reveals are NOT audit-logged: public.audit_write is service_role-only
// and the schema provides no client-callable audit RPC — the limitation is
// stated in the UI itself, not hidden (deviation, reported).
// Phones only ever exist masked at rest (C3 CHECK constraint), so even a
// reveal shows the stored MASKED value — never a raw number.

import { useState, type FormEvent } from 'react';
import { useLocale } from '../../lib/i18n';
import { formatRelativeTime } from '../../lib/format';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Input } from '../../components/Input';
import { SpinnerBlock } from '../../components/Spinner';
import { useAsync } from './useAsync';
import { searchUsers } from './api';
import {
  classifyUserQuery,
  maskIdentifier,
  shortId,
  USER_QUERY_MIN,
} from './logic';
import type { AdminUserRow } from './types';
import { CappedNotice, LoadFailed } from './ui';

function PiiValue({
  label,
  value,
  revealed,
}: {
  label: string;
  value: string | null;
  revealed: boolean;
}) {
  const { t } = useLocale();
  return (
    <p className="text-sm text-ink-light">
      <span className="font-semibold text-ink">{label}: </span>
      {value === null
        ? t('admin.piiNone')
        : revealed
          ? value
          : maskIdentifier(value)}
    </p>
  );
}

function UserRow({ row }: { row: AdminUserRow }) {
  const { locale, t } = useLocale();
  const [revealed, setRevealed] = useState(false);
  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-semibold text-ink">
          {row.display_name || t('admin.unknownUser')}
        </p>
        <span className="shrink-0 text-xs text-ink-faint">{shortId(row.id)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {row.is_customer && <Badge tone="info">{t('admin.userCustomer')}</Badge>}
        {row.is_worker && <Badge tone="success">{t('admin.userWorker')}</Badge>}
        {row.is_seed && <Badge tone="warning">{t('admin.seed')}</Badge>}
        {row.default_neighborhood && (
          <Badge tone="neutral">{row.default_neighborhood}</Badge>
        )}
        <span className="ml-auto text-xs text-ink-faint">
          {t('admin.joinedLabel')} {formatRelativeTime(row.created_at, locale)}
        </span>
      </div>
      <div className="mt-2 space-y-1">
        <PiiValue
          label={t('admin.piiPhone')}
          value={row.phone_masked}
          revealed={revealed}
        />
        <PiiValue
          label={t('admin.piiTelegram')}
          value={row.telegram_id}
          revealed={revealed}
        />
      </div>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="mt-1 min-h-touch text-sm font-semibold text-primary-600"
      >
        {revealed ? t('admin.hidePii') : t('admin.showPii')}
      </button>
      {revealed && (
        <p className="text-xs text-ink-faint">
          {t('admin.phoneStoredMasked')} {t('admin.revealNotLogged')}
        </p>
      )}
    </article>
  );
}

export function UsersTab() {
  const { t } = useLocale();
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const query = classifyUserQuery(submitted);
  const enabled = query.kind !== 'too_short';

  const results = useAsync(
    () => searchUsers(query),
    `admin-users:${submitted}`,
    enabled,
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(input);
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <Input
          label={t('admin.usersSearchLabel')}
          placeholder={t('admin.usersSearchPlaceholder')}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          hint={t('admin.usersSearchHint')}
          autoComplete="off"
        />
        <Button
          type="submit"
          className="mb-6 shrink-0"
          disabled={input.trim().length < USER_QUERY_MIN}
        >
          {t('common.search')}
        </Button>
      </form>

      {!enabled ? (
        <EmptyState
          title={t('admin.usersPromptTitle')}
          body={t('admin.usersPromptBody')}
        />
      ) : results.loading ? (
        <SpinnerBlock />
      ) : results.failed || !results.data ? (
        <LoadFailed onRetry={results.reload} />
      ) : results.data.rows.length === 0 ? (
        <EmptyState
          title={t('admin.usersEmptyTitle')}
          body={t('admin.usersEmptyBody')}
        />
      ) : (
        <>
          <CappedNotice
            shown={results.data.rows.length}
            total={results.data.total}
          />
          {results.data.rows.map((row) => (
            <UserRow key={row.id} row={row} />
          ))}
        </>
      )}
    </div>
  );
}
