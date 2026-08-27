// Data access for the jobs feature. Table/column/RPC names match the SQL in
// supabase/migrations/ exactly (R1: audited first):
//   - rpc_post_job / rpc_apply_to_job / rpc_accept_application
//     (20260827000400_functions_triggers.sql)
//   - jobs / applications / service_categories / profiles / worker_profiles
//     (20260827000300_tables.sql)
//
// Writes are RPC-only — RLS grants no client INSERT/UPDATE on jobs or
// applications; the SECURITY DEFINER RPCs are the single write path (they
// mask the diaspora contact phone before storing, C3).
//
// The worker "matching open jobs" feed is a plain SELECT: the jobs_select RLS
// policy already limits open jobs to workers whose categories match AND whose
// travel radius reaches the job — the matching runs server-side.
//
// Every list query is capped and returns the exact total next to the rows so
// the UI can say what the cap dropped (repo law: silence is not safety).

import { supabase } from '../../lib/supabase';
import type { JobStatus } from '../../components/StatusBadge';
import type { VerificationLevel } from '../../components/VerifiedBadge';
import {
  APPLICATIONS_LIMIT,
  LIST_LIMIT,
  type ApplicationStatus,
  type PackagePrefillSource,
  type RpcAcceptArgs,
  type RpcApplyArgs,
  type RpcPostJobArgs,
} from './logic';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
export interface CategoryRow {
  slug: string;
  name_am: string;
  name_en: string;
  icon: string | null;
  sort: number;
  min_verification_level: VerificationLevel;
}

export async function fetchActiveCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from('service_categories')
    .select('slug, name_am, name_en, icon, sort, min_verification_level')
    .eq('active', true)
    .order('sort', { ascending: true })
    .order('slug', { ascending: true }); // stable id tiebreak
  if (error) throw error;
  return (data ?? []) as CategoryRow[];
}

/**
 * N3 `?package=` deep link: one package by id, ACTIVE only (an admin-retired
 * package must stop seeding new jobs even if a stale link survives).
 * null = not found / inactive — the caller falls back to `?category=` seeding.
 * RLS: service_packages_select is open to anon+authenticated (public catalog).
 */
export async function fetchPackageById(
  id: string,
): Promise<PackagePrefillSource | null> {
  const { data, error } = await supabase
    .from('service_packages')
    .select('id, category_slug, name_am, name_en, checklist, base_price_cents')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data as PackagePrefillSource | null;
}

// ---------------------------------------------------------------------------
// Own profile flags (which tabs to show; neighborhood prefill)
// ---------------------------------------------------------------------------
export interface OwnFlags {
  is_customer: boolean;
  is_worker: boolean;
  default_neighborhood: string | null;
}

export async function fetchOwnFlags(userId: string): Promise<OwnFlags | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_customer, is_worker, default_neighborhood')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as OwnFlags | null;
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------
export interface JobListRow {
  id: string;
  title: string;
  category_slug: string;
  status: JobStatus;
  date_needed: string | null;
  time_window: string | null;
  budget_cents: number | null;
  workers_needed: number;
  is_diaspora: boolean;
  created_at: string;
  /** Only on the customer's own jobs: `applications(count)` embed. */
  applications?: unknown;
}

export interface ListPage<T> {
  rows: T[];
  /** Exact total on the server, so the UI can report what the cap dropped. */
  total: number;
}

const JOB_LIST_COLUMNS =
  'id, title, category_slug, status, date_needed, time_window, budget_cents, workers_needed, is_diaspora, created_at';

/** The customer's own jobs, newest first, with per-job application counts. */
export async function fetchMyJobs(userId: string): Promise<ListPage<JobListRow>> {
  const { data, error, count } = await supabase
    .from('jobs')
    .select(`${JOB_LIST_COLUMNS}, applications(count)`, { count: 'exact' })
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }) // stable id tiebreak, never geography
    .limit(LIST_LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as JobListRow[];
  return { rows, total: count ?? rows.length };
}

/**
 * Worker feed: open jobs the RLS policy matches to THIS worker (category +
 * travel radius, computed server-side). Own postings are excluded — a worker
 * cannot apply to their own job anyway (RPC guard).
 * No applications embed here: RLS would count only the caller's own rows,
 * which would be a silently wrong number.
 */
