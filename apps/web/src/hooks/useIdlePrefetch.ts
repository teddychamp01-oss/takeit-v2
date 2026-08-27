// N17 — idle-time route-chunk prefetch (hand-rolled quicklink pattern,
// pwa-F12). Runs the loader once, after the mounting page is interactive and
// the main thread is idle, and BAILS entirely on save-data / 2G-class links
// (data is a household cost in Addis). Prefetch failures are swallowed —
// the real navigation will retry with real error handling.

import { useEffect } from 'react';
import { getNetQuality } from '../lib/netQuality';

const IDLE_FALLBACK_MS = 2000;

export function useIdlePrefetch(loader: () => Promise<unknown>): void {
  useEffect(() => {
    if (getNetQuality().constrained) return;

    const run = () => {
      loader().catch(() => {
        // Speculative only — never surface an error for a prefetch.
      });
    };

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run);
      return () => window.cancelIdleCallback(id);
    }
    // Safari/older WebViews: a timeout past first paint approximates idle.
    const id = window.setTimeout(run, IDLE_FALLBACK_MS);
    return () => window.clearTimeout(id);
    // The loader is a static module reference at every call site; re-running
    // on identity change would defeat the once-per-mount intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
