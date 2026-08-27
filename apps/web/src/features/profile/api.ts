// Data access for the profile + verification feature. Table/column names
// match supabase/migrations/20260827000300_tables.sql exactly (R1: audited
// first). RLS reality this code must respect:
//   * profiles / worker_profiles: own-row column-grant writes only; trust
//     columns (rating_avg, verification_level, …) have NO client write path
//   * verifications: owner inserts (rows can only be born 'pending' — status
//     is not a grantable insert column); owner reads own rows
//   * the 'verifications' STORAGE bucket is PRIVATE: the owner may UPLOAD
//     into <uid>/… but may NOT read back (only ops/admin can) — so the UI
//     never tries to render an uploaded document (C2)
//   * guarantors: worker inserts/reads own; status is ops-set
//   * saved_workers / notifications: strictly own rows
//   * user_roles: SELECT policy is admin-gated — non-admins simply get zero
//     rows, which fails CLOSED for the admin link
//
// Ordering law (repo law 1): geography is NEVER decided by the alphabet;
// every list here orders by time or enum with a stable id tiebreak.

import { supabase } from '../../lib/supabase';
import { buildVerificationPath, type IdImageKind } from './logic';
import type {
  CappedList,
  CategoryRow,
  GuarantorInput,
  GuarantorRow,
  NotificationRow,
  OwnProfileRow,
  SavedWorkerRow,
  VerificationRow,
  WorkerProfileInput,
  WorkerProfileRow,
} from './types';

export const NOTIFICATIONS_LIMIT = 30;
export const SAVED_WORKERS_LIMIT = 50;

// ---------------------------------------------------------------------------
// Own profile + roles
// ---------------------------------------------------------------------------
export async function fetchOwnProfile(
  userId: string,
): Promise<OwnProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, display_name, avatar_url, locale, is_customer, is_worker, phone_masked, default_neighborhood',
    )
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Own role rows. The user_roles SELECT policy is admin-gated, so a non-admin
 * legitimately receives an empty list — absence of rows here proves nothing
 * beyond "no admin link to show" (fail closed; the /admin route re-checks).
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
// Worker profile
// ---------------------------------------------------------------------------
const WORKER_PROFILE_SELECT =
  'user_id, bio, categories, skills, neighborhood, travel_radius_km, ' +
  'availability, availability_status, price_min_cents, price_max_cents, ' +
  'price_type, rating_avg, review_count, jobs_completed, badge_level, ' +
  'verification_level';

export async function fetchOwnWorkerProfile(
  userId: string,
): Promise<WorkerProfileRow | null> {
  const { data, error } = await supabase
    .from('worker_profiles')
    .select(WORKER_PROFILE_SELECT)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as WorkerProfileRow) ?? null;
}

/**
 * Save the client-writable worker profile columns (exactly the RLS column
 * grants — trust columns are never sent). Deliberately UPDATE-then-INSERT
 * instead of upsert: PostgREST's ON CONFLICT DO UPDATE would put user_id in
 * the SET list, and user_id has no column UPDATE grant — an upsert here
 * fails with 42501 on existing rows. When the user was not yet a worker,
 * profiles.is_worker is flipped on afterwards (C4 dual-role).
 */
export async function saveWorkerProfile(
  userId: string,
  input: WorkerProfileInput,
  setWorkerFlag: boolean,
): Promise<void> {
  const writable = {
    bio: input.bio,
    categories: input.categories,
    skills: input.skills,
    neighborhood: input.neighborhood,
    travel_radius_km: input.travel_radius_km,
    availability: input.availability as never,
    availability_status: input.availability_status,
    price_min_cents: input.price_min_cents,
    price_max_cents: input.price_max_cents,
    price_type: input.price_type,
  };

  const { data: updated, error: updateError } = await supabase
    .from('worker_profiles')
    .update(writable)
    .eq('user_id', userId)
    .select('user_id');
  if (updateError) throw updateError;

  if (!updated || updated.length === 0) {
    // First save: create the row. 23505 = a concurrent save created it in
    // the meantime — retry as a plain update instead of failing.
    const { error: insertError } = await supabase
      .from('worker_profiles')
      .insert({ user_id: userId, ...writable });
    if (insertError && insertError.code === '23505') {
      const { error: retryError } = await supabase
        .from('worker_profiles')
        .update(writable)
        .eq('user_id', userId);
      if (retryError) throw retryError;
    } else if (insertError) {
      throw insertError;
    }
  }

  if (setWorkerFlag) {
    const { error: flagError } = await supabase
      .from('profiles')
      .update({ is_worker: true })
      .eq('id', userId);
    if (flagError) throw flagError;
  }
}