export async function fetchOpenJobsFeed(
  userId: string,
): Promise<ListPage<JobListRow>> {
  const { data, error, count } = await supabase
    .from('jobs')
    .select(JOB_LIST_COLUMNS, { count: 'exact' })
    .eq('status', 'open')
    .neq('customer_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(LIST_LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as JobListRow[];
  return { rows, total: count ?? rows.length };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
export interface JobDetailRow {
  id: string;
  customer_id: string;
  category_slug: string;
  title: string;
  description: string | null;
  service_address_text: string | null;
  service_landmark: string | null;
  service_neighborhood: string | null;
  is_diaspora: boolean;
  local_contact_name: string | null;
  /** Stored MASKED by rpc_post_job — a raw number can never appear here (C3). */
  local_contact_phone_masked: string | null;
  date_needed: string | null;
  time_window: string | null;
  budget_cents: number | null;
  workers_needed: number;
  status: JobStatus;
  created_at: string;
}

/** null = not found OR not visible to this user (RLS makes them identical). */
export async function fetchJob(jobId: string): Promise<JobDetailRow | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, customer_id, category_slug, title, description, service_address_text, service_landmark, service_neighborhood, is_diaspora, local_contact_name, local_contact_phone_masked, date_needed, time_window, budget_cents, workers_needed, status, created_at',
    )
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw error;
  return data as JobDetailRow | null;
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------
export interface ApplicantWorkerProfile {
  rating_avg: number | null;
  review_count: number;
  jobs_completed: number;
  verification_level: VerificationLevel;
}

export interface ApplicantProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  /** To-one embed via worker_profiles.user_id -> profiles.id. */
  worker_profiles: ApplicantWorkerProfile | ApplicantWorkerProfile[] | null;
}

export interface ApplicationRow {
  id: string;
  worker_id: string;
  message: string | null;
  committed_window: string | null;
  status: ApplicationStatus;
  created_at: string;
  worker: ApplicantProfile | ApplicantProfile[] | null;
}

/** Applications on one job (RLS: visible to the job's poster + the applicant). */
export async function fetchJobApplications(
  jobId: string,
): Promise<ListPage<ApplicationRow>> {
  const { data, error, count } = await supabase
    .from('applications')
    .select(
      'id, worker_id, message, committed_window, status, created_at, worker:profiles!applications_worker_id_fkey(id, display_name, avatar_url, worker_profiles(rating_avg, review_count, jobs_completed, verification_level))',
      { count: 'exact' },
    )
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(APPLICATIONS_LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as unknown as ApplicationRow[];
  return { rows, total: count ?? rows.length };
}

export interface MyApplicationRow {
  id: string;
  status: ApplicationStatus;
  message: string | null;
  committed_window: string | null;
  created_at: string;
}

export interface OwnApplicationJob {
  id: string;
  title: string;
  status: JobStatus;
}

export interface OwnApplicationRow {
  id: string;
  job_id: string;
  status: ApplicationStatus;
  created_at: string;
  /**
   * To-one embed via applications_job_id_fkey. NULL when the jobs_select RLS
   * policy hides the job from this worker (e.g. it matched someone else and
   * this worker has no booking on it) — the row still renders, degraded,
   * rather than silently disappearing.
   */
  job: OwnApplicationJob | OwnApplicationJob[] | null;
}

/**
 * The worker's own applications across ALL jobs (v1-adoption plan T13) —
 * a plain SELECT; applications_select RLS already permits own rows
 * (worker_id = auth.uid()), so no new policy or RPC is involved.
 */
export async function fetchOwnApplications(
  userId: string,
): Promise<ListPage<OwnApplicationRow>> {
  const { data, error, count } = await supabase
    .from('applications')
    .select(
      'id, job_id, status, created_at, job:jobs!applications_job_id_fkey(id, title, status)',
      { count: 'exact' },
    )
    .eq('worker_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }) // stable id tiebreak, never geography
    .limit(APPLICATIONS_LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as unknown as OwnApplicationRow[];
  return { rows, total: count ?? rows.length };
}

export async function fetchMyApplication(
  jobId: string,
  userId: string,
): Promise<MyApplicationRow | null> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, status, message, committed_window, created_at')
    .eq('job_id', jobId)
    .eq('worker_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as MyApplicationRow | null;
}

// ---------------------------------------------------------------------------
// RPCs (the only write paths)
// ---------------------------------------------------------------------------
export interface PostJobResult {
  job_id: string;
  status: string;
}

export async function postJob(args: RpcPostJobArgs): Promise<PostJobResult> {
  const { data, error } = await supabase.rpc('rpc_post_job', args);
  if (error) throw error;
  return data as unknown as PostJobResult; // RPC returns jsonb
}

export interface ApplyResult {
  application_id: string;
  status: string;
}

export async function applyToJob(args: RpcApplyArgs): Promise<ApplyResult> {
  const { data, error } = await supabase.rpc('rpc_apply_to_job', args);
  if (error) throw error;
  return data as unknown as ApplyResult; // RPC returns jsonb
}

export interface AcceptResult {
  booking_id: string;
  booking_status: string;
  job_status: string;
}

export async function acceptApplication(
  args: RpcAcceptArgs,
): Promise<AcceptResult> {
  const { data, error } = await supabase.rpc('rpc_accept_application', args);
  if (error) throw error;
  return data as unknown as AcceptResult; // RPC returns jsonb
}
