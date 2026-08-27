# Take It v2 — Build Report

**For:** Teddy (founder) · **Date:** 2026-08-27 · **Repo:** `teddychamp01-oss/takeit-v2` @ `fc78fac` · **Backend:** Supabase `snfkefcluzkdeztdtdnk` (Frankfurt, live)

Every number in this report is measured or carries its label. Anything not
verified says so, in §8.

---

## 1. Executive summary

In one running session, Take It v2 went from empty to a **live, verified,
adversarially-tested marketplace**:

- **Live database** — 21 tables, RLS on every one, 40 policies, all state
  changes locked behind 12 SECURITY DEFINER RPCs, seeded with the 8 launch
  categories (real Amharic), 22 service packages, 8 workers, 5 jobs.
- **Full web app** — Amharic-default PWA, every core flow implemented:
  signup → dual-role onboarding → browse → post-job (two-location + diaspora)
  → apply → book → chat (server-side phone masking) → complete → double-blind
  review → rating recompute. Plus verification, guarantors, admin.
- **3 edge functions live** (chapa-webhook, telegram-auth, ID-image retention
  purge), the 4th (Telegram bot) fully written and ready to deploy with your
  bot token.
- **v1 mined and harvested** — the old app's best ideas adopted, the full
  list of what was left behind and why is in §3.
- **Global research fleet** — 6 lanes, 103 findings across Urban Company,
  TaskRabbit/Thumbtack/Care.com, GoodayOn/Afriwork/SweepSouth and the African
  cohort, Gojek/Grab/Asia, trust & safety, and low-end-Android engineering —
  synthesized, gated, and the feasible 16 upgrades **implemented** (§4).
- **Quality bar**: 399/399 tests green (many proven able to fail by
  mutation), typecheck/lint/build clean, CI-enforced bundle budgets
  (main 144.2 KB gz / 150 budget, measured), zero service-role material in
  the client bundle, every adversarial finding fixed and re-verified.

**Agents used:** ~40 worker/checker/researcher agents across 5 orchestrated
fleets, every worker paired with an independent checker (Gate 1b), every
checker's load-bearing claim re-confirmed by the orchestrator.

---

## 2. What was built, wave by wave

### Wave S0 — foundation (earlier today)
Schema + RLS + state-machine RPCs, applied to the live DB and attacked:
anon fully locked out; cross-persona attacks blocked; a **HIGH double-blind
review leak found by the red team and fixed** (unpublished 1-star moved the
public rating 4.70→1.00 — now provably impossible); phone-mask bypass via
`/`/`_` separators fixed; worker GPS + telegram_id exposure closed with
column-level grants; 30-day ID-image retention implemented end-to-end.
Details: `docs/VERIFICATION_LOG.md`, `docs/AUDIT_FINDINGS.md`.

### Wave 1 — the v1 harvest (tonight)
Three miner agents read every line of v1; a synthesizer verified their claims
against v2 and produced the adoption plan; six implementers + integrator +
adversarial checker landed it. **Zero schema changes, zero new dependencies.**

### Wave 2 — the research build (tonight)
Six research lanes → synthesis → 16 upgrades implemented by an infra
foundation agent + 4 tracks + integrator + adversarial checker → all 4
should-fix findings remediated the same night.

---

## 3. The v1 harvest — what we took, what we didn't

### Took (now live in v2)

| From v1 | Where it landed |
|---|---|
| The **warm look** — brand gradient, orange-tinted shadows, pop/slide motion, press feedback | Design tokens + every card/CTA (reduced-motion safe) |
| **Gradient hero Home** with overlapping quick-action cards | HomePage ("Post a Job / Get offers in minutes") |
| **Edge-bleed horizontal rails** | Available Now + Your Workers rails |
| **JobCard hierarchy** (category micro-label, status pill, budget right) | New shared `JobCard`, used everywhere jobs list |
| **Urgency chips** (Today / This week / Flexible) | Post-job date step — mapped onto existing columns, chip and card can never disagree |
| **Booking status stepper** (numbered circles → gradient checks) | BookingPage happy path (purely presentational; RPCs untouched) |
| **Toast feedback** + its microcopy | Hand-rolled system (no library), wired into post/accept/booking/review |
| **Verification ladder** presentation + upload-state styling | VerificationPage (v2's real 5-level enum) |
| **Worker activation card** (verify CTA + profile-completion meter) | MePage + worker feed — completion % **computed from real fields** (v1 hardcoded 40%; that sin was not ported) |
| **Worker stat trio** above the fold | WorkerDetailPage (rating / jobs / verification) |
| **Role-choice microcopy** ("You can switch later from your account") | Onboarding — translated, under dual-role toggles |
| **~20 microcopy lines** (placeholders, empty states, summaries) | i18n am+en — every line translated first, v1 was 100% English |
| **`?category=` deep links**, worker "My applications" list, matchMedia test stub | Post-job prefill; MyJobsPage third tab; vitest setup |

### Didn't take — and exactly why

**Already better in v2:** v1's seed data (v2's is richer + Amharic + PostGIS),
bottom nav (v2 has safe-area insets), sticky CTA bars, admin page, chat (v2
has realtime + server-side masking; v1 had neither), money/status formatters
(v2 does integer cents + i18n), verification tiers 0-3 (v2's 5-level enum
names the mechanism), form-validation-by-toast (v2 validates per-field).

