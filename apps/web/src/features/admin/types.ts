// Row shapes the admin feature reads/writes. Column names match
// supabase/migrations/20260827000300_tables.sql exactly (R1: audited first).

import type { Database } from '../../lib/database.types';

export type VerificationMethod =
  Database['public']['Enums']['verification_method'];
export type VerificationStatus =
  Database['public']['Enums']['verification_status'];
export type VerificationLevel =
  Database['public']['Enums']['verification_level'];
export type JobStatus = Database['public']['Enums']['job_status'];
export type ReportStatus = Database['public']['Enums']['report_status'];
export type DisputeStatus = Database['public']['Enums']['dispute_status'];

/** A list plus the server's exact total, so caps are never silent (law 6). */
export interface CappedList<T> {
  rows: T[];
  total: number | null;
}

export interface PendingVerificationRow {
  id: string;
  user_id: string;
  method: VerificationMethod;
  status: VerificationStatus;
  id_front_path: string | null;
  id_back_path: string | null;
  selfie_path: string | null;
  created_at: string;
  applicant: { display_name: string } | null;
}

export type DocKind = 'front' | 'back' | 'selfie';

export interface SignedDoc {
  kind: DocKind;
  /** null = no document uploaded for this slot OR signing failed (flagged). */
  url: string | null;
  failed: boolean;
}

/** Outcome of the post-approval worker level bump attempt (see api.ts). */
export type LevelBumpOutcome =
  | 'bumped'
  | 'not_needed'
  | 'no_worker_profile'
  | 'blocked_server_side';

export interface AdminJobRow {
  id: string;
  title: string;
  category_slug: string;
  status: JobStatus;
  budget_cents: number | null;
  service_neighborhood: string | null;
  is_diaspora: boolean;
  is_seed: boolean;
  workers_needed: number;
  created_at: string;
  customer: { display_name: string } | null;
}

export interface AdminUserRow {
  id: string;
  display_name: string;
  locale: string;
  is_customer: boolean;
  is_worker: boolean;
  is_seed: boolean;
  phone_masked: string | null;
  telegram_id: string | null;
  default_neighborhood: string | null;
  created_at: string;
}

export interface AdminReportRow {
  id: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  booking_id: string | null;
  notes: string | null;
  created_at: string;
  reporter: { display_name: string } | null;
  reported: { display_name: string } | null;
}

export interface AdminDisputeRow {
  id: string;
  booking_id: string;
  reason: string;
  status: DisputeStatus;
  resolution: string | null;
  created_at: string;
  opener: { display_name: string } | null;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  diff: unknown;
  created_at: string;
}

/** One measured metric tile: the count came from a real server-side query. */
export interface MetricValue {
  key: MetricKey;
  count: number | null; // null = that count query failed (shown, not hidden)
}

export type MetricKey =
  | 'pendingVerifications'
  | 'openJobs'
  | 'inProgressJobs'
  | 'disputedJobs'
  | 'openReports'
  | 'openDisputes'
  | 'completedBookings'
  | 'totalWorkers';
