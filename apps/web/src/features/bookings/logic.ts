// Pure bookings-feature logic — no supabase import, no DOM. Everything here
// is unit-tested (__tests__/logic.test.ts): the client-side mirror of the
// booking state machine, unread counting, the double-blind review reveal,
// off-app payment card states, birr parsing (integer cents, C7), the C3
// phone soft-warn interaction, and RPC-error → i18n-key mapping.
//
// The state machine mirrors the SECURITY DEFINER RPCs in
// supabase/migrations/20260827000400_functions_triggers.sql EXACTLY (R1:
// audited before writing). The client never writes status columns — it only
// decides which RPC button to OFFER; the server enforces the transition.
//
//   confirmed  -> started            (worker,   rpc_booking_start)
//   started    -> worker_done        (worker,   rpc_booking_worker_done)
//   worker_done-> customer_confirmed (customer, rpc_booking_customer_confirm)
//   confirmed|started              -> cancelled (either, rpc_booking_cancel)
//   confirmed|started|worker_done  -> disputed  (either, rpc_booking_dispute)

import { containsPhoneNumber } from '../../lib/phone';
import type { BookingStatus } from '../../components/StatusBadge';
import type { MessageKey } from '../../i18n';

// ---------------------------------------------------------------------------
// Roles (C4 dual-role: one account can be customer on one booking and worker
// on another — the role is per BOOKING, never per account)
// ---------------------------------------------------------------------------
export type BookingRole = 'customer' | 'worker';

export interface BookingParties {
  customer_id: string;
  worker_id: string;
}

/** The viewer's role on ONE booking; null = not a party (RLS should prevent). */
export function bookingRole(
  booking: BookingParties,
  uid: string,
): BookingRole | null {
  if (booking.customer_id === uid) return 'customer';
  if (booking.worker_id === uid) return 'worker';
  return null;
}

// ---------------------------------------------------------------------------
// State machine (client mirror — see file header)
// ---------------------------------------------------------------------------
export type BookingAction =
  | 'start'
  | 'worker_done'
  | 'customer_confirm'
  | 'cancel'
  | 'dispute';

/** The ONE forward action this role may take now, or null. */
export function primaryActionFor(
  role: BookingRole,
  status: BookingStatus,
): BookingAction | null {
  if (role === 'worker' && status === 'confirmed') return 'start';
  if (role === 'worker' && status === 'started') return 'worker_done';
  if (role === 'customer' && status === 'worker_done') return 'customer_confirm';
  return null;
}

/** rpc_booking_cancel guard: confirmed | started, either party. */
export function canCancel(status: BookingStatus): boolean {
  return status === 'confirmed' || status === 'started';
}

/** rpc_booking_dispute guard: confirmed | started | worker_done, either party. */
export function canDispute(status: BookingStatus): boolean {
  return (
    status === 'confirmed' || status === 'started' || status === 'worker_done'
  );
}

/** rpc_send_message refuses only cancelled bookings (TAKEIT_CHAT_CLOSED). */
export function canChat(status: BookingStatus): boolean {
  return status !== 'cancelled';
}

/** rpc_log_offapp_payment guard: started | worker_done | customer_confirmed. */
export function canLogPayment(status: BookingStatus): boolean {
  return (
    status === 'started' ||
    status === 'worker_done' ||
    status === 'customer_confirmed'
  );
}

/** rpc_submit_review guard: reviews open at customer_confirmed only. */
export function canReview(status: BookingStatus): boolean {
  return status === 'customer_confirmed';
}

/**
 * C3: the contact-masking soft-block lifts ONLY at customer_confirmed —
 * the same point rpc_booking_customer_confirm returns contact_unlocked=true
 * and rpc_send_message stops masking phone-number-looking content.
 */
export function isContactUnlocked(status: BookingStatus): boolean {
  return status === 'customer_confirmed';
}

/**
 * C3 pre-confirmation soft warning: warn while the contact lock is on and
 * the draft looks like it contains an Ethiopian phone number. The server
 * masks regardless; this is the client-side heads-up BEFORE sending.
 */
