// N17 — one short haptic tick for feedback moments (pwa-F11). Wired in
// EXACTLY ONE place: the Toast show() path — every toast (booking confirmed,
// job posted, message sent…) already marks a feedback moment, so the tick
// rides along instead of being sprinkled per call site.
//
// Feature-detected (navigator.vibrate is Chromium-on-Android — the target
// fleet); skipped under prefers-reduced-motion; never throws.

export function hapticTick(durationMs = 15): void {
  try {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.vibrate !== 'function'
    ) {
      return;
    }
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    navigator.vibrate(durationMs);
  } catch {
    // A failed vibration must never break UI flow.
  }
}
