# Performance — budgets, measurement discipline, current numbers

Owner rule (Gate 3): a number in this file is MEASURED and carries its date
and method, or it is labelled ESTIMATE. Update the table when the build
changes materially; the CI gate (below) is what actually enforces it.

## Bundle budgets (CI-enforced)

`scripts/check-bundle-size.mjs` runs in CI right after `npm run build`
(no dependencies — node:fs + node:zlib, gzip level 9). Budgets live in the
script header:

| Budget | Value | Status |
|---|---|---|
| MAIN (entry JS + entry CSS + eager `react` + `supabase` vendor chunks) | ≤ 150 KB gz | **ESTIMATE** target (pwa-F1) — tune after field measurement |
| Any route/lazy chunk | ≤ 30 KB gz | **ESTIMATE** target (pwa-F1) |

Raising a budget requires a written reason in the same commit. Shrinking is
always allowed.

`vite.config.ts` `manualChunks` splits `react`/`react-dom`/`scheduler` and
`@supabase/*` into their own chunks so vendor bytes stay cached across app
deploys (pwa-F14). If those chunk names change, update
`MAIN_CHUNK_PREFIXES` in the size script in the same commit.

## Measured sizes — 2026-08-27, post-integration build (vite 5, gzip -9 via the script)

From `node scripts/check-bundle-size.mjs` on the final integrated tree
(dual-date wiring, typography pass, and the phase-2 adversarial-fix round
included). A number here that doesn't match the current build is a Gate 3
violation — re-run the script and update this table in the same commit as
any size-affecting change.

MAIN total: **144.2 KB gz / 150 KB budget**

| Asset | raw | gzip |
|---|---|---|
| index-*.js (entry/app) | 119.2 KB | 38.1 KB |
| index-*.css | 24.5 KB | 5.5 KB |
| react-*.js | 138.8 KB | 44.4 KB |
| supabase-*.js | 215.3 KB | 56.1 KB |

Largest route chunks: AdminPage 6.6 KB gz, BookingPage ~6.0 KB gz,
PostJobPage ~4.0 KB gz — all far under the 30 KB budget. Full per-chunk
listing: run the script after a build.

Precache total (service worker, all assets): ~724 KiB raw (build output,
same date). Headroom to the MAIN budget is **~5.8 KB gz** — effectively
spent: the next feature landing in the entry chunk WILL trip the CI gate.
Put new screens behind lazy routes; if the gate fires legitimately, raising
the ESTIMATE budget is a deliberate, written decision (see above), never a
reflex.

## Known staleness residual (repo law 6)

`api-read` (catalog NetworkFirst) can serve cached data while ONLINE when
the network is slow (>4 s timeout) or the server errors; `generateSW` gives
the page no served-from-cache signal, so the StaleBanner fires only on real
offline. Bounded by a 1-hour cache ceiling (tightened from 1 day after
adversarial review); the full fix (injectManifest + postMessage → banner) is
PROPOSALS #32. `worker_profiles` was REMOVED from the cache allowlist in the
same review (booked-worker cache-key residue on shared phones + PostgREST
206 responses being uncacheable anyway) — only `service_categories`,
`service_packages`, and public avatars are ever cached.

## Lighthouse — the CI/desk floor is calibrated, not default

The SPEC gate is Performance ≥ 80 on Home, production build (TESTPLAN S6.6).
Run it with MOBILE calibration — a simulated-desktop run overestimates
low-end Android badly (pwa-F16):

- Device preset: **Mobile**
- CPU throttling: **4× slowdown**
- Network throttling: **Slow 4G** (Lighthouse "Slow 4G": 150 ms RTT,
  1.6 Mbps down / 0.75 Mbps up)
- CLI equivalent:
  `lighthouse <url> --preset=perf --form-factor=mobile --throttling-method=simulate --throttling.cpuSlowdownMultiplier=4 --throttling.rttMs=150 --throttling.throughputKbps=1638`

This is the FLOOR, not reality: the target fleet is low-end Android on Addis
mobile data. Any pass here is provisional until the same page is opened on
the owner's real phone on mobile data (the final gate). No field/real-device
numbers have been measured yet — everything from a phone is still
NOT MEASURED.

## What else is already in place

- N1: `<link rel="preconnect">` to the Supabase origin in `index.html`
  (RTT saving on 3G/4G: ESTIMATE until measured on-device).
- N4: service-worker runtime caching for public catalog reads + avatars,
  allowlist-only (`src/lib/swCache.ts` — read its header before touching).
- N17: idle-time prefetch of the Browse chunk from Home, skipped on
  save-data/2G (`src/hooks/useIdlePrefetch.ts`, `src/lib/netQuality.ts`).
