// Data access for the admin console. Table/column names match
// supabase/migrations/*.sql exactly (R1: audited first). RLS reality this
// code must respect:
//   * verifications: ops/admin read all rows; the DECISION write path is the
//     column grant update(status, reviewer_id, decided_at, notes) behind the
//     verifications_ops_update policy — there is NO decision RPC in the schema
//   * worker_profiles.verification_level has NO client write path (not in the
//     column grants; the update policy is own-row only). The bump attempt
//     below therefore reports honestly instead of pretending (silence is not
//     safety) — see applyApprovalLevelBump.
//   * the 'verifications' STORAGE bucket is private; ops/admin hold the only
//     read policy, exercised here via short-lived signed URLs (C2)
//   * reports: ops/admin update(status, resolved_by, notes);
//     disputes: ops/admin update(status, resolution, resolved_by)
//   * audit_log: SELECT is ADMIN-only (not ops) — the audit tab handles the
//     empty/denied result explicitly
//   * public.audit_write is service_role-only: admin UI actions on tables
//     (verification decisions, report/dispute resolutions) CANNOT append to
//     audit_log from the client. Deviation — reported, not hidden.
//
// Every mutation asserts the matched-row count: an RLS-filtered update that
// touches 0 rows is a FAILURE here, never a silent success (Gate 2 spirit).
//
// Ordering law (repo law 1): geography is never decided by the alphabet;
// every list orders by time or status with a stable id tiebreak.

import { supabase } from '../../lib/supabase';
import type {
  AdminDisputeRow,
  AdminJobRow,
  AdminReportRow,
  AuditLogRow,
  CappedList,
  DocKind,
  JobStatus,
  LevelBumpOutcome,
  MetricValue,
  PendingVerificationRow,
  SignedDoc,
  VerificationMethod,
} from './types';
import {
  bumpTargetLevel,
  type AuditEntity,
  type ModerationAction,
  type UserQuery,
} from './logic';
import type { AdminUserRow, DisputeStatus, ReportStatus } from './types';

export const VERIFICATIONS_LIMIT = 30;
export const JOBS_LIMIT = 50;
export const USERS_LIMIT = 25;
export const MODERATION_LIMIT = 50;
export const AUDIT_LIMIT = 50;
/** Signed URLs for ID documents live 120 seconds — long enough to review,
 * short enough that a leaked link dies quickly (C2). */
export const SIGNED_URL_TTL_SECONDS = 120;

// ---------------------------------------------------------------------------
// Roles (for gating the audit tab UI; authority stays server-side, C8)
// ---------------------------------------------------------------------------

/**
 * Own role rows. The user_roles SELECT policy is admin-gated, so an ops user
 * legitimately receives an empty list — callers must treat "no rows" as
 * "not admin", never as an error (fail closed).
 */
export async function fetchOwnRoles(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.role as string);
}

// ---------------------------------------------------------------------------
// Verification queue
// ---------------------------------------------------------------------------

export async function fetchPendingVerifications(): Promise<
  CappedList<PendingVerificationRow>
> {
  const { data, error, count } = await supabase
    .from('verifications')
    .select(
      'id, user_id, method, status, id_front_path, id_back_path, selfie_path, ' +
        'created_at, applicant:profiles!verifications_user_id_fkey(display_name)',
      { count: 'exact' },
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true }) // queue: oldest first
    .order('id', { ascending: true }) // stable tiebreak
    .limit(VERIFICATIONS_LIMIT);
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as PendingVerificationRow[],
    total: count ?? null,
  };
}

/**
 * Short-lived signed URLs for the row's uploaded documents (private bucket;
 * the ops/admin storage SELECT policy authorizes the signing). A slot whose
 * signing fails is returned flagged, never dropped silently.
 */
export async function signVerificationDocs(row: {
  id_front_path: string | null;
  id_back_path: string | null;
  selfie_path: string | null;
}): Promise<SignedDoc[]> {
  const slots: { kind: DocKind; path: string | null }[] = [
    { kind: 'front', path: row.id_front_path },
    { kind: 'back', path: row.id_back_path },
    { kind: 'selfie', path: row.selfie_path },
  ];
  return Promise.all(
    slots
      .filter((slot): slot is { kind: DocKind; path: string } => !!slot.path)
      .map(async ({ kind, path }) => {
        const { data, error } = await supabase.storage
          .from('verifications')
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        if (error || !data?.signedUrl) return { kind, url: null, failed: true };
        return { kind, url: data.signedUrl, failed: false };
      }),
  );
}

