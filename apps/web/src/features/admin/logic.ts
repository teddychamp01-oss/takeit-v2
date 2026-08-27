// Pure logic for the admin console. No I/O here — everything is unit-tested
// in __tests__/logic.test.ts.

import type {
  DisputeStatus,
  ReportStatus,
  VerificationLevel,
  VerificationMethod,
} from './types';

// ---------------------------------------------------------------------------
// Verification decisions
// ---------------------------------------------------------------------------

/** Mirrors public.verification_level_rank() in 000400 exactly. */
export const LEVEL_RANK: Record<VerificationLevel, number> = {
  none: 0,
  basic: 1,
  id_verified: 2,
  fayda_verified: 3,
  pro_certified: 4,
};

/** SPEC: approving a method grants its level (manual_id → id_verified,
 * fayda_ekyc → fayda_verified). */
export function approvedLevelForMethod(
  method: VerificationMethod,
): VerificationLevel {
  return method === 'fayda_ekyc' ? 'fayda_verified' : 'id_verified';
}

/**
 * The level the worker should hold after approval, or null when no change is
 * needed. A verification NEVER lowers a level (a pro_certified worker passing
 * a manual-ID check must not drop to id_verified).
 */
export function bumpTargetLevel(
  method: VerificationMethod,
  current: VerificationLevel,
): VerificationLevel | null {
  const target = approvedLevelForMethod(method);
  return LEVEL_RANK[target] > LEVEL_RANK[current] ? target : null;
}

export const DECISION_NOTES_MAX = 2000; // verifications.notes CHECK bound

export type DecisionValidation =
  | { ok: true; notes: string | null }
  | { ok: false; error: 'notes_required' | 'notes_too_long' };

/**
 * Validate a queue decision before it is sent. Rejections REQUIRE a note —
 * the applicant deserves a reason, and ops needs the paper trail.
 */
export function validateDecision(
  decision: 'approved' | 'rejected',
  rawNotes: string,
): DecisionValidation {
  const notes = rawNotes.trim();
  if (notes.length > DECISION_NOTES_MAX) {
    return { ok: false, error: 'notes_too_long' };
  }
  if (decision === 'rejected' && notes.length === 0) {
    return { ok: false, error: 'notes_required' };
  }
  return { ok: true, notes: notes.length > 0 ? notes : null };
}

// ---------------------------------------------------------------------------
// User search (law 4: fuzzy input is length-bounded)
// ---------------------------------------------------------------------------

export const USER_QUERY_MIN = 2;
export const USER_QUERY_MAX = 64;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UserQuery =
  | { kind: 'too_short' }
  | { kind: 'id'; id: string }
  | { kind: 'name'; pattern: string };

/** Escape LIKE/ILIKE metacharacters so user input cannot widen the match. */
export function escapeIlike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Classify the search box input: a UUID searches by exact id, anything else
 * becomes a bounded, escaped contains-pattern on display_name. Input longer
 * than USER_QUERY_MAX is truncated, never sent unbounded.
 */
export function classifyUserQuery(raw: string): UserQuery {
  const trimmed = raw.trim().slice(0, USER_QUERY_MAX);
  if (UUID_RE.test(trimmed)) return { kind: 'id', id: trimmed.toLowerCase() };
  if (trimmed.length < USER_QUERY_MIN) return { kind: 'too_short' };
  return { kind: 'name', pattern: `%${escapeIlike(trimmed)}%` };
}

// ---------------------------------------------------------------------------
// PII masking (C3/C2 defense-in-depth for the users tab)
// ---------------------------------------------------------------------------

/**
 * Mask an identifier (e.g. telegram_id) for the default, unrevealed view:
 * first + last character survive, the middle never does. Short values are
 * fully masked — unknown shapes degrade to HEAVIER masking, never lighter.
 */
export function maskIdentifier(value: string): string {
  const v = value.trim();
  if (v.length < 4) return '••••';
  return `${v[0]}••••${v[v.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Reports / disputes state machines (client-side action gating only — the
// authority is the RLS ops/admin update policies)
// ---------------------------------------------------------------------------

export type ModerationAction = 'reviewing' | 'resolved' | 'dismissed';

export function availableReportActions(
  status: ReportStatus,
): ModerationAction[] {
  switch (status) {
    case 'open':
      return ['reviewing', 'resolved', 'dismissed'];
    case 'reviewing':
      return ['resolved', 'dismissed'];
    default:
      return []; // resolved / dismissed are terminal
  }
}

export function availableDisputeActions(
  status: DisputeStatus,
): ModerationAction[] {
  // Same enum values and flow as reports (000200 defines both identically).
  switch (status) {
    case 'open':
      return ['reviewing', 'resolved', 'dismissed'];
    case 'reviewing':
      return ['resolved', 'dismissed'];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Short, greppable id prefix for dense tables (full id stays in the DB). */
export function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/** True when the server total says the capped list dropped rows (law 6). */
export function listWasCapped(shown: number, total: number | null): boolean {
  return total !== null && total > shown;
}

/** Entities that appear in audit_log.entity (from the 000400/000700 RPC
 * audit_write calls) — the audit tab's filter options. */
export const AUDIT_ENTITIES = [
  'jobs',
  'applications',
  'bookings',
  'payments',
  'messages',
  'reviews',
  'verifications',
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];