export function shouldWarnPhone(draft: string, status: BookingStatus): boolean {
  if (isContactUnlocked(status)) return false;
  return containsPhoneNumber(draft);
}

export const BOOKING_ACTION_LABEL: Record<BookingAction, MessageKey> = {
  start: 'bookings.actionStart',
  worker_done: 'bookings.actionWorkerDone',
  customer_confirm: 'bookings.actionCustomerConfirm',
  cancel: 'bookings.actionCancel',
  dispute: 'bookings.actionDispute',
};

/** Success-toast copy per action (shown AFTER the RPC succeeded, never before). */
export const BOOKING_ACTION_TOAST: Record<BookingAction, MessageKey> = {
  start: 'bookings.toastStarted',
  worker_done: 'bookings.toastWorkerDone',
  customer_confirm: 'bookings.toastCustomerConfirmed',
  cancel: 'bookings.toastCancelled',
  dispute: 'bookings.toastDisputed',
};

// ---------------------------------------------------------------------------
// Status stepper (v1-adoption T4) — PRESENTATION of the happy path only.
// The stepper never offers a write; all transitions stay in the RPC handlers.
// cancelled/disputed are off-path: bookingStageIndex returns null and the
// page keeps rendering only the StatusBadge for them.
// ---------------------------------------------------------------------------
export const BOOKING_STAGES = [
  'confirmed',
  'started',
  'worker_done',
  'customer_confirmed',
] as const;

export type BookingStage = (typeof BOOKING_STAGES)[number];

export const BOOKING_STAGE_LABEL: Record<BookingStage, MessageKey> = {
  confirmed: 'bookings.stageConfirmed',
  started: 'bookings.stageStarted',
  worker_done: 'bookings.stageWorkerDone',
  customer_confirmed: 'bookings.stageCustomerConfirmed',
};

/**
 * Index of `status` on the happy path (0-based), or null when the booking is
 * off it (cancelled/disputed) — the caller must then not render a stepper.
 */
export function bookingStageIndex(status: BookingStatus): number | null {
  const index = (BOOKING_STAGES as readonly string[]).indexOf(status);
  return index === -1 ? null : index;
}

/** Per-role explanation of where the booking stands and what happens next. */
export function statusHintKey(
  role: BookingRole,
  status: BookingStatus,
): MessageKey {
  switch (status) {
    case 'confirmed':
      return role === 'worker'
        ? 'bookings.hintConfirmedWorker'
        : 'bookings.hintConfirmedCustomer';
    case 'started':
      return role === 'worker'
        ? 'bookings.hintStartedWorker'
        : 'bookings.hintStartedCustomer';
    case 'worker_done':
      return role === 'customer'
        ? 'bookings.hintWorkerDoneCustomer'
        : 'bookings.hintWorkerDoneWorker';
    case 'customer_confirmed':
      return 'bookings.hintCompleted';
    case 'disputed':
      return 'bookings.hintDisputed';
    case 'cancelled':
      return 'bookings.hintCancelled';
  }
}

// ---------------------------------------------------------------------------
// Inbox: role filter + unread counts
// ---------------------------------------------------------------------------
export type RoleFilter = 'all' | 'customer' | 'worker';

export function filterBookingsByRole<T extends BookingParties>(
  rows: readonly T[],
  uid: string,
  filter: RoleFilter,
): T[] {
  if (filter === 'all') return [...rows];
  return rows.filter((row) => bookingRole(row, uid) === filter);
}

/** True when the user appears as customer on ≥1 row AND worker on ≥1 row. */
export function hasBothRoles(
  rows: readonly BookingParties[],
  uid: string,
): boolean {
  let customer = false;
  let worker = false;
  for (const row of rows) {
    const role = bookingRole(row, uid);
    if (role === 'customer') customer = true;
    if (role === 'worker') worker = true;
    if (customer && worker) return true;
  }
  return false;
}

/** How many unread rows one scan requests (law 6: report what a cap dropped). */
export const UNREAD_SCAN_LIMIT = 500;

