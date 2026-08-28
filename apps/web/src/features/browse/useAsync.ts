// Minimal async-fetch hook for the browse/home features (no query library —
// every KB counts on low-end Android, C6).
//
// ── DIVERGENCE from features/bookings/useAsync.ts (A7, 2026-08-28) ─────────
// The bookings copy does stale-while-revalidate on reload() — it keeps the
// previous value on screen while the refetch runs. This copy does NOT: on
// reload() `data` goes null and the caller shows its skeleton again. The two
// files are NO LONGER line-for-line identical; do not "resync" them without
// reading the note at the top of the bookings copy for why.
//
// Why the difference: BookingPage reloads after every state-machine RPC and
// holds user-entered state (an unsent chat draft) plus a realtime socket
// across that reload. Nothing in browse/home does — every reload() here is a
// user-pressed Retry on a failed fetch, where re-showing the skeleton is the
// honest state.
// ───────────────────────────────────────────────────────────────────────────
//
// Loading, error and empty states
// are all representable, a stale response can never overwrite a newer one,
// and `loading` is computed against the CURRENTLY wanted key — so flipping
// `enabled` or changing `key` never flashes a stale empty/error state for a
// frame before the effect runs.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncResult<T> {
  data: T | null;
  loading: boolean;
  /** True when the fetch rejected. The UI shows a retry, never raw errors. */
  failed: boolean;
  reload: () => void;
}

interface Settled<T> {
  key: string;
  data: T | null;
  failed: boolean;
}

/**
 * Run `fn` whenever `key` changes (encode every query input into `key`).
 * When `enabled` is false nothing runs and data is null — used to skip
 * queries that RLS forbids for signed-out visitors.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  key: string,
  enabled: boolean = true,
): AsyncResult<T> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [nonce, setNonce] = useState(0);
  const wanted = `${key}#${nonce}`;
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fnRef.current().then(
      (data) => {
        if (!cancelled) setSettled({ key: wanted, data, failed: false });
      },
      () => {
        if (!cancelled) setSettled({ key: wanted, data: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [wanted, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const current = enabled && settled?.key === wanted ? settled : null;
  return {
    data: current && !current.failed ? current.data : null,
    loading: enabled && current === null,
    failed: current?.failed ?? false,
    reload,
  };
}
