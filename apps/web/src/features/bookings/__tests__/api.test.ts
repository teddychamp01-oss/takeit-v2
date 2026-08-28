// Gate 4 — assert the exact PostgREST call shape fetchUnreadMessages sends,
// not a convenient one. A11 added a `.in('booking_id', ids)` filter; the
// failure mode this guards is the one that got past every test in this repo's
// history: a query that "works" in a test with a different argument list than
// production sends.

import { describe, expect, it, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => ({
  log: [] as { method: string; args: unknown[] }[],
  from: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({ supabase: { from: calls.from } }));

import { fetchUnreadMessages } from '../api';
import { UNREAD_SCAN_LIMIT } from '../logic';

/** Chainable stub that records every PostgREST builder call. */
function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'in', 'is', 'neq', 'limit']) {
    chain[method] = (...args: unknown[]) => {
      calls.log.push({ method, args });
      return chain;
    };
  }
  // The builder is the thenable PostgREST returns.
  chain.then = (
    onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
  ) => Promise.resolve(result).then(onFulfilled);
  return chain;
}

beforeEach(() => {
  calls.log = [];
  calls.from.mockReset();
});

describe('fetchUnreadMessages (A11)', () => {
  it('scopes the scan to exactly the booking ids it was given', async () => {
    calls.from.mockImplementation((table: string) => {
      calls.log.push({ method: 'from', args: [table] });
      return builder({ data: [{ booking_id: 'b1' }], error: null });
    });

    const rows = await fetchUnreadMessages('me', ['b1', 'b2', 'b3']);
    expect(rows).toEqual([{ booking_id: 'b1' }]);

    expect(calls.log).toEqual([
      { method: 'from', args: ['messages'] },
      { method: 'select', args: ['booking_id'] },
      { method: 'in', args: ['booking_id', ['b1', 'b2', 'b3']] },
      { method: 'is', args: ['read_at', null] },
      { method: 'neq', args: ['sender_id', 'me'] },
      { method: 'limit', args: [UNREAD_SCAN_LIMIT] },
    ]);
  });

  it('sends NO request at all when there are no bookings', async () => {
    // PostgREST rejects an empty `in.()`; an unfiltered fallback would be the
    // whole-table scan this change exists to remove.
    const rows = await fetchUnreadMessages('me', []);
    expect(rows).toEqual([]);
    expect(calls.from).not.toHaveBeenCalled();
  });

  it('throws the PostgREST error rather than reporting zero unread', async () => {
    calls.from.mockImplementation(() =>
      builder({ data: null, error: { message: 'boom' } }),
    );
    await expect(fetchUnreadMessages('me', ['b1'])).rejects.toEqual({
      message: 'boom',
    });
  });
});