/**
 * Decide a pending verification. Writes exactly the ops-grantable columns
 * (status, reviewer_id, decided_at, notes). The `.eq('status','pending')`
 * guard plus the returned-row assert make a lost race or an RLS denial an
 * ERROR, not a silent no-op.
 */
export async function decideVerification(
  verificationId: string,
  decision: 'approved' | 'rejected',
  notes: string | null,
  reviewerId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('verifications')
    .update({
      status: decision,
      reviewer_id: reviewerId,
      decided_at: new Date().toISOString(),
      notes,
    })
    .eq('id', verificationId)
    .eq('status', 'pending')
    .select('id');
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error(
      `verification_not_updated: expected 1 row, matched ${data?.length ?? 0}`,
    );
  }
}

/**
 * After approval, the worker's verification_level should rise per method
 * (SPEC). The schema gives the client NO write path to that column (it is a
 * server-set trust column), so this attempt is expected to be refused — the
 * outcome is surfaced to the ops user instead of being swallowed.
 */
export async function applyApprovalLevelBump(
  workerUserId: string,
  method: VerificationMethod,
): Promise<LevelBumpOutcome> {
  const { data: wp, error } = await supabase
    .from('worker_profiles')
    .select('verification_level')
    .eq('user_id', workerUserId)
    .maybeSingle();
  if (error || !wp) return wp === null && !error ? 'no_worker_profile' : 'blocked_server_side';

  const target = bumpTargetLevel(method, wp.verification_level);
  if (target === null) return 'not_needed';

  try {
    const { data, error: updateError } = await supabase
      .from('worker_profiles')
      .update({ verification_level: target })
      .eq('user_id', workerUserId)
      .select('user_id');
    if (updateError || !data || data.length !== 1) return 'blocked_server_side';
    return 'bumped';
  } catch {
    return 'blocked_server_side';
  }
}

// ---------------------------------------------------------------------------
// Jobs oversight
// ---------------------------------------------------------------------------

export async function fetchJobsOversight(
  status: JobStatus | 'all',
): Promise<CappedList<AdminJobRow>> {
  let query = supabase
    .from('jobs')
    .select(
      'id, title, category_slug, status, budget_cents, service_neighborhood, ' +
        'is_diaspora, is_seed, workers_needed, created_at, ' +
        'customer:profiles!jobs_customer_id_fkey(display_name)',
      { count: 'exact' },
    );
  if (status !== 'all') query = query.eq('status', status);
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }) // stable tiebreak
    .limit(JOBS_LIMIT);
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as AdminJobRow[],
    total: count ?? null,
  };
}

// ---------------------------------------------------------------------------
// Users search
// ---------------------------------------------------------------------------

/**
 * Search the user directory. telegram_id is a direct off-platform contact
 * channel (C3), so it is NOT selectable from `profiles` by the client role;
 * the ops/admin directory goes through the admin-gated, audit-logged
 * rpc_admin_search_users RPC, which returns { rows, total } and the
 * telegram_id column. See migration 20260827000710.
 */
export async function searchUsers(
  query: UserQuery,
): Promise<CappedList<AdminUserRow>> {
  if (query.kind === 'too_short') return { rows: [], total: 0 };
  const { data, error } = await supabase.rpc('rpc_admin_search_users', {
    p_id: query.kind === 'id' ? query.id : undefined,
    p_pattern: query.kind === 'name' ? query.pattern : undefined,
    p_limit: USERS_LIMIT,
  });
  if (error) throw error;
  const payload = (data ?? { rows: [], total: 0 }) as unknown as {
    rows: AdminUserRow[];
    total: number;
  };
  return {
    rows: payload.rows ?? [],
    total: payload.total ?? null,
  };
}

// ---------------------------------------------------------------------------
// Reports & disputes
// ---------------------------------------------------------------------------

export async function fetchReports(
  status: ReportStatus | 'all',
): Promise<CappedList<AdminReportRow>> {
  let query = supabase.from('reports').select(
    'id, reason, description, status, booking_id, notes, created_at, ' +
      'reporter:profiles!reports_reporter_id_fkey(display_name), ' +
      'reported:profiles!reports_reported_id_fkey(display_name)',
    { count: 'exact' },
  );
  if (status !== 'all') query = query.eq('status', status);
  const { data, error, count } = await query
    .order('created_at', { ascending: true }) // queue: oldest first
    .order('id', { ascending: true }) // stable tiebreak
    .limit(MODERATION_LIMIT);
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as AdminReportRow[],
    total: count ?? null,
  };
}

