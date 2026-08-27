// Data access for bookings + chat + reviews. Table/column/RPC names match
// the SQL in supabase/migrations/ exactly (R1: audited first):
//   - bookings / messages / payments / reviews / profiles / jobs
//     (20260827000300_tables.sql)
//   - rpc_booking_start / rpc_booking_worker_done /
//     rpc_booking_customer_confirm / rpc_booking_cancel /
//     rpc_booking_dispute / rpc_log_offapp_payment / rpc_send_message /
//     rpc_submit_review (20260827000400_functions_triggers.sql)
//
// Writes are RPC-only: RLS grants no client INSERT on bookings/messages/
// payments/reviews and no status writes anywhere — the SECURITY DEFINER RPCs
// are the single write path (they enforce the state machine + C3 masking).
// The one direct client write is messages.read_at (an explicit column grant
// with a sender_id <> me policy).
//
// Realtime: public.messages is on the supabase_realtime publication with
// walrus enforcing RLS, so INSERT events only reach the two booking parties.

import { supabase } from '../../lib/supabase';
import { UNREAD_SCAN_LIMIT } from './logic';
import type {
  RpcBookingIdArgs,
  RpcCancelArgs,
  RpcDisputeArgs,
  RpcLogPaymentArgs,
  RpcSendMessageArgs,
  RpcSubmitReviewArgs,
} from './logic';
import type {
  BookingDetailRow,
  BookingReviewRow,
  CappedList,
  InboxBookingRow,
  LogPaymentResult,
  MessageRow,
  OffappPaymentRow,
  SendMessageResult,
  SubmitReviewResult,
} from './types';

export const INBOX_LIMIT = 50;
export const MESSAGES_LIMIT = 200;

// Both bookings->profiles FKs need explicit disambiguation (worker_id AND
// customer_id point at profiles). Constraint names are the Postgres defaults.
const PARTY_EMBEDS =
  'worker:profiles!bookings_worker_id_fkey(display_name, avatar_url, phone_masked), ' +
  'customer:profiles!bookings_customer_id_fkey(display_name, avatar_url, phone_masked)';

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

/**
 * The signed-in user's bookings, both roles, most recently active first with
 * a stable id tiebreak. The explicit or() filter matters even though RLS
 * already scopes rows: an ops/admin account can SEE every booking via RLS,
 * but their INBOX must still be only the bookings they are a party to.
 */
export async function fetchMyBookings(
  uid: string,
): Promise<CappedList<InboxBookingRow>> {
  const { data, error, count } = await supabase
    .from('bookings')
    .select(
      'id, job_id, worker_id, customer_id, agreed_price_cents, status, ' +
        `created_at, updated_at, jobs(title, category_slug), ${PARTY_EMBEDS}`,
      { count: 'exact' },
    )
    .or(`customer_id.eq.${uid},worker_id.eq.${uid}`)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true }) // stable id tiebreak, never geography
    .limit(INBOX_LIMIT);
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as InboxBookingRow[],
    total: count ?? null,
  };
}

/**
 * Unread INCOMING messages across all my bookings (RLS scopes messages to
 * bookings I am a party to). Capped scan — the caller must treat counts as
 * lower bounds when rows.length hits the cap (logic.countUnreadByBooking).
 */
export async function fetchUnreadMessages(
  uid: string,
): Promise<{ booking_id: string }[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('booking_id')
    .is('read_at', null)
    .neq('sender_id', uid)
    .limit(UNREAD_SCAN_LIMIT);
  if (error) throw error;
  return (data ?? []) as { booking_id: string }[];
}

// ---------------------------------------------------------------------------
// Booking detail
// ---------------------------------------------------------------------------

/** null = not found OR not visible to this user (RLS makes them identical). */
export async function fetchBooking(
  bookingId: string,
): Promise<BookingDetailRow | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, job_id, worker_id, customer_id, agreed_price_cents, status, ' +
        'started_at, worker_done_at, completed_at, created_at, updated_at, ' +
        `jobs(title, category_slug), ${PARTY_EMBEDS}`,
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as BookingDetailRow) ?? null;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/**
 * The LAST `MESSAGES_LIMIT` messages of one booking, returned oldest-first
 * for display. `total` reports what the cap dropped (law 6).
 */
export async function fetchMessages(
  bookingId: string,
): Promise<CappedList<MessageRow>> {
  const { data, error, count } = await supabase
    .from('messages')
    .select('id, booking_id, sender_id, body, created_at, read_at', {
      count: 'exact',
    })
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MESSAGES_LIMIT);
  if (error) throw error;
  const rows = ((data ?? []) as MessageRow[]).reverse();
  return { rows, total: count ?? null };
}