**Contradicts the contract:** the **localStorage data store** (business logic
in the browser is banned — the real backend replaced it), **RoleSelect as a
gate** (the exact GoodayOn single-role weakness C4 kills — only its copy
survived), fake client-side auth with hardcoded OTP `1234`, direct client
status writes, ID images as base64 in localStorage (C2 violation), Google
Fonts links (no third-party hosts on the cold path; neither font had Ethiopic
glyphs anyway), the 1.8s splash timer (hostile on low-end phones), v1's
category set (cooking + beauty are not in the brief-fixed launch 8 — filed as
first post-launch inserts, your call), all English-only copy as-is, loose
tsconfig, a `.gitignore` that didn't ignore `.env`.

**Needs your sign-off (filed in PROPOSALS, not built silently):** structured
review tap-chips (v1's best model idea — needs schema), job completion PIN
(v1 generated it client-side where the counterparty could read it — the
corrected server-side start-code version is Proposal #1), `featured` worker
flag (ranking-integrity question), `trust_score` (pure fiction in v1 — never
computed), emergency contact (PII decision), post-job photos, dark mode.

**Dead weight:** ~45 stock shadcn/radix components v1 itself barely used
(v1's real code touched five of them), the sonner dependency (we hand-rolled
40 lines instead), boilerplate tests and README stubs.

**Security scan of v1: clean.** No keys, no JWTs, no live endpoints — three
flag-only notes (demo OTP, client-side PIN, Lovable-hosted og-images)
recorded so they are never copied.

---

## 4. The research — and what it changed tonight

Six lanes, every claim tagged (verified / ESTIMATE / not-verified), two lane
claims **falsified by checking v2's actual RLS** before they could mislead.
Full detail: `docs/PROPOSALS.md` + the research plan in the session archive.

### Shipped tonight (highlights)

- **The rebook loop** (TaskRabbit/UC/FilKhedma: repeat rate predicts
  survival): "Book again" at completion, save-worker nudge at the
  peak-satisfaction moment, "Your workers" rail on Home. Rebooking easier
  than a saved phone number is the *positive* answer to disintermediation.
- **Packages became bookable** (Urban Company's core trust move): "Book this
  package" → prefilled job with the checklist as the scope contract and the
  line "Only what's listed is included — anything else is a new booking"
  (the SweepSouth unbounded-scope harm, answered in one sentence).
- **Offline-tolerant reads** for Addis data reality: allowlist-only service-
  worker caching (categories, packages, avatars — *nothing per-user, ever*),
  matchers unit-tested **including a revived-from-serialization pass** so the
  shipped SW can't silently diverge from the tested code.
- **Trust made legible**: the verified badge opens a "what we checked" sheet
  (says what was *and wasn't* checked — the Airbnb badge-dilution mistake,
  avoided); "All reviews are from completed bookings and cannot be edited or
  deleted" now *told* to users; the booking screen shows the full worker
  trust card with "Check this is who arrives" (the zero-tech, privacy-safe
  version of UC's face-match).
- **Worker-side trust**: "Applying is free — Take It earns only when you do"
  (the #1 recruiting weapon vs every incumbent), a fixed anti-scam line in
  the feed, benefit-framed (not policing) phone-number warnings.
- **Accept lands in chat** (TaskRabbit "Confirm & Chat") with a prefilled
  opener — visibly from you, no fake system messages.
- **Safety screen + booking shield** (Care.com honesty + Uber placement):
  meet-first advice that admits verification's limits, one tap from any
  active job. Unverified emergency numbers deliberately **not** shipped.
- **Ethiopian dual-calendar dates** (የካቲት first, Gregorian in parentheses,
  am locale) — with a runtime check that refuses to mislabel dates if a
  device lacks the Ethiopic calendar.
- **Google-engineer plumbing**: preconnect, dimension-matched skeletons,
  vendor chunk splitting, **CI-enforced bundle budgets** (hand-rolled, no
  deps: main 144.2/150 KB gz measured, headroom ~5.8 KB — the gate will
  catch the next bloat), idle prefetch that bails on data-saver, haptic
  ticks, install prompt at the right moment, Amharic typography floor with
  locale-gated uppercase (fidel is never letter-spaced).

### Filed for your decision (16 proposals — top five)

1. **Start-code at job start** (UC/inDrive OTP) — the highest-value schema ask.
2. **Guarantor visibility for customers** ("Vouched by an idir") — the
   culturally-native differentiator; needs a privacy-safe summary RPC.
3. **Take It Guarantee** productization — needs your cap + policy first;
   copy is ready to ship the same day you set it.
4. **Structured review tap-chips** in Amharic — signal quality for
   low-literacy users.
5. **Completion photo proof** — framed as the *worker's* protection.

### Never copy (17 anti-patterns, recorded in PROPOSALS)

Lead-gen economics, phone numbers at discovery, automatic worker fines (the
FTC fined Handy $2.95M), drip pricing, "earn up to X" claims, faceless
assignment, inflated guarantees, splash timers, radius-as-filter, points
ledgers, bot-only support, SMS-only auth, selling safety, raw biometrics,
frontend bloat, category sprawl.

---

## 5. Verified quality evidence

| Check | Result |
|---|---|
| Unit/integration tests | **399/399** across 21 files (Gate 2: new suites proven able to fail by mutation, then restored) |
| Typecheck / lint / build | clean / clean / clean |
| Bundle budget (CI-enforced) | main **144.2 KB gz** / 150 budget; every route chunk < 7 KB gz vs 30 budget (measured) |
| Service-role / JWT in client bundle | **0 / 0** (grep of built dist) |
| SW cache allowlist | categories + packages + public avatars only; `worker_profiles` **removed** after adversarial review; matchers verified in the *built* sw.js |
| Live DB attack matrix | anon: denied at grant level; cross-persona: all blocked; state machine: RPC-only, outsider start blocked; double-blind: proven leak-free after fix |
| Adversarial checker rounds | 3 rounds (S0, harvest, phase-2): **0 blockers survived**; every should-fix remediated same-session |
| Deps added tonight | **0** · Schema changes tonight: **0** |

---

## 6. Where to see it

- **Code:** https://github.com/teddychamp01-oss/takeit-v2 (6 commits, clean history)
- **Lovable preview** (design rendition, demo data): https://id-preview--106adbf1-b7ef-41e7-a93f-76490bccccc4.lovable.app · editor: https://lovable.dev/projects/106adbf1-b7ef-41e7-a93f-76490bccccc4
- **The real app, live URL in ~2 min:** import the repo in Vercel/Netlify —
  root `apps/web`, build `npm run build`, output `dist`, env
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (publishable key only).
- **Local:** `npm install && npm run dev -w apps/web` with the same two env values.

Note: the Lovable preview predates tonight's two waves — the *real* app (repo)
is now substantially ahead of it. Judge design direction on Lovable; judge
the product on the repo build.

## 7. Only you can do these (full list: docs/BLOCKERS.md)

1. **@BotFather token** → deploy `telegram-webhook` (one command, in BLOCKERS
   #3) → Telegram-primary auth goes live.
2. **Support Telegram handle** → set `VITE_SUPPORT_TELEGRAM_URL` ("Talk to
   Take It" is wired, waiting for the URL).
3. Chapa merchant + written hold-then-release confirmation; NBE written scope
   confirmation (the one legal risk worth de-risking before Phase-2 money).
4. Fayda eKYC-Partner application; Africa's Talking; ECA/DPO; MInT; TIN.
5. Enable leaked-password protection (one dashboard toggle) + schedule the
   retention purge cron (BLOCKERS #12).
6. **Your phone is the final gate**: TESTPLAN S8 lists the device checks
   (Ethiopic date glyphs, offline banner, install prompt, haptics — and the
   Amharic native-speaker read-through of all agent-written copy).

## 8. Not verified — said plainly

Nothing tonight was run on a real phone or in a real browser (the sandbox has
no display and Supabase/Lovable are egress-blocked from it): visual rendering,
realtime chat delivery, the service worker on-device, Lighthouse scores, and
Intl Ethiopic-calendar glyphs are asserted from code, tests, and built
artifacts only. All Amharic strings are agent translations pending native
review (TESTPLAN S8.5). Bundle budgets are enforced but the *targets* remain
ESTIMATES until field measurement. Research claims carry their lane tags —
nothing was upgraded from "reported" to "fact" on the way into this report.
