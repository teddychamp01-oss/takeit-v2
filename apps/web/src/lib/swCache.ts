// Service-worker runtime-cache MATCHERS (N4 — offline-tolerant reads).
//
// These functions are passed to workbox `runtimeCaching[].urlPattern` in
// vite.config.ts. workbox-build SERIALIZES them with Function.toString() into
// the generated service worker, so each body MUST be fully self-contained:
// only its arguments and literals — no imports, no module-scope constants,
// no closures. The test file revives each function from its own source
// (`toString()` → eval) and re-runs every assertion on the revived copy, so a
// closure over module scope FAILS the suite instead of silently producing a
// service worker whose matcher throws (the verifier-that-cannot-fail disease,
// Gate 2).
//
// HARD RULE (pwa-F4 / repo AVOID #16): the matchers are ALLOWLIST-style.
// They name the exact public catalog tables and the public avatar bucket —
// nothing else. Never invert them into "everything except rpc/auth/…": a
// cached per-user response (messages, bookings, notifications, profiles
// own-row, any /rest/v1/rpc/* or /auth/* traffic) outlives the session on a
// shared phone. Adding a table here is a security decision, not a perf tweak.

/** Minimal structural type of workbox's RouteMatchCallbackOptions. */
export interface SwMatchInput {
  url: URL;
  request: { method: string };
}

/**
 * GET reads of the PUBLIC catalog only:
 *   /rest/v1/service_categories   (anon-readable catalog)
 *   /rest/v1/service_packages     (anon-readable catalog)
 * The `$`-anchored alternation cannot match /rest/v1/rpc/*, sub-paths, or any
 * other table; the host pin keeps third-party origins out (SPEC project ref —
 * same literal as the N1 preconnect in index.html).
 *
 * worker_profiles was REMOVED from this allowlist after adversarial review:
 * (a) BookingPage's fetchWorkerTrust reads /rest/v1/worker_profiles?user_id=
 *     eq.<booked worker> — matching it here left who-you-booked visible as
 *     cache keys for the cache lifetime on a shared phone;
 * (b) the browse lists use `count: 'exact'` + limit, which PostgREST answers
 *     with 206 Partial Content — the Cache API cannot store 206 responses at
 *     all, so those reads never cached anyway (fails safe, zero benefit).
 * Net effect of removal: no privacy residue, nothing of value lost.
 */
export function isPublicCatalogRead({ url, request }: SwMatchInput): boolean {
  return (
    request.method === 'GET' &&
    url.hostname === 'snfkefcluzkdeztdtdnk.supabase.co' &&
    /^\/rest\/v1\/(service_categories|service_packages)$/.test(url.pathname)
  );
}

/**
 * GET reads of the PUBLIC avatars bucket only
 * (/storage/v1/object/public/avatars/…). Uploads use cache-busted public
 * URLs (auth/profileApi.ts), so CacheFirst never pins a stale avatar.
 * Private buckets (verification docs) live under authenticated/signed paths
 * and never match this prefix.
 */
export function isPublicAvatarRead({ url, request }: SwMatchInput): boolean {
  return (
    request.method === 'GET' &&
    url.hostname === 'snfkefcluzkdeztdtdnk.supabase.co' &&
    url.pathname.startsWith('/storage/v1/object/public/avatars/')
  );
}
