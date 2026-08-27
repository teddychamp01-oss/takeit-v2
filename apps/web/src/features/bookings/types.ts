// Row shapes for the bookings/chat/reviews data layer. Column names mirror
// supabase/migrations/20260827000300_tables.sql EXACTLY — audited before
// writing (R1). Do not rename fields without re-reading the migrations.

import type { BookingStatus } from '../../components/StatusBadge';
import type { VerificationLevel } from '../../components/VerifiedBadge';

/** Embedded party profile (via profiles!bookings_*_fkey). */
export interface PartyProfileEmbed {
  display_name: string;
  avatar_url: string | null;
  /** C3: profiles store ONLY the masked value — a full number never exists here. */
  phone_masked: string | null;
}

export interface JobEmbed {
  title: string;
  category_slug: string;
  /**
   * jobs.date_needed (YYYY-MM-DD or null). OPTIONAL because only the booking
   * DETAIL select fetches it (N15 dual-date row); inbox rows omit it.
   */
  date_needed?: string | null;
}

/** One inbox row: booking + job title + both parties' display names. */
export interface InboxBookingRow {
  id: string;
  job_id: string;
  worker_id: string;
  customer_id: string;
  agreed_price_cents: number;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
  jobs: JobEmbed | JobEmbed[] | null;
  worker: PartyProfileEmbed | PartyProfileEmbed[] | null;
  customer: PartyProfileEmbed | PartyProfileEmbed[] | null;
}

export interface BookingDetailRow extends InboxBookingRow {
  started_at: string | null;
  worker_done_at: string | null;
  completed_at: string | null;
}

export interface MessageRow {
  id: string;
  booking_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface OffappPaymentRow {
  id: string;
  booking_id: string;
  provider: 'chapa' | 'offapp';
  amount_cents: number;
  status: string;
  customer_confirmed: boolean;
  worker_confirmed: boolean;
  created_at: string;
}

export interface BookingReviewRow {
  id: string;
  booking_id: string;
  reviewer_id: string;
  reviewee_id: string;
  direction: 'c_to_w' | 'w_to_c';
  rating: number;
  comment: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

/**
 * Trust fields for the booking-screen worker identity card (N7). Read from
 * worker_profiles (RLS: readable by all authenticated — verified in
 * 20260827000500_rls.sql worker_profiles_select). All four columns are
 * server-maintained; the client never writes them.
 */
export interface WorkerTrustRow {
  verification_level: VerificationLevel;
  rating_avg: number;
  review_count: number;
  jobs_completed: number;
}

/** rpc_send_message result (jsonb). */
export interface SendMessageResult {
  message_id: string;
  /** True = the server masked phone-like content (C3 pre-confirm soft-block). */
  phone_masked: boolean;
}

/** rpc_submit_review result (jsonb). */
export interface SubmitReviewResult {
  review_id: string;
  /** True = both sides have now submitted; reviews were published. */
  published: boolean;
}

/** rpc_log_offapp_payment result (jsonb). */
export interface LogPaymentResult {
  payment_id: string;
  status: string;
  amount_cents: number;
  customer_confirmed: boolean;
  worker_confirmed: boolean;
}

/** A list result that reports what a row cap dropped (never silent). */
export interface CappedList<T> {
  rows: T[];
  /** Total matching rows on the server (RLS-visible), or null if unknown. */
  total: number | null;
}
