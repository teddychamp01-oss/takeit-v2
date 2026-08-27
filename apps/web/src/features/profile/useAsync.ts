// Minimal async-fetch hook for the profile feature (no query library —
// every KB counts on low-end Android, C6). Same pattern the other features
// use: each feature keeps its own copy so features stay decoupled.
// Loading, error and empty states are all representable, a stale response can
// never overwrite a newer one, and `loading` is computed against the
// CURRENTLY wanted key — so flipping `enabled` or changing `key` never
// flashes a stale empty/error state for a frame before the effect runs.

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
 * queries that need a signed-in user or a loaded parent row.
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