/** One message by id — used after rpc_send_message to fetch the row AS STORED
 * (the server may have masked phone-like content; never echo the raw draft). */
export async function fetchMessageById(
  messageId: string,
): Promise<MessageRow | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, booking_id, sender_id, body, created_at, read_at')
    .eq('id', messageId)
    .maybeSingle();
  if (error) throw error;
  return (data as MessageRow) ?? null;
}

/**
 * Mark every unread incoming message of this booking read. The only direct
 * client write in this feature — the read_at column grant + the
 * messages_mark_read policy (sender_id <> me AND I am a party) scope it.
 */
export async function markBookingMessagesRead(
  bookingId: string,
  uid: string,
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .neq('sender_id', uid)
    .is('read_at', null);
  if (error) throw error;
}

export async function sendMessage(
  args: RpcSendMessageArgs,
): Promise<SendMessageResult> {
  const { data, error } = await supabase.rpc('rpc_send_message', args);
  if (error) throw error;
  return data as unknown as SendMessageResult;
}

/**
 * Realtime: new messages on one booking. Walrus applies the messages RLS
 * policy, so only the two parties ever receive these events. Returns an
 * unsubscribe function for the effect cleanup.
 */
export function subscribeToBookingMessages(
  bookingId: string,
  onInsert: (message: MessageRow) => void,
): () => void {
  const channel = supabase
    .channel(`booking-messages-${bookingId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `booking_id=eq.${bookingId}`,
      },
      (payload) => {
        onInsert(payload.new as MessageRow);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Booking state machine RPCs (jsonb results; the UI reloads after each)
// ---------------------------------------------------------------------------

export async function startBooking(args: RpcBookingIdArgs): Promise<void> {
  const { error } = await supabase.rpc('rpc_booking_start', args);
  if (error) throw error;
}

export async function markWorkerDone(args: RpcBookingIdArgs): Promise<void> {
  const { error } = await supabase.rpc('rpc_booking_worker_done', args);
  if (error) throw error;
}

export async function confirmCompletion(args: RpcBookingIdArgs): Promise<void> {
  const { error } = await supabase.rpc('rpc_booking_customer_confirm', args);
  if (error) throw error;
}

export async function cancelBooking(args: RpcCancelArgs): Promise<void> {
  const { error } = await supabase.rpc('rpc_booking_cancel', args);
  if (error) throw error;
}

export async function disputeBooking(args: RpcDisputeArgs): Promise<void> {
  // p_evidence omitted on purpose: the SQL default ('[]'::jsonb) applies.
  const { error } = await supabase.rpc('rpc_booking_dispute', args);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Phase-1 off-app payment logging (C1: a log, never custody)
// ---------------------------------------------------------------------------

export async function fetchOffappPayment(
  bookingId: string,
): Promise<OffappPaymentRow | null> {
  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, booking_id, provider, amount_cents, status, customer_confirmed, worker_confirmed, created_at',
    )
    .eq('booking_id', bookingId)
    .eq('provider', 'offapp')
    .maybeSingle();
  if (error) throw error;
  return (data as OffappPaymentRow) ?? null;
}

export async function logOffappPayment(
  args: RpcLogPaymentArgs,
): Promise<LogPaymentResult> {
  const { data, error } = await supabase.rpc('rpc_log_offapp_payment', args);
  if (error) throw error;
  return data as unknown as LogPaymentResult;
}

// ---------------------------------------------------------------------------
// Double-blind reviews
// ---------------------------------------------------------------------------

/**
 * Reviews on one booking. RLS returns my own review always, and the other
 * side's only once published or older than 48h — the double-blind state is
 * therefore computed from what IS visible (logic.splitReviews).
 */
export async function fetchBookingReviews(
  bookingId: string,
): Promise<BookingReviewRow[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(
      'id, booking_id, reviewer_id, reviewee_id, direction, rating, comment, is_published, published_at, created_at',
    )
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(2); // UNIQUE(booking_id, reviewer_id) + two parties = at most 2
  if (error) throw error;
  return (data ?? []) as BookingReviewRow[];
}

export async function submitReview(
  args: RpcSubmitReviewArgs,
): Promise<SubmitReviewResult> {
  const { data, error } = await supabase.rpc('rpc_submit_review', args);
  if (error) throw error;
  return data as unknown as SubmitReviewResult;
}
