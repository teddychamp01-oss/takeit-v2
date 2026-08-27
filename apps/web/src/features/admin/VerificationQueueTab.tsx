// Tab 1 — verification queue (C2). Pending manual-ID / Fayda rows, ID images
// via short-lived signed URLs from the PRIVATE bucket, approve/reject with
// notes. The decision writes status/reviewer_id/decided_at/notes (the exact
// ops column grant). The worker level bump is ATTEMPTED and its true outcome
// shown — the schema has no client path to that trust column (see api.ts).

import { useState } from 'react';
import { useLocale } from '../../lib/i18n';
import { formatRelativeTime } from '../../lib/format';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { SpinnerBlock } from '../../components/Spinner';
import { TextArea } from '../../components/TextArea';
import { useAsync } from './useAsync';
import {
  applyApprovalLevelBump,
  decideVerification,
  fetchPendingVerifications,
  signVerificationDocs,
} from './api';
import { validateDecision } from './logic';
import type {
  DocKind,
  LevelBumpOutcome,
  PendingVerificationRow,
  SignedDoc,
} from './types';
import { CappedNotice, LoadFailed } from './ui';
import type { MessageKey } from '../../i18n';

const DOC_LABEL: Record<DocKind, MessageKey> = {
  front: 'admin.docFront',
  back: 'admin.docBack',
  selfie: 'admin.docSelfie',
};

const BUMP_MESSAGE: Record<LevelBumpOutcome, MessageKey> = {
  bumped: 'admin.bumpDone',
  not_needed: 'admin.bumpNotNeeded',
  no_worker_profile: 'admin.bumpNoWorkerProfile',
  blocked_server_side: 'admin.bumpBlocked',
};

type DocsState = 'idle' | 'loading' | 'failed' | SignedDoc[];

function DocsSection({ docs }: { docs: SignedDoc[] }) {
  const { t } = useLocale();
  if (docs.length === 0) {
    return <p className="text-sm text-ink-faint">{t('admin.noDocs')}</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-faint">{t('admin.docsExpire')}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {docs.map((doc) => (
          <figure key={doc.kind} className="overflow-hidden rounded-xl bg-ink/5">
            {doc.url ? (
              <img
                src={doc.url}
                alt={t(DOC_LABEL[doc.kind])}
                className="max-h-64 w-full object-contain"
              />
            ) : (
              <p className="px-3 py-6 text-center text-xs text-status-disputed">
                {t('admin.docLoadFailed')}
              </p>
            )}
            <figcaption className="px-3 py-1.5 text-xs font-semibold text-ink-light">
              {t(DOC_LABEL[doc.kind])}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function VerificationCard({
  row,
  reviewerId,
  onDecided,
}: {
  row: PendingVerificationRow;
  reviewerId: string;
  onDecided: (messages: string[]) => void;
}) {
  const { locale, t } = useLocale();
  const [docs, setDocs] = useState<DocsState>('idle');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docsShown = Array.isArray(docs);

  async function toggleDocs() {
    if (docsShown) {
      setDocs('idle');
      return;
    }
    setDocs('loading');
    try {
      setDocs(await signVerificationDocs(row));
    } catch {
      setDocs('failed');
    }
  }

  async function decide(decision: 'approved' | 'rejected') {
    const validation = validateDecision(decision, notes);
    if (!validation.ok) {
      setError(
        validation.error === 'notes_required'
          ? t('admin.notesRequiredOnReject')
          : t('admin.notesTooLong'),
      );
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await decideVerification(row.id, decision, validation.notes, reviewerId);
      const messages = [
        decision === 'approved'
          ? t('admin.decidedApproved')
          : t('admin.decidedRejected'),
      ];
      if (decision === 'approved') {
        const outcome = await applyApprovalLevelBump(row.user_id, row.method);
        messages.push(t(BUMP_MESSAGE[outcome]));
      }
      onDecided(messages);
    } catch {
      setError(t('admin.decideFailed'));
      setBusy(false);
    }
  }

  return (
    <article className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="min-w-0 flex-1 truncate font-semibold text-ink">
          {row.applicant?.display_name || t('admin.unknownUser')}
        </p>
        <Badge tone="info">
          {row.method === 'fayda_ekyc'
            ? t('admin.methodFayda')
            : t('admin.methodManualId')}
        </Badge>
        <span className="text-xs text-ink-faint">
          {formatRelativeTime(row.created_at, locale)}
        </span>
      </div>

      <div>
        <Button variant="secondary" onClick={toggleDocs} disabled={docs === 'loading'}>
          {docsShown ? t('admin.hideDocs') : t('admin.viewDocs')}
        </Button>
      </div>
      {docs === 'loading' && <SpinnerBlock />}
      {docs === 'failed' && (
        <p className="text-sm text-status-disputed">{t('admin.docLoadFailed')}</p>
      )}
      {docsShown && <DocsSection docs={docs} />}

      <TextArea
        label={t('admin.decisionNotesLabel')}
        placeholder={t('admin.decisionNotesPlaceholder')}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={2}
        error={error ?? undefined}
      />

      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => decide('approved')}
          disabled={busy}
        >
          {t('admin.approve')}
        </Button>
        <Button
          variant="danger"
          className="flex-1"
          onClick={() => decide('rejected')}
          disabled={busy}
        >
          {t('admin.reject')}
        </Button>
      </div>
    </article>
  );
}

export function VerificationQueueTab({ reviewerId }: { reviewerId: string }) {
  const { t } = useLocale();
  const [banner, setBanner] = useState<string[] | null>(null);
  const queue = useAsync(fetchPendingVerifications, 'admin-verifications');

  if (queue.loading) return <SpinnerBlock />;
  if (queue.failed || !queue.data) return <LoadFailed onRetry={queue.reload} />;

  const { rows, total } = queue.data;

  return (
    <div className="space-y-3">
      {banner && (
        <div
          role="status"
          className="space-y-1 rounded-xl bg-verified-light px-4 py-3 text-sm text-verified"
        >
          {banner.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={t('admin.queueEmptyTitle')}
          body={t('admin.queueEmptyBody')}
        />
      ) : (
        <>
          <p className="text-sm font-semibold text-ink-light">
            {t('admin.pendingCount', { count: total ?? rows.length })}
          </p>
          <CappedNotice shown={rows.length} total={total} />
          {rows.map((row) => (
            <VerificationCard
              key={row.id}
              row={row}
              reviewerId={reviewerId}
              onDecided={(messages) => {
                setBanner(messages);
                queue.reload();
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}
