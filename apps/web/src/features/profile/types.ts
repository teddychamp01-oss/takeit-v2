// Row shapes for the profile + verification feature. Column names mirror
// supabase/migrations/20260827000300_tables.sql EXACTLY — audited before
// writing (R1). Do not rename fields without re-reading the migrations.

import type { AvailabilityStatus } from '../../components/WorkerCard';
import type { VerificationLevel } from '../../components/VerifiedBadge';

export type BadgeLevel = 'new' | 'rising' | 'trusted' | 'pro' | 'top';

/** Own profiles row (RLS: own row only for these fields' write path). */
export interface OwnProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  locale: string;
  is_customer: boolean;
  is_worker: boolean;
  phone_masked: string | null;
  default_neighborhood: string | null;
}

/** Own worker_profiles row — every column the edit page reads. */
export interface WorkerProfileRow {
  user_id: string;
  bio: string | null;
  categories: string[];
  skills: string[];
  neighborhood: string | null;
  travel_radius_km: number;
  availability: unknown; // jsonb — parsed by parseAvailability, never trusted
  availability_status: AvailabilityStatus;
  price_min_cents: number | null;
  price_max_cents: number | null;
  price_type: string | null;
  rating_avg: number;
  review_count: number;
  jobs_completed: number;
  badge_level: BadgeLevel;
  verification_level: VerificationLevel;
}

/** Client-writable worker profile fields (matches the RLS column grants). */
export interface WorkerProfileInput {
  bio: string | null;
  categories: string[];
  skills: string[];
  neighborhood: string | null;
  travel_radius_km: number;
  availability: unknown;
  availability_status: AvailabilityStatus;
  price_min_cents: number | null;
  price_max_cents: number | null;
  price_type: string | null;
}

export type VerificationMethod = 'manual_id' | 'fayda_ekyc';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';

/**
 * Own verifications row. Owner-visible columns only — document paths stay
 * out of the UI (the private bucket is not owner-readable anyway; C2).
 */
export interface VerificationRow {
  id: string;
  method: VerificationMethod;
  status: VerificationStatus;
  created_at: string;
  decided_at: string | null;
  notes: string | null;
}

export type GuarantorType = 'idir' | 'equb' | 'employer' | 'verified_worker';
export type GuarantorStatus = 'pending' | 'verified' | 'rejected';

export interface GuarantorRow {
  id: string;
  guarantor_type: GuarantorType;
  guarantor_name: string;
  guarantor_contact_masked: string | null;
  statement: string | null;
  status: GuarantorStatus;
  created_at: string;
}

export interface GuarantorInput {
  guarantor_type: GuarantorType;
  guarantor_name: string;
  /** ALWAYS already masked — the DB CHECK rejects 7+ consecutive digits. */
  guarantor_contact_masked: string | null;
  statement: string | null;
}

export interface NotificationRow {
  id: string;
  type: string;
  payload: unknown; // jsonb — inspected by notificationRoute, never trusted
  read_at: string | null;
  created_at: string;
}

/** saved_workers row joined through worker_profiles → profiles. */
export interface SavedWorkerRow {
  worker_id: string;
  created_at: string;
  worker_profiles: {
    user_id: string;
    availability_status: AvailabilityStatus;
    price_min_cents: number | null;
    price_max_cents: number | null;
    rating_avg: number;
    review_count: number;
    jobs_completed: number;
    verification_level: VerificationLevel;
    profiles: {
      display_name: string;
      avatar_url: string | null;
    };
  };
}

export interface CategoryRow {
  slug: string;
  name_am: string;
  name_en: string;
  icon: string | null;
  sort: number;
}

/** A list result that reports what a row cap dropped (law: never silent). */
export interface CappedList<T> {
  rows: T[];
  /** Total matching rows on the server (RLS-visible), or null if unknown. */
  total: number | null;
}