export interface UnreadResult {
  /** booking_id -> unread incoming messages seen by the scan. */
  counts: Record<string, number>;
  /** True when the scan hit its cap — every count is then a LOWER BOUND. */
  truncated: boolean;
}

export function countUnreadByBooking(
  rows: readonly { booking_id: string }[],
  limit: number = UNREAD_SCAN_LIMIT,
): UnreadResult {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.booking_id] = (counts[row.booking_id] ?? 0) + 1;
  }
  return { counts, truncated: rows.length >= limit };
}

/**
 * Badge text for one booking's unread count. null = no badge. A truncated
 * scan renders "n+" (the count is a lower bound, never presented as exact —
 * silence is not safety, and neither is a wrong exact number).
 */
export function unreadBadgeText(
  count: number,
  truncated: boolean,
): string | null {
  if (count <= 0) return null;
  if (count > 99) return '99+';
  return truncated ? `${count}+` : String(count);
}

// ---------------------------------------------------------------------------
// Chat helpers
// ---------------------------------------------------------------------------
/** messages.body CHECK: 1..2000 chars (tables migration). */
export const MESSAGE_MAX = 2000;

/** null = sendable; otherwise the error key. Empty just disables the button. */
export function validateMessageBody(body: string): MessageKey | null {
  if (body.length > MESSAGE_MAX) return 'chat.errorMessageLength';
  return null;
}

export interface ChatMessageLike {
  id: string;
  created_at: string;
}

/**
 * Append with de-dupe + stable ordering (created_at, then id — a realtime
 * INSERT and the post-send fetch can both deliver the same row).
 * Returns the SAME array when the message is already present (no re-render).
 */
