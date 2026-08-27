// Pure-logic tests for the bookings feature. The state-machine matrix is
// exhaustive on purpose (every role × status combination is asserted, not
// just the happy path): a client that OFFERS a wrong transition button is a
// confusing dead-end for a user even though the server RPC would refuse it.
//
// Gate 2 discipline: for every guard there is at least one case built to
// TRIP it (wrong status, over-long input, truncated scan, phone in a draft)
// so a regressed guard fails the suite instead of passing silently.

import { describe, expect, it } from 'vitest';
import {
  AMOUNT_MAX_BIRR,
  BOOKING_ACTION_LABEL,
  appendMessage,
  bookingRole,
  bothConfirmedPayment,
  buildCancelArgs,
  buildDisputeArgs,
  buildLogPaymentArgs,
  buildSubmitReviewArgs,
  canCancel,
  canChat,
  canDispute,
  canLogPayment,
  canReview,
  centsToBirrInput,
  countUnreadByBooking,
  extractEmbedded,
  filterBookingsByRole,
  getErrorMessage,
  hasBothRoles,
  isContactUnlocked,
  isReviewHidden,
  MESSAGE_MAX,
  parseBirrToCents,
  primaryActionFor,
  reviewRevealAtIso,
  rpcErrorKey,
  shouldWarnPhone,
  splitReviews,
  statusHintKey,
  UNREAD_SCAN_LIMIT,
  unreadBadgeText,
  validateCancelReason,
  validateDisputeReason,
  validateMessageBody,
  validateReviewForm,
  viewerHasConfirmedPayment,
} from '../logic';
import type { BookingStatus } from '../../../components/StatusBadge';

const ALL_STATUSES: readonly BookingStatus[] = [
  'confirmed',
  'started',
  'worker_done',
  'customer_confirmed',
  'disputed',
  'cancelled',
];

const CUSTOMER = 'aaaaaaaa-0000-0000-0000-000000000001';
const WORKER = 'bbbbbbbb-0000-0000-0000-000000000002';
const STRANGER = 'cccccccc-0000-0000-0000-000000000003';
const parties = { customer_id: CUSTOMER, worker_id: WORKER };

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