/**
 * Work a report: 'reviewing' claims it, 'resolved'/'dismissed' close it with
 * the resolver recorded. Exactly the ops-grantable columns are written.
 */
export async function updateReport(
  reportId: string,
  action: ModerationAction,
  notes: string | null,
  resolverId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('reports')
    .update({
      status: action,
      notes,
      resolved_by: action === 'reviewing' ? null : resolverId,
    })
    .eq('id', reportId)
    .select('id');
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error(
      `report_not_updated: expected 1 row, matched ${data?.length ?? 0}`,
    );
  }
}

export async function fetchDisputes(
  status: DisputeStatus | 'all',
): Promise<CappedList<AdminDisputeRow>> {
  let query = supabase.from('disputes').select(
    'id, booking_id, reason, status, resolution, created_at, ' +
      'opener:profiles!disputes_opened_by_fkey(display_name)',
    { count: 'exact' },
  );
  if (status !== 'all') query = query.eq('status', status);
  const { data, error, count } = await query
    .order('created_at', { ascending: true }) // queue: oldest first
    .order('id', { ascending: true }) // stable tiebreak
    .limit(MODERATION_LIMIT);
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as AdminDisputeRow[],
    total: count ?? null,
  };
}

/**
 * Work a dispute row. NOTE: this changes the dispute record only — the
 * underlying booking stays 'disputed' (its state machine is RPC-only and the
 * schema has no admin transition out of 'disputed'). The UI says so.
 */
export async function updateDispute(
  disputeId: string,
  action: ModerationAction,
  resolution: string | null,
  resolverId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('disputes')
    .update({
      status: action,
      resolution,
      resolved_by: action === 'reviewing' ? null : resolverId,
    })
    .eq('id', disputeId)
    .select('id');
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error(
      `dispute_not_updated: expected 1 row, matched ${data?.length ?? 0}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Metrics — every tile is a real server-side count (head:true, count:exact).
// A failed count renders as failed; it is never replaced by a guess (Gate 3).
// ---------------------------------------------------------------------------

async function countRows(
  build: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  try {
    const { count, error } = await build();
    if (error) return null;
    return count;
  } catch {
    return null;
  }
}

export async function fetchMetrics(): Promise<MetricValue[]> {
  const head = { count: 'exact' as const, head: true };
  const [
    pendingVerifications,
    openJobs,
    inProgressJobs,
    disputedJobs,
    openReports,
    openDisputes,
    completedBookings,
    totalWorkers,
  ] = await Promise.all([
    countRows(() =>
      supabase.from('verifications').select('id', head).eq('status', 'pending'),
    ),
    countRows(() =>
      supabase.from('jobs').select('id', head).eq('status', 'open'),
    ),
    countRows(() =>
      supabase.from('jobs').select('id', head).eq('status', 'in_progress'),
    ),
    countRows(() =>
      supabase.from('jobs').select('id', head).eq('status', 'disputed'),
    ),
    countRows(() =>
      supabase.from('reports').select('id', head).eq('status', 'open'),
    ),
    countRows(() =>
      supabase.from('disputes').select('id', head).eq('status', 'open'),
    ),
    countRows(() =>
      supabase
        .from('bookings')
        .select('id', head)
        .eq('status', 'customer_confirmed'),
    ),
    countRows(() => supabase.from('worker_profiles').select('user_id', head)),
  ]);

  return [
    { key: 'pendingVerifications', count: pendingVerifications },
    { key: 'openJobs', count: openJobs },
    { key: 'inProgressJobs', count: inProgressJobs },
    { key: 'disputedJobs', count: disputedJobs },
    { key: 'openReports', count: openReports },
    { key: 'openDisputes', count: openDisputes },
    { key: 'completedBookings', count: completedBookings },
    { key: 'totalWorkers', count: totalWorkers },
  ];
}

// ---------------------------------------------------------------------------
// Audit log (admin-only table; ops receives zero rows by policy)
// ---------------------------------------------------------------------------

export async function fetchAuditLog(
  entity: AuditEntity | 'all',
): Promise<CappedList<AuditLogRow>> {
  let query = supabase
    .from('audit_log')
    .select('id, actor_id, action, entity, entity_id, diff, created_at', {
      count: 'exact',
    });
  if (entity !== 'all') query = query.eq('entity', entity);
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }) // stable tiebreak
    .limit(AUDIT_LIMIT);
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as AuditLogRow[],
    total: count ?? null,
  };
}
