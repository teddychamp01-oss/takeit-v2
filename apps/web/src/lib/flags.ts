// Client-side feature flags. Every flag defaults to FALSE — absent env,
// empty string, or anything other than 'true'/'1' means OFF (SPEC: payments
// and Fayda ship dark).

function readFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export const flags = {
  paymentsEnabled: readFlag(import.meta.env.VITE_FEATURE_PAYMENTS_ENABLED),
  faydaEnabled: readFlag(import.meta.env.VITE_FEATURE_FAYDA_ENABLED),
} as const;

export type FeatureFlag = keyof typeof flags;

/**
 * N12 — "Talk to Take It" support entry. Accepts ONLY an https URL (a
 * `https://t.me/...` handle in practice); anything else — unset, blank,
 * http, a bare handle, a javascript: URL — resolves to null and the
 * SupportLink renders nothing. Exported for unit tests (the guard must be
 * demonstrable failing — Gate 2).
 */
export function normalizeSupportUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** The configured support URL, or null when absent/invalid (graceful). */
export const supportTelegramUrl = normalizeSupportUrl(
  import.meta.env.VITE_SUPPORT_TELEGRAM_URL,
);