describe('bookingRole', () => {
  it('maps each party and rejects a stranger', () => {
    expect(bookingRole(parties, CUSTOMER)).toBe('customer');
    expect(bookingRole(parties, WORKER)).toBe('worker');
    expect(bookingRole(parties, STRANGER)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// State machine — exhaustive matrix, mirrors the RPC guards in
// 20260827000400_functions_triggers.sql
// ---------------------------------------------------------------------------

describe('primaryActionFor', () => {
  it('matches the RPC state machine for every role × status', () => {
    const expected: Record<BookingStatus, { customer: string | null; worker: string | null }> = {
      confirmed: { customer: null, worker: 'start' },
      started: { customer: null, worker: 'worker_done' },
      worker_done: { customer: 'customer_confirm', worker: null },
      customer_confirmed: { customer: null, worker: null },
      disputed: { customer: null, worker: null },
      cancelled: { customer: null, worker: null },
    };
    for (const status of ALL_STATUSES) {
      expect(primaryActionFor('customer', status)).toBe(
        expected[status].customer,
      );
      expect(primaryActionFor('worker', status)).toBe(expected[status].worker);
    }
  });
});

describe('secondary/side guards mirror the RPCs exactly', () => {
  it('canCancel: confirmed|started only (rpc_booking_cancel)', () => {
    const allowed: BookingStatus[] = ['confirmed', 'started'];
    for (const status of ALL_STATUSES) {
      expect(canCancel(status)).toBe(allowed.includes(status));
    }
  });

  it('canDispute: confirmed|started|worker_done only (rpc_booking_dispute)', () => {
    const allowed: BookingStatus[] = ['confirmed', 'started', 'worker_done'];
    for (const status of ALL_STATUSES) {
      expect(canDispute(status)).toBe(allowed.includes(status));
    }
  });

  it('canChat: everything except cancelled (TAKEIT_CHAT_CLOSED)', () => {
    for (const status of ALL_STATUSES) {
      expect(canChat(status)).toBe(status !== 'cancelled');
    }
  });

  it('canLogPayment: started|worker_done|customer_confirmed (TAKEIT_PAYMENT_TOO_EARLY)', () => {
    const allowed: BookingStatus[] = [
      'started',
      'worker_done',
      'customer_confirmed',
    ];
    for (const status of ALL_STATUSES) {
      expect(canLogPayment(status)).toBe(allowed.includes(status));
    }
  });

  it('canReview: customer_confirmed ONLY (rpc_submit_review)', () => {
    for (const status of ALL_STATUSES) {
      expect(canReview(status)).toBe(status === 'customer_confirmed');
    }
  });

  it('every action has an i18n label and every status a per-role hint', () => {
    for (const key of Object.values(BOOKING_ACTION_LABEL)) {
      expect(key).toMatch(/^bookings\./);
    }
    for (const status of ALL_STATUSES) {
      expect(statusHintKey('customer', status)).toMatch(/^bookings\.hint/);
      expect(statusHintKey('worker', status)).toMatch(/^bookings\.hint/);
    }
  });
});

// ---------------------------------------------------------------------------
// C3 masking interactions — the contact lock lifts at customer_confirmed
// and NOWHERE else. (Getting 'confirmed' wrong here would leak the soft
// unlock five states early — asserted per status, not just once.)
// ---------------------------------------------------------------------------

describe('isContactUnlocked (C3)', () => {
  it('is true ONLY at customer_confirmed — "confirmed" stays LOCKED', () => {
    expect(isContactUnlocked('customer_confirmed')).toBe(true);
    expect(isContactUnlocked('confirmed')).toBe(false);
    expect(isContactUnlocked('started')).toBe(false);
    expect(isContactUnlocked('worker_done')).toBe(false);
    expect(isContactUnlocked('disputed')).toBe(false);
    expect(isContactUnlocked('cancelled')).toBe(false);
  });
});

describe('shouldWarnPhone (C3 soft warning)', () => {
  it('warns on an Ethiopian phone number while the lock is on', () => {
    expect(shouldWarnPhone('call me 0911234567', 'confirmed')).toBe(true);
    expect(shouldWarnPhone('+251 91 123 45 67', 'started')).toBe(true);
    expect(shouldWarnPhone('09-11-23-45-67', 'worker_done')).toBe(true);
  });

  it('does NOT warn once the booking is customer_confirmed', () => {
    expect(shouldWarnPhone('call me 0911234567', 'customer_confirmed')).toBe(
      false,
    );
  });

  it('does not warn on ordinary text or plain prices', () => {
    expect(shouldWarnPhone('ሰላም፣ ነገ ጠዋት እመጣለሁ', 'confirmed')).toBe(false);
    expect(shouldWarnPhone('the price is 1250 birr', 'confirmed')).toBe(false);
    expect(shouldWarnPhone('', 'confirmed')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Inbox: unread counting + role filtering
// ---------------------------------------------------------------------------

describe('countUnreadByBooking', () => {
  it('counts per booking and reports an un-truncated scan', () => {
    const rows = [
      { booking_id: 'b1' },
      { booking_id: 'b2' },
      { booking_id: 'b1' },
    ];
    const result = countUnreadByBooking(rows, 500);
    expect(result.counts).toEqual({ b1: 2, b2: 1 });
    expect(result.truncated).toBe(false);
  });

  it('flags a scan that hit its cap (counts become lower bounds)', () => {
    const rows = Array.from({ length: UNREAD_SCAN_LIMIT }, () => ({
      booking_id: 'b1',
    }));
    expect(countUnreadByBooking(rows).truncated).toBe(true);
  });

  it('empty scan: no counts, not truncated', () => {
    expect(countUnreadByBooking([], 500)).toEqual({
      counts: {},
      truncated: false,
    });
  });
});

describe('unreadBadgeText', () => {
  it('renders nothing at zero, exact when complete, "n+" when truncated', () => {
    expect(unreadBadgeText(0, false)).toBeNull();
    expect(unreadBadgeText(0, true)).toBeNull();
    expect(unreadBadgeText(5, false)).toBe('5');
    expect(unreadBadgeText(5, true)).toBe('5+');
    expect(unreadBadgeText(150, false)).toBe('99+');
  });
});

describe('role filtering (C4 dual-role)', () => {
  const rows = [
    { id: 'a', customer_id: CUSTOMER, worker_id: WORKER },
    { id: 'b', customer_id: STRANGER, worker_id: CUSTOMER },
  ];

  it('filters by the viewer role per BOOKING, not per account', () => {
    expect(filterBookingsByRole(rows, CUSTOMER, 'all').map((r) => r.id)).toEqual(
      ['a', 'b'],
    );
    expect(
      filterBookingsByRole(rows, CUSTOMER, 'customer').map((r) => r.id),
    ).toEqual(['a']);
    expect(
      filterBookingsByRole(rows, CUSTOMER, 'worker').map((r) => r.id),
    ).toEqual(['b']);
  });

  it('hasBothRoles is true only when both roles actually appear', () => {
    expect(hasBothRoles(rows, CUSTOMER)).toBe(true);
    expect(hasBothRoles([rows[0]], CUSTOMER)).toBe(false);
    expect(hasBothRoles([rows[0]], WORKER)).toBe(false);
    expect(hasBothRoles([], CUSTOMER)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Chat helpers
// ---------------------------------------------------------------------------

describe('validateMessageBody', () => {
  it('accepts up to 2000 chars, rejects 2001 (messages.body CHECK)', () => {
    expect(validateMessageBody('x'.repeat(MESSAGE_MAX))).toBeNull();
    expect(validateMessageBody('x'.repeat(MESSAGE_MAX + 1))).toBe(
      'chat.errorMessageLength',
    );
  });
});

describe('appendMessage', () => {
  const m1 = { id: 'm1', created_at: '2026-08-27T10:00:00Z' };
  const m2 = { id: 'm2', created_at: '2026-08-27T10:01:00Z' };
  const m3 = { id: 'm3', created_at: '2026-08-27T10:00:30Z' };

  it('de-dupes by id and returns the SAME array (realtime + post-send fetch)', () => {
    const list = [m1, m2];
    expect(appendMessage(list, m1)).toBe(list);
  });

  it('keeps created_at order even for an out-of-order arrival', () => {
    const next = appendMessage([m1, m2], m3);
    expect(next.map((m) => m.id)).toEqual(['m1', 'm3', 'm2']);
  });

  it('breaks created_at ties by id (stable, never render order)', () => {
    const t1 = { id: 'a', created_at: '2026-08-27T10:00:00Z' };
    const t2 = { id: 'b', created_at: '2026-08-27T10:00:00Z' };
    expect(appendMessage([t2], t1).map((m) => m.id)).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// Cancel/dispute reason bounds (mirror TAKEIT_REASON_TOO_LONG / _LENGTH)
// ---------------------------------------------------------------------------

describe('reason validation', () => {
  it('cancel: optional, but capped at 500', () => {
    expect(validateCancelReason('')).toBeNull();
    expect(validateCancelReason('x'.repeat(500))).toBeNull();
    expect(validateCancelReason('x'.repeat(501))).toBe(
      'bookings.errorCancelReasonTooLong',
    );
  });

  it('dispute: required 3–2000 chars AFTER trim', () => {
    expect(validateDisputeReason('ab')).toBe('bookings.errorReasonLength');
    expect(validateDisputeReason('  ab  ')).toBe('bookings.errorReasonLength');
    expect(validateDisputeReason('abc')).toBeNull();
    expect(validateDisputeReason('x'.repeat(2000))).toBeNull();
    expect(validateDisputeReason('x'.repeat(2001))).toBe(
      'bookings.errorReasonLength',
    );
  });
});

// ---------------------------------------------------------------------------
// Money (C7: integer cents, no float arithmetic)
// ---------------------------------------------------------------------------

describe('parseBirrToCents', () => {
  it('empty means "use the agreed price" (null cents)', () => {
    expect(parseBirrToCents('')).toEqual({ ok: true, cents: null });
    expect(parseBirrToCents('   ')).toEqual({ ok: true, cents: null });
  });

  it('parses whole birr and cents from digit strings', () => {
    expect(parseBirrToCents('1250')).toEqual({ ok: true, cents: 125000 });
    expect(parseBirrToCents('1,250.50')).toEqual({ ok: true, cents: 125050 });
    expect(parseBirrToCents('12.5')).toEqual({ ok: true, cents: 1250 });
    expect(parseBirrToCents('0.05')).toEqual({ ok: true, cents: 5 });
  });

  it('rejects malformed input', () => {
    for (const bad of ['abc', '-5', '1.234', '1..2', '5 birr']) {
      const result = parseBirrToCents(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorKey).toBe('bookings.errorAmountInvalid');
      }
    }
  });

  it('enforces the fat-finger ceiling', () => {
    expect(parseBirrToCents(String(AMOUNT_MAX_BIRR)).ok).toBe(true);
    const over = parseBirrToCents(String(AMOUNT_MAX_BIRR + 1));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errorKey).toBe('bookings.errorAmountTooLarge');
  });
});

describe('centsToBirrInput', () => {
  it('round-trips through parseBirrToCents', () => {
    for (const cents of [0, 5, 1250, 125000, 125050]) {
      const text = centsToBirrInput(cents);
      expect(parseBirrToCents(text)).toEqual({ ok: true, cents });
    }
  });

  it('degrades bad input to empty', () => {
    expect(centsToBirrInput(null)).toBe('');
    expect(centsToBirrInput(undefined)).toBe('');
    expect(centsToBirrInput(-1)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Off-app payment dual confirm (C1: a log, never custody)
// ---------------------------------------------------------------------------

describe('off-app payment confirmation state', () => {
  it('reads the right boolean for each role', () => {
    const payment = { customer_confirmed: true, worker_confirmed: false };
    expect(viewerHasConfirmedPayment(payment, 'customer')).toBe(true);
    expect(viewerHasConfirmedPayment(payment, 'worker')).toBe(false);
    expect(bothConfirmedPayment(payment)).toBe(false);
    expect(
      bothConfirmedPayment({ customer_confirmed: true, worker_confirmed: true }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Double-blind reviews (hidden until both submit or 48h)
// ---------------------------------------------------------------------------

describe('review reveal', () => {
  const createdAt = '2026-08-27T00:00:00.000Z';

  it('computes created_at + 48h', () => {
    expect(reviewRevealAtIso(createdAt)).toBe('2026-08-29T00:00:00.000Z');
  });

  it('published reviews are never hidden', () => {
    expect(
      isReviewHidden(
        { is_published: true, created_at: createdAt },
        new Date('2026-08-27T01:00:00Z'),
      ),
    ).toBe(false);
  });

  it('unpublished: hidden strictly BEFORE the 48h mark, revealed at it', () => {
    const review = { is_published: false, created_at: createdAt };
    expect(isReviewHidden(review, new Date('2026-08-28T23:59:59Z'))).toBe(true);
    expect(isReviewHidden(review, new Date('2026-08-29T00:00:00Z'))).toBe(
      false,
    );
    expect(isReviewHidden(review, new Date('2026-08-30T00:00:00Z'))).toBe(
      false,
    );
  });
});

describe('splitReviews', () => {
  const mine = { reviewer_id: CUSTOMER, is_published: false, created_at: 'x' };
  const theirs = { reviewer_id: WORKER, is_published: false, created_at: 'y' };

  it('separates own review from the counterpart review', () => {
    expect(splitReviews([mine, theirs], CUSTOMER)).toEqual({ mine, theirs });
    expect(splitReviews([mine], CUSTOMER)).toEqual({ mine, theirs: null });
    expect(splitReviews([theirs], CUSTOMER)).toEqual({ mine: null, theirs });
    expect(splitReviews([], CUSTOMER)).toEqual({ mine: null, theirs: null });
  });
});

describe('validateReviewForm', () => {
  it('requires a 1–5 integer rating', () => {
    expect(validateReviewForm(0, '').rating).toBe('reviews.errorRatingRange');
    expect(validateReviewForm(6, '').rating).toBe('reviews.errorRatingRange');
    expect(validateReviewForm(3.5, '').rating).toBe('reviews.errorRatingRange');
    expect(validateReviewForm(1, '').rating).toBeUndefined();
    expect(validateReviewForm(5, '').rating).toBeUndefined();
  });

  it('caps the comment at 1000 chars', () => {
    expect(validateReviewForm(5, 'x'.repeat(1000)).comment).toBeUndefined();
    expect(validateReviewForm(5, 'x'.repeat(1001)).comment).toBe(
      'reviews.errorCommentTooLong',
    );
  });
});

// ---------------------------------------------------------------------------
// RPC payload builders — the EXACT call shape the client sends (Gate 4)
// ---------------------------------------------------------------------------

describe('RPC payload builders', () => {
  it('cancel: trims the reason; no reason -> the key is OMITTED (SQL default)', () => {
    expect(buildCancelArgs('b1', '  too late  ')).toEqual({
      p_booking_id: 'b1',
      p_reason: 'too late',
    });
    expect(Object.keys(buildCancelArgs('b1', '   '))).toEqual(['p_booking_id']);
  });

  it('dispute: p_booking_id + p_reason only (p_evidence uses the SQL default)', () => {
    const args = buildDisputeArgs('b1', ' work not finished ');
    expect(args).toEqual({ p_booking_id: 'b1', p_reason: 'work not finished' });
    expect(Object.keys(args).sort()).toEqual(['p_booking_id', 'p_reason']);
  });

  it('payment: null amount -> key OMITTED (server logs the agreed price)', () => {
    expect(buildLogPaymentArgs('b1', 125000)).toEqual({
      p_booking_id: 'b1',
      p_amount_cents: 125000,
    });
    expect(Object.keys(buildLogPaymentArgs('b1', null))).toEqual([
      'p_booking_id',
    ]);
  });

  it('review: empty comment -> key OMITTED (SQL default null)', () => {
    expect(buildSubmitReviewArgs('b1', 5, '  great  ')).toEqual({
      p_booking_id: 'b1',
      p_rating: 5,
      p_comment: 'great',
    });
    expect(Object.keys(buildSubmitReviewArgs('b1', 4, '')).sort()).toEqual([
      'p_booking_id',
      'p_rating',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Server error mapping
// ---------------------------------------------------------------------------

describe('rpcErrorKey', () => {
  it('maps TAKEIT_ codes across all three namespaces', () => {
    expect(rpcErrorKey('TAKEIT_INVALID_TRANSITION: booking x is started')).toBe(
      'bookings.errorInvalidTransition',
    );
    expect(rpcErrorKey('TAKEIT_CHAT_CLOSED: booking is cancelled')).toBe(
      'chat.errorClosed',
    );
    expect(rpcErrorKey('TAKEIT_ALREADY_REVIEWED: one review per party')).toBe(
      'reviews.errorAlreadyReviewed',
    );
    expect(rpcErrorKey('TAKEIT_PAYMENT_AMOUNT_MISMATCH: logged 100')).toBe(
      'bookings.errorAmountMismatch',
    );
  });

  it('falls back to the generic key for anything unknown', () => {
    expect(rpcErrorKey('TAKEIT_SOMETHING_NEW: ?')).toBe(
      'bookings.errorGeneric',
    );
    expect(rpcErrorKey('network down')).toBe('bookings.errorGeneric');
    expect(rpcErrorKey(undefined)).toBe('bookings.errorGeneric');
    expect(rpcErrorKey(null)).toBe('bookings.errorGeneric');
  });
});

describe('getErrorMessage / extractEmbedded', () => {
  it('pulls message text out of Error-like objects only', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage({ message: 'pg says no' })).toBe('pg says no');
    expect(getErrorMessage({ message: 42 })).toBeUndefined();
    expect(getErrorMessage('plain string')).toBeUndefined();
    expect(getErrorMessage(null)).toBeUndefined();
  });

  it('normalizes PostgREST to-one embeds (object OR array)', () => {
    expect(extractEmbedded({ a: 1 })).toEqual({ a: 1 });
    expect(extractEmbedded([{ a: 1 }, { a: 2 }])).toEqual({ a: 1 });
    expect(extractEmbedded([])).toBeNull();
    expect(extractEmbedded(null)).toBeNull();
    expect(extractEmbedded(undefined)).toBeNull();
  });
});
