// Minimal async-fetch hook for the bookings feature (no query library —
// every KB counts on low-end Android, C6). Deliberately duplicated from
// features/browse/useAsync.ts rather than imported: features stay
// self-contained so concurrent feature work cannot break each other.
//
// ── DIVERGENCE from features/browse/useAsync.ts (A7, 2026-08-28) ───────────
// This copy does stale-while-revalidate on reload(); the browse copy does
// not. The two files are NO LONGER line-for-line identical — read this note
// before "restoring" either one to match the other.
//
// Why only here: BookingPage calls reload() after every state-machine RPC.
// With the browse semantics `data` went null for the duration of the
// refetch, BookingPage early-returned a spinner, and that unmounted
// ChatSection — destroying the user's UNSENT chat draft and tearing down the
// realtime WebSocket on every tap. Browse has no equivalent: nothing there
// holds user-entered state across a reload.
// ───────────────────────────────────────────────────────────────────────────
//
// Loading, error and empty states are all representable, a stale response can
// never overwrite a newer one, and `loading` is computed against the
// CURRENTLY wanted key — so flipping `enabled` or changing `key` never
// flashes a stale empty/error state for a frame before the effect runs.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncResult<T> {
  /**
   * The newest data for the CURRENT `key`. During a reload() of that same key
   * this is still the previous value (stale-while-revalidate) — pair it with
   * `loading` rather than treating null as "not loaded yet".
   */
  data: T | null;
  /** True whenever a fetch for the currently wanted key+nonce is in flight. */
  loading: boolean;
  /** True when the fetch rejected. The UI shows a retry, never raw errors. */
  failed: boolean;
  reload: () => void;
}

interface Settled<T> {
  /** The caller's `key` — the ENTITY. Stale data is reused only within it. */
  key: string;
  /** reload() counter — identifies which attempt at `key` this settled. */
  nonce: number;
  data: T | null;
  failed: boolean;
}

/**
 * Run `fn` whenever `key` changes (encode every query input into `key`).
 * When `enabled` is false nothing runs and data is null — used to skip
 * queries that RLS forbids or that need a signed-in user.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  key: string,
  enabled: boolean = true,
): AsyncResult<T> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fnRef.current().then(
      (data) => {
        if (!cancelled) setSettled({ key, nonce, data, failed: false });
      },
      () => {
        if (!cancelled) setSettled({ key, nonce, data: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, nonce, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Two different questions, deliberately not one:
  //   sameKey — is what we hold about the SAME entity the caller is asking
  //             about? Only then may it be shown while a refetch runs.
  //   fresh   — is it also the current ATTEMPT? Only then are `loading` and
  //             `failed` allowed to settle.
  // A changed `key` fails sameKey, so booking A's row can never render under
  // booking B; a bumped nonce fails only `fresh`, which is the whole point.
  const held = enabled && settled?.key === key ? settled : null;
  const fresh = held?.nonce === nonce ? held : null;
  return {
    data: held && !held.failed ? held.data : null,
    loading: enabled && fresh === null,
    failed: fresh?.failed ?? false,
    reload,
  };
}