/** Active service categories (anon-readable catalog) for the multi-select. */
export async function fetchActiveCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from('service_categories')
    .select('slug, name_am, name_en, icon, sort')
    .eq('active', true)
    .order('sort', { ascending: true })
    .order('slug', { ascending: true }); // stable tiebreak
  if (error) throw error;
  return (data ?? []) as unknown as CategoryRow[];
}

// ---------------------------------------------------------------------------
// Saved workers
// ---------------------------------------------------------------------------
export async function fetchSavedWorkers(
  customerId: string,
): Promise<CappedList<SavedWorkerRow>> {
  const { data, error, count } = await supabase
    .from('saved_workers')
    .select(
      'worker_id, created_at, ' +
        'worker_profiles!inner(user_id, availability_status, price_min_cents, ' +
        'price_max_cents, rating_avg, review_count, jobs_completed, ' +
        'verification_level, profiles!inner(display_name, avatar_url))',
      { count: 'exact' },
    )
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .order('worker_id', { ascending: true }) // stable tiebreak
    .limit(SAVED_WORKERS_LIMIT);
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as SavedWorkerRow[],
    total: count ?? null,
  };
}

export async function unsaveWorker(
  customerId: string,
  workerId: string,
): Promise<void> {
  const { error } = await supabase
    .from('saved_workers')
    .delete()
    .eq('customer_id', customerId)
    .eq('worker_id', workerId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Notifications (read state only — creation is server-side)
// ---------------------------------------------------------------------------
export async function fetchNotifications(
  userId: string,
): Promise<CappedList<NotificationRow>> {
  const { data, error, count } = await supabase
    .from('notifications')
    .select('id, type, payload, read_at, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }) // stable tiebreak
    .limit(NOTIFICATIONS_LIMIT);
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as NotificationRow[],
    total: count ?? null,
  };
}

/** Mark one notification read (read_at is the only grantable column). */
export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Verifications (manual ID flow — C2)
// ---------------------------------------------------------------------------
export async function fetchOwnVerifications(
  userId: string,
): Promise<VerificationRow[]> {
  const { data, error } = await supabase
    .from('verifications')
    .select('id, method, status, created_at, decided_at, notes')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }); // stable tiebreak
  if (error) throw error;
  return (data ?? []) as unknown as VerificationRow[];
}

/**
 * Upload one compressed document image into the PRIVATE 'verifications'
 * bucket at <uid>/<kind>-<ts>.jpg (the only path the storage policy accepts).
 * Returns the object path for the verifications row. No public URL exists
 * and the owner cannot read the object back — by design (C2).
 */
export async function uploadVerificationImage(
  userId: string,
  kind: IdImageKind,
  blob: Blob,
): Promise<string> {
  const path = buildVerificationPath(userId, kind, Date.now());
  const { error } = await supabase.storage
    .from('verifications')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

/**
 * Create the manual-ID verification row. Only the columns the RLS insert
 * grant allows are sent; the row is born 'pending' by column default —
 * the client cannot set status at all.
 */
export async function createManualVerification(
  userId: string,
  paths: { front: string; back: string; selfie: string },
): Promise<void> {
  const { error } = await supabase.from('verifications').insert({
    user_id: userId,
    method: 'manual_id',
    id_front_path: paths.front,
    id_back_path: paths.back,
    selfie_path: paths.selfie,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Guarantors
// ---------------------------------------------------------------------------
export async function fetchOwnGuarantors(
  workerId: string,
): Promise<GuarantorRow[]> {
  const { data, error } = await supabase
    .from('guarantors')
    .select(
      'id, guarantor_type, guarantor_name, guarantor_contact_masked, statement, status, created_at',
    )
    .eq('worker_id', workerId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }); // stable tiebreak
  if (error) throw error;
  return (data ?? []) as unknown as GuarantorRow[];
}

/**
 * Insert a guarantor. `guarantor_contact_masked` MUST already be masked
 * (maskGuarantorContact) — the DB CHECK rejects 7+ consecutive digits and
 * this function refuses to be the path that trips it.
 */
export async function addGuarantor(
  workerId: string,
  input: GuarantorInput,
): Promise<void> {
  if (
    input.guarantor_contact_masked !== null &&
    /[0-9]{7,}/.test(input.guarantor_contact_masked)
  ) {
    throw new Error('guarantor_contact_not_masked');
  }
  const { error } = await supabase.from('guarantors').insert({
    worker_id: workerId,
    guarantor_type: input.guarantor_type,
    guarantor_name: input.guarantor_name,
    guarantor_contact_masked: input.guarantor_contact_masked,
    statement: input.statement,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
export async function signOutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
