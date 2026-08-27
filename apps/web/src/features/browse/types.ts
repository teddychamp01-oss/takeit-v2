// Row shapes for the browse/home data layer. Column names mirror the SQL in
// supabase/migrations/20260827000300_tables.sql and the return table of
// public.nearby_workers in 20260827000400_functions_triggers.sql EXACTLY —
// audited before writing (R1). Do not rename fields here without re-reading
// the migrations.

import type { AvailabilityStatus } from '../../components/WorkerCard';
import type { VerificationLevel } from '../../components/VerifiedBadge';

export type BadgeLevel = 'new' | 'rising' | 'trusted' | 'pro' | 'top';

/** Raw jsonb from service_packages.checklist — validated by parseChecklist. */
export type ChecklistLike = unknown;

export interface Category {
  slug: string;
  name_am: string;
  name_en: string;
  icon: string | null;
  sort: number;
  active: boolean;
  min_verification_level: VerificationLevel;
}

/** worker_profiles row + embedded profiles (FK worker_profiles.user_id → profiles.id). */
export interface WorkerListRow {
  user_id: string;
  neighborhood: string | null;
  categories: string[];
  availability_status: AvailabilityStatus;
  price_min_cents: number | null;
  price_max_cents: number | null;
  rating_avg: number;
  review_count: number;
  jobs_completed: number;
  badge_level: BadgeLevel;
  verification_level: VerificationLevel;
  profiles: {
    display_name: string;
    avatar_url: string | null;
  };
}

export interface WorkerDetailRow extends WorkerListRow {
  bio: string | null;
  skills: string[];
  travel_radius_km: number;
  price_type: string | null;
  profiles: {
    display_name: string;
    avatar_url: string | null;
    phone_masked: string | null;
  };
}

/** Return row of public.nearby_workers(lat, lng, category, radius_km). */
export interface NearbyWorkerRow {
  worker_id: string;
  display_name: string;
  avatar_url: string | null;
  neighborhood: string | null;
  categories: string[];
  availability_status: AvailabilityStatus;
  price_min_cents: number | null;
  price_max_cents: number | null;
  price_type: string | null;
  rating_avg: number;
  review_count: number;
  jobs_completed: number;
  badge_level: BadgeLevel;
  verification_level: VerificationLevel;
  distance_m: number;
  truncated: boolean;
}

export interface PackageRow {
  id: string;
  category_slug: string;
  name_am: string;
  name_en: string;
  description: string | null;
  checklist: unknown;
  base_price_cents: number;
  duration_min: number | null;
}

export interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface JobTeaserRow {
  id: string;
  title: string;
  category_slug: string;
  service_neighborhood: string | null;
  budget_cents: number | null;
  created_at: string;
  status: 'open';
}

/** A list page result that reports what a row cap dropped (never silent). */
export interface CappedList<T> {
  rows: T[];
  /** Total matching rows on the server (RLS-visible), or null if unknown. */
  total: number | null;
}