export function appendMessage<T extends ChatMessageLike>(
  list: T[],
  message: T,
): T[] {
  if (list.some((m) => m.id === message.id)) return list;
  const next = [...list, message];
  next.sort((a, b) => {
    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return next;
}

// ---------------------------------------------------------------------------
// Cancel / dispute reasons (bounds mirror the RPC guards)
// ---------------------------------------------------------------------------
export const CANCEL_REASON_MAX = 500; // TAKEIT_REASON_TOO_LONG
export const DISPUTE_REASON_MIN = 3; // TAKEIT_REASON_LENGTH
export const DISPUTE_REASON_MAX = 2000;

export function validateCancelReason(reason: string): MessageKey | null {
  if (reason.trim().length > CANCEL_REASON_MAX) {
    return 'bookings.errorCancelReasonTooLong';
  }
  return null;
}

export function validateDisputeReason(reason: string): MessageKey | null {
  const len = reason.trim().length;
  if (len < DISPUTE_REASON_MIN || len > DISPUTE_REASON_MAX) {
    return 'bookings.errorReasonLength';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Money: birr text input -> integer cents (C7 — no float arithmetic).
// Deliberately NOT imported from features/jobs (each feature stays
// self-contained; cross-feature imports would couple concurrent work).
// ---------------------------------------------------------------------------
/** Fat-finger ceiling, same product bound the jobs feature uses. */
export const AMOUNT_MAX_BIRR = 1_000_000;

export type ParsedAmount =
  | { ok: true; cents: number | null }
  | { ok: false; errorKey: MessageKey };

const BIRR_RE = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parse a user-typed birr amount into integer cents. Empty input is valid
 * and means "use the agreed price" (rpc_log_offapp_payment coalesces a null
 * p_amount_cents to bookings.agreed_price_cents). Cents come from the digit
 * strings — no float multiplication.
 */
export function parseBirrToCents(input: string): ParsedAmount {
  const cleaned = input.trim().replace(/[,\s]/g, '');
  if (cleaned === '') return { ok: true, cents: null };
  const match = BIRR_RE.exec(cleaned);
  if (!match) return { ok: false, errorKey: 'bookings.errorAmountInvalid' };
  const birr = Number(match[1]);
  if (!Number.isSafeInteger(birr) || birr > AMOUNT_MAX_BIRR) {
    return { ok: false, errorKey: 'bookings.errorAmountTooLarge' };
  }
  const frac = (match[2] ?? '').padEnd(2, '0');
  return { ok: true, cents: birr * 100 + Number(frac) };
}

/** Inverse of parseBirrToCents for prefilled inputs. null/undefined -> ''. */
export function centsToBirrInput(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents) || cents < 0) return '';
  const whole = Math.floor(cents / 100);
  const rem = cents % 100;
  return rem === 0 ? String(whole) : `${whole}.${String(rem).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Off-app payment card (Phase 1, C1: a LOG, never a Take It-held balance)
// ---------------------------------------------------------------------------
export interface OffappPaymentLike {
  customer_confirmed: boolean;
  worker_confirmed: boolean;
}

/** Whether THIS viewer's side of the dual confirmation is already done. */
export function viewerHasConfirmedPayment(
  payment: OffappPaymentLike,
  role: BookingRole,
): boolean {
  return role === 'customer'
    ? payment.customer_confirmed
    : payment.worker_confirmed;
}

export function bothConfirmedPayment(payment: OffappPaymentLike): boolean {
  return payment.customer_confirmed && payment.worker_confirmed;
}

// ---------------------------------------------------------------------------
// Double-blind reviews (hidden until both submit or 48h — mirrors the
// reviews RLS policy + rpc_submit_review publish logic)
// ---------------------------------------------------------------------------
export const REVIEW_REVEAL_HOURS = 48;
export const REVIEW_COMMENT_MAX = 1000;

export interface BookingReviewLike {
  reviewer_id: string;
  is_published: boolean;
  created_at: string;
}

/** When an unpublished review auto-reveals (created_at + 48h), as ISO. */
export function reviewRevealAtIso(createdAtIso: string): string {
  return new Date(
    new Date(createdAtIso).getTime() + REVIEW_REVEAL_HOURS * 3_600_000,
  ).toISOString();
}

/**
 * Still hidden from the other side? True while unpublished AND younger than
 * 48h. (RLS reveals >48h-old reviews even if the flag was never flipped.)
 */
export function isReviewHidden(
  review: Pick<BookingReviewLike, 'is_published' | 'created_at'>,
  now: Date = new Date(),
): boolean {
  if (review.is_published) return false;
  return now.getTime() < new Date(reviewRevealAtIso(review.created_at)).getTime();
}

/** Split a booking's visible reviews into the viewer's own and the other's. */
export function splitReviews<T extends BookingReviewLike>(
  rows: readonly T[],
  uid: string,
): { mine: T | null; theirs: T | null } {
  return {
    mine: rows.find((r) => r.reviewer_id === uid) ?? null,
    theirs: rows.find((r) => r.reviewer_id !== uid) ?? null,
  };
}

export interface ReviewFormErrors {
  rating?: MessageKey;
  comment?: MessageKey;
}

export function validateReviewForm(
  rating: number,
  comment: string,
): ReviewFormErrors {
  const errors: ReviewFormErrors = {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.rating = 'reviews.errorRatingRange';
  }
  if (comment.trim().length > REVIEW_COMMENT_MAX) {
    errors.comment = 'reviews.errorCommentTooLong';
  }
  return errors;
}

// ---------------------------------------------------------------------------
// RPC payloads — parameter names copied from the SQL, verbatim (Gate 4).
// Verified against src/lib/database.types.ts (generated from the live DB).
// Optional params are OMITTED when absent: JSON serialization then drops the
// key and PostgREST applies the SQL default (null / '[]' in the audited
// functions) — identical semantics, and it matches the generated Database
// types the typed supabase client enforces.
// ---------------------------------------------------------------------------
export interface RpcBookingIdArgs {
  p_booking_id: string;
}

export interface RpcCancelArgs {
  p_booking_id: string;
  /** Omitted entirely when the user gave no reason (SQL default null). */
  p_reason?: string;
}

export function buildCancelArgs(
  bookingId: string,
  reason: string,
): RpcCancelArgs {
  const trimmed = reason.trim();
  return trimmed === ''
    ? { p_booking_id: bookingId }
    : { p_booking_id: bookingId, p_reason: trimmed };
}

/** p_evidence is intentionally OMITTED — the SQL default ('[]') applies. */
export interface RpcDisputeArgs {
  p_booking_id: string;
  p_reason: string;
}

export function buildDisputeArgs(
  bookingId: string,
  reason: string,
): RpcDisputeArgs {
  return { p_booking_id: bookingId, p_reason: reason.trim() };
}

export interface RpcLogPaymentArgs {
  p_booking_id: string;
  /** Omitted -> the server logs/keeps the booking's agreed price (coalesce). */
  p_amount_cents?: number;
}

export function buildLogPaymentArgs(
  bookingId: string,
  amountCents: number | null,
): RpcLogPaymentArgs {
  return amountCents === null
    ? { p_booking_id: bookingId }
    : { p_booking_id: bookingId, p_amount_cents: amountCents };
}

export interface RpcSendMessageArgs {
  p_booking_id: string;
  p_body: string;
}

export interface RpcSubmitReviewArgs {
  p_booking_id: string;
  p_rating: number;
  /** Omitted when the reviewer left no comment (SQL default null). */
  p_comment?: string;
}

export function buildSubmitReviewArgs(
  bookingId: string,
  rating: number,
  comment: string,
): RpcSubmitReviewArgs {
  const trimmed = comment.trim();
  return trimmed === ''
    ? { p_booking_id: bookingId, p_rating: rating }
    : { p_booking_id: bookingId, p_rating: rating, p_comment: trimmed };
}

// ---------------------------------------------------------------------------
// Server error -> i18n key. RPCs RAISE 'TAKEIT_<CODE>: detail'; anything
// unrecognized falls back to a generic, localized failure message.
// ---------------------------------------------------------------------------
const RPC_ERROR_KEYS: Record<string, MessageKey> = {
  TAKEIT_AUTH_REQUIRED: 'bookings.errorAuthRequired',
  TAKEIT_BOOKING_NOT_FOUND: 'bookings.notFoundTitle',
  TAKEIT_NOT_BOOKING_WORKER: 'bookings.errorNotAllowed',
  TAKEIT_NOT_BOOKING_CUSTOMER: 'bookings.errorNotAllowed',
  TAKEIT_NOT_BOOKING_PARTY: 'bookings.errorNotAllowed',
  TAKEIT_INVALID_TRANSITION: 'bookings.errorInvalidTransition',
  TAKEIT_REASON_TOO_LONG: 'bookings.errorCancelReasonTooLong',
  TAKEIT_REASON_LENGTH: 'bookings.errorReasonLength',
  TAKEIT_PAYMENT_TOO_EARLY: 'bookings.errorPaymentTooEarly',
  TAKEIT_AMOUNT_NEGATIVE: 'bookings.errorAmountInvalid',
  TAKEIT_PAYMENT_AMOUNT_MISMATCH: 'bookings.errorAmountMismatch',
  TAKEIT_MESSAGE_LENGTH: 'chat.errorMessageLength',
  TAKEIT_CHAT_CLOSED: 'chat.errorClosed',
  TAKEIT_RATING_RANGE: 'reviews.errorRatingRange',
  TAKEIT_COMMENT_TOO_LONG: 'reviews.errorCommentTooLong',
  TAKEIT_BOOKING_NOT_COMPLETED: 'reviews.errorNotCompleted',
  TAKEIT_ALREADY_REVIEWED: 'reviews.errorAlreadyReviewed',
};

export function rpcErrorKey(message: string | null | undefined): MessageKey {
  if (typeof message === 'string') {
    const match = message.match(/TAKEIT_[A-Z_]+/);
    if (match) {
      const key = RPC_ERROR_KEYS[match[0]];
      if (key) return key;
    }
  }
  return 'bookings.errorGeneric';
}

/** Message text out of whatever a supabase call threw (PostgrestError or Error). */
export function getErrorMessage(e: unknown): string | undefined {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// PostgREST embed normalization (to-one embeds can arrive object OR array)
// ---------------------------------------------------------------------------
export function extractEmbedded<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null;
  return value;
}
