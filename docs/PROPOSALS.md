# Take It v2 — Proposals (out-of-MVP ideas, decision pending)

Per R3 (no silent scope): anything an agent or the research report suggests
that is NOT in `docs/SPEC.md` MVP scope lands here as a proposal, never in
code. Each entry: **Proposal / Rationale / Decision** — decisions belong to
the founder; agents may add entries and evidence but never flip a decision.

Template:

```
## <short name>
- Status: PROPOSED | ACCEPTED (→ move into SPEC) | REJECTED | DEFERRED
- Proposal: what would be built/changed, concretely.
- Rationale: why, with sources; label unmeasured numbers ESTIMATE.
- Cost/risk: what it takes, what could go wrong.
- Decision: pending — founder.
```

All entries below are honestly flagged: **from the Aug 2026 research report,
none validated by our own data yet** (we have no production usage data — the
product has not launched).

---

## 1. Telegram Mini App with in-chat Chapa payments
- Status: PROPOSED
- Proposal: package the PWA (or a slim booking flow) as a Telegram Mini App;
  take payment inside Telegram using Chapa, which the research report states
  is Telegram's exclusive payment provider in Africa.
- Rationale: Telegram is the dominant messenger in Addis; auth is already
  Telegram-primary, so the Mini App collapses install friction to zero.
  Report claim, not measured by us.
- Cost/risk: second client surface to keep in sync with the web PWA; Mini App
  review constraints; payments still gated on the Chapa hold-then-release
  confirmation (BLOCKERS #5) and `FEATURE_PAYMENTS_ENABLED`. C1 applies
  unchanged inside Telegram.
- Decision: pending — founder.

## 2. Telebirr mini-app listing (later)
- Status: PROPOSED
- Proposal: list Take It inside the Telebirr super-app once traction exists.
- Rationale: Telebirr's install base is the largest payment audience in
  Ethiopia (report claim; ESTIMATE — no first-party numbers held).
- Cost/risk: Ethio Telecom partnership process is slow and relationship-heavy;
  a second mini-app runtime; do not confuse listing with M-Pesa-style bets the
  SPEC explicitly avoids.
- Decision: pending — founder.

## 3. Mesirat GPM participation
- Status: PROPOSED
- Proposal: register Take It with the Mesirat gig-platform/marketplace
  initiative (government-linked gig-economy program) for visibility, worker
  pipeline, and standing with regulators.
- Rationale: report suggests early participants get policy access and worker
  onboarding channels. Unverified by us; conditions unknown.
- Cost/risk: reporting obligations, possible data-sharing asks — anything
  touching worker PII must pass compliance.md first.
- Decision: pending — founder.

## 4. Kit / supplies program
- Status: PROPOSED
- Proposal: standard kits for workers (cleaning supplies, tutor materials,
  branded vest/ID lanyard), sold at cost or lent against completed jobs.
- Rationale: Urban Company's playbook — standardized inputs raise service
  consistency and the badge is a real-world trust signal.
- Cost/risk: inventory + capital + logistics = a physical-ops business
  bolted onto a software MVP; any lend-against-earnings scheme must be
  reviewed so it never becomes a worker debt ledger that smells like a
  balance (C1-adjacent).
- Decision: pending — founder.

## 5. Instant booking — "Book Now"
- Status: PROPOSED
- Proposal: skip post-job/apply/accept for standardized `service_packages`:
  customer picks a package + `available_now` worker and a booking is created
  directly (new RPC; state machine unchanged from `confirmed` onward).
- Rationale: the marketplace loop today is post → apply → accept — three
  round-trips; for commodity jobs (standard clean) instant booking is the
  known conversion winner (industry pattern; no own data).
- Cost/risk: no-show risk moves to the platform's reputation; needs real
  availability discipline from workers; pricing must come from the package to
  avoid haggling-by-chat.
- Decision: pending — founder.

## 6. "Take It Guarantee" productization *(merged: "Happiness Pledge" + research P3)*
- Status: PROPOSED
- Proposal: turn the existing `guarantee_claims` table into a NAMED, capped,
  honest promise attached to booking-through-the-app ("if it's not right, we
  send someone to fix it / refund up to X"), with public terms, claim UI, and
  an ops SLA. Once the founder sets the ETB cap + policy, three copy
  placements (booking confirm, badge sheet, an upgrade of the N6 chat
  warning) are a same-day UI change.
- Rationale: trust is the product; a visible guarantee is the strongest
  trust signal a managed marketplace can make, and the industry's most
  tasteful anti-disintermediation lever (research trust-F5; us-A3
  TaskRabbit Happiness-Pledge framing: automatic, capped, plain exclusions
  on one screen). Schema already exists.
- Cost/risk: real money paid out of Take It's own revenue — payouts must
  route via the provider (C1: it is Take It's expense, never user funds
  held); requires claim-abuse rules and a funded reserve. Terms need counsel
  review before anything is promised publicly. Anti-pattern to avoid
  (trust-F5b): a big headline cap with narrow fine print — the TaskRabbit
  backlash case; NO guarantee copy or brand name ships before the policy
  exists (this blocks part of implement-now item N6 copy too).
- Decision: pending — founder.

## 7. Worker training academy
- Status: PROPOSED
- Proposal: structured onboarding/training (in-person or video-light, C6:
  no video in-app — so off-app delivery), completion feeding
  `badge_level`/`pro_certified`.
- Rationale: raises floor quality and supplies the `pro_certified` rung that
  the schema already models; may intersect with the competency-certificate
  legal question (BLOCKERS #12.3) — training could become the compliance
  answer for some categories.
- Cost/risk: content production + physical space + staff time; certification
  claims must not overstate legal standing until the counsel opinion lands.
- Decision: pending — founder.

---

The entries below (8–17) were filed 2026-08-27 from the **v1 → v2 adoption
plan (T12)**. They are every v1 idea the plan deliberately did NOT take —
deferred here per R3 so nothing is lost or silently added. Source references
are to the archived v1 tree (`take-it-local-gigs-main`); none of that code is
reused (SPEC: "v1 is dead").

## 8. Structured review tap-chips *(merged: v1 "structured review questions" + research P4)*
- Status: PROPOSED
- Proposal: 1–5 stars plus 6–8 tappable Amharic chips per category ("በሰዓቱ
  መጣ", "ንጹህ ሥራ" — on time, clean work), optionally alongside v1's
  yes/partial/no questions (customer→worker: "Arrived on time?", "Completed
  the work?"; worker→customer: "Clear communication?", "Job description
  accurate?", "Would you work with them again?"). Stored as
  `reviews.tags`/`attributes jsonb`, submitted through the review RPC; chip
  counts feed profile highlights ("Mentioned 12×: on time").
- Rationale: structured answers are comparable across reviews, harder to
  game than stars alone, and critical for low-literacy signal quality
  (research trust-F2 — Airbnb-style pattern, NOT VERIFIED against live
  Airbnb screens; also the best model idea in v1 — its chip-row answer UI,
  v1 `ReviewPage.tsx:94–109`, is a ready presentation pattern).
- Cost/risk: **needs a schema change** (`reviews.tags`/`attributes jsonb`,
  fix-forward numbered migration per R4) plus a review-RPC signature change —
  both need founder sign-off — plus a chip taxonomy per category. Chip and
  question wording must ship am-first through i18n with native-speaker
  review.
- Decision: pending — founder.

## 9. Start-code at job start *(P1 — supersedes/merges the v1 "job completion PIN")*
- Status: PROPOSED
- Proposal: a customer-held 4-digit start code shown at `confirmed`;
  `rpc_start_booking` requires it for `confirmed → started`. The corrected,
  START-side version of the v1 completion-PIN idea (one proposal, not two).
- Rationale: proves right-person-at-door, gives an honest `started_at`, and
  is an anti-disintermediation ratchet — off-app jobs have no code. The
  single highest-value schema ask in two research lanes (trust-F3, uc-C6,
  asia-#10); also the cheap real-world handshake against "marked done but
  never showed up" disputes that motivated the v1 idea.
- Cost/risk: **server-side only, or it is worthless.** v1 generated its PIN
  client-side with `Math.random()` and stored it readable by the counterparty
  (v1 `store.ts:236`) — it verified nothing. If adopted: a `start_code`
  column generated with `gen_random_bytes` inside the booking RPC (never
  client random), an `rpc_start_booking` signature change, and RLS care so
  ONLY the customer can read the code (a naive column on `bookings` is
  readable by both sides and defeats the purpose). Changes the booking state
  machine for every booking → Gate 1 red-team before merge. Note: SPEC line
  ~148 "pin ACLs" means pinning *function ACLs* by `regprocedure` —
  unrelated; v2 has no start code or PIN today (verified).
- Decision: pending — founder.

## 10. Featured-worker flag
- Status: PROPOSED
- Proposal: a `featured` boolean on worker profiles, an admin toggle, and a
  "Featured Workers" rail on Home (v1 had all three).
- Rationale: editorial curation of the marketplace's front door.
- Cost/risk: no column in v2, and a real ranking-integrity question: a flag
  an admin flips is a placement decision that is invisible to users and
  gameable internally, while `badge_level` ('new'…'top') already provides an
  *earned* curated tier. The Home rail ranks by badge_level + rating today;
  a featured flag would silently override earned trust.
- Decision: pending — founder.

## 11. Emergency contact on verification
- Status: PROPOSED
- Proposal: collect an emergency-contact name + phone during worker
  verification (v1 had the field).
- Rationale: not vouching (guarantors already cover that) — it is a safety
  contact, with real value for babysitting-care jobs where a worker is alone
  in a stranger's home.
- Cost/risk: **PII under C2 / Proc. 1321/2024** — needs masked storage, a
  retention rule, and a `docs/compliance.md` data-map entry BEFORE the column
  exists. Also a schema change (founder sign-off).
- Decision: pending — founder.

## 12. Post-job photo upload
- Status: PROPOSED
- Proposal: let customers attach photos to a job post ("here is the broken
  door").
- Rationale: photos remove ambiguity for repair/cleaning quotes.
- Cost/risk: not in the v2 jobs schema (no column, no bucket) — schema +
  storage + retention + compliance work. v1's approach (base64 data-URIs held
  in client state) is also a C6 hazard on low-end devices and is not a
  pattern to copy.
- Decision: pending — founder.

## 13. completion_rate stat
- Status: PROPOSED
- Proposal: show a completion-rate percentage on worker profiles.
- Rationale: a strong trust signal — when it is real. v1 hardcoded it in seed
  data (the exact unmeasured-number sin; Gate-3 class violation) — never that.
- Cost/risk: derive at read time as
  `customer_confirmed bookings / non-cancelled bookings` — no stored %, no
  schema change, just a query/view when wanted. Needs a floor on sample size
  (a 1-of-1 worker showing "100%" misleads) — threshold to be decided, not
  guessed.
- Decision: pending — founder.

## 14. Cooking + beauty categories (first post-launch inserts)
- Status: PROPOSED
- Proposal: add `cooking-home-chef` and `beauty-lifestyle` as
  `service_categories` rows after launch (v1 shipped both; the v2 launch 8 is
  brief-fixed and traded them for babysitting-care + diaspora-property).
- Rationale: pure data inserts — no code, no migration of structure; category
  demand claim is from v1's choices only (ESTIMATE — no market data held).
- Cost/risk: each category needs am+en names, an icon, and a
  `min_verification_level` decision; beauty may touch the
  competency-certificate legal question (BLOCKERS #12.3).
- Decision: pending — founder.

## 15. Dev-only seeded-persona login helper
- Status: PROPOSED
- Proposal: a development-flag-gated helper to sign in as the seeded personas
  (customer / worker / both) for the 3-persona RLS acceptance gate — the
  useful *intent* behind v1's fake `loginAs`.
- Rationale: exercising RLS as three real users is manual and slow today.
- Cost/risk: must create **real Supabase sessions** (server-side tooling or
  magic-link automation), never v1's client-side role switch; must be
  compiled out of production builds; service-role key stays server-side (R5).
  New tooling, not a v1 port.
- Decision: pending — founder.

## 16. Dark mode
- Status: PROPOSED
- Proposal: a dark palette for the PWA.
- Rationale: v2 has none and the SPEC does not ask for one; v1's `.dark`
  token values are a starting point for the palette if ever wanted.
- Cost/risk: full design-token audit (cream/ink/primary + every status
  color) with contrast re-checks; ongoing 2× QA surface for every screen.
- Decision: pending — founder.

## 17. SMS-OTP sign-in microcopy (filed copy — not a new proposal)
- Status: DEFERRED (the SMS-OTP flow itself is already planned and gated on
  the SMS-provider item in docs/BLOCKERS.md; nothing here is to be built now)
- Proposal: none — this entry only FILES the v1 microcopy and input styling
  worth reusing when that gated build starts, so it is not re-invented.
- Rationale: v1's OTP screen (v1 `Auth.tsx`) had good microcopy and a good
  big-code input. v1's *auth itself* (hardcoded OTP "1234", client-side
  `loginAs`) is banned and none of it is reused.
- Cost/risk: none now. When built: strings go through i18n am-first (the am
  lines below are proposed translations to review with a native speaker, not
  shipped copy), and the code length (v1 used 4 digits; providers commonly
  issue 6) follows the provider — decide then.
- Decision: n/a — copy inventory for the gated build.

<!-- SMS-OTP microcopy pack (from v1 Auth.tsx; translate-first per C5):
  auth.otpSentTo        am: 'ኮዱን ወደ {phone} ልከናል።'
                        en: 'We sent it to {phone}.'
  auth.otpChangeNumber  am: 'ቁጥሩን ይቀይሩ'
                        en: 'Change number'
  auth.legalLine        am: 'ሲቀጥሉ የአገልግሎት ውሎቻችንን እና የግላዊነት ፖሊሲያችንን ይቀበላሉ።'
                        en: 'By continuing you agree to our Terms & Privacy.'
  Big-code input (one field, not per-digit boxes):
    className="h-14 rounded-2xl text-center text-2xl tracking-[0.6em] font-bold"
    inputMode="numeric" autoComplete="one-time-code" maxLength={code length}
  Never reuse from v1: demo OTP "1234", client-side loginAs/role routing.
-->

---

The entries below were filed 2026-08-27 from the **six-lane research
synthesis** (research_upgrade_plan.md, PART 2). Reconciliation with earlier
entries — no duplicates kept: research **P1** merged into entry 9
(start-code), **P3** into entry 6 (guarantee), **P4** into entry 8
(structured review chips); **P16**'s Telebirr line cross-references entry 2.
Per-claim evidence tags (ESTIMATE / NOT VERIFIED) are preserved from the
lanes, not upgraded.

## 18. Guarantor visibility for customers (P2)
- Status: PROPOSED
- Proposal: show customers a guarantor chip on worker profiles ("Vouched by
  an idir") via a SECURITY DEFINER summary RPC (or policy) exposing ONLY
  guarantor_type + verified-count — never names, contacts, or statements
  (C2).
- Rationale: the culturally-legible differentiator — it digitizes the
  existing ዋስ/was surety ritual (africa-G.5, trust-F15).
- Cost/risk: **[verified in v2]** this is NOT ui-only, contrary to two lane
  reports: `guarantors_select` RLS
  (supabase/migrations/20260827000500_rls.sql:216-222) is owner+ops only, so
  a customer's guarantor count is always zero today. Needs an RLS/function
  change with founder sign-off; Gate 1 red-team + Gate 2 (prove the RPC
  leaks nothing beyond type+count); ACL pinned per the DDL checklist.
- Decision: pending — founder.

## 19. Completion photo proof (P5)
- Status: PROPOSED
- Proposal: 1–3 compressed photos at `worker_done`, framed as the WORKER's
  protection ("the photo is your evidence"), auto-attached to disputes.
- Rationale: trust-F4; TaskRabbit requires photo proof for IKEA assembly.
- Cost/risk: storage path/column + RPC gate + a retention policy (C2:
  decide a deletion window like the 30-day ID rule).
- Decision: pending — founder (storage/retention).

## 20. `cancelled_by` attribution + chronic-canceller ops view (P6)
- Status: PROPOSED
- Proposal: one column attributing each cancellation to a side, plus an ops
  surface for chronic cancellers.
- Rationale: UC's last-minute-cancellation plague is measurable only if
  cancellations are attributed per side (uc-F15; the Rs 100 fee figure there
  is a single-complaint ESTIMATE — monetary fees are post-Chapa anyway).
- Cost/risk: schema change (founder). Policy stays human-review — never
  auto-penalty (us-C1, the FTC/Handy case; AVOID list #3).
- Decision: pending — founder.

## 21. Dispute offer/counter with a 72h timer (P7)
- Status: PROPOSED
- Proposal: party-to-party ask (refund %, redo, partial) → 72h to
  accept/counter → "Involve Take It" hands to ops with chat + photos as
  evidence.
- Rationale: platform intervention should feel like an escalation of
  fairness (trust-F12; Airbnb Resolution Center shape).
- Cost/risk: offer/counter fields + timers on disputes; Phase-1 resolution
  is mediated agreement (no held money, C1). A minimal free-text-ask + 72h +
  ops-decision v1 is close to buildable now but still touches the disputes
  RPC.
- Decision: pending — founder (flow).

## 22. Share-this-job with a trusted contact (P8)
- Status: PROPOSED
- Proposal: Telegram share of a read-only status page (worker first name,
  photo, verification, state timeline — no live GPS at MVP).
- Rationale: matters most for the worker entering a stranger's home, and
  quietly markets Take It in family group chats (trust-F10).
- Cost/risk: a tokenized public read route is an RLS-principles exception —
  unguessable-token design needs founder sign-off and a Gate 1 red-team on
  the route.
- Decision: pending — founder.

## 23. Badge criteria: relative, revocable, published (P9)
- Status: PROPOSED
- Proposal: `badge_level` earned by percentile-within-category + clean
  record, recomputed on a schedule (pg_cron), with a public "How badges
  work" explainer.
- Rationale: us-A2 — TaskRabbit Elite = top 35% + ≥98% + zero violations,
  periodically re-evaluated.
- Cost/risk: the explainer cannot ship before criteria exist (publishing
  invented criteria = Gate 3 sin); recompute job + criteria definition are
  founder decisions. Every badge change must be visible to the worker with a
  reason (AVOID #4).
- Decision: pending — founder (defines criteria; then explainer + cron land
  together).

## 24. Telegram channel broadcast + deep-link apply loop (P10)
- Status: PROPOSED
- Proposal: broadcast open jobs (and Available-Now workers) to a Take It
  channel with an inline "Apply on Take It" button deep-linking
  `t.me/bot?start=job_<id>`; per-side /start payloads (one bot, two
  onboarding paths — keeps C4).
- Rationale: the distribution engine that verifiably works in Ethiopia —
  Afriwork's 165K-subscriber channel (africa-B.1/B.2); the bot IS the
  notification channel (asia-F#21).
- Cost/risk: bot feature scope beyond the web MVP crew; no schema.
- Decision: pending — founder (channel strategy + bot workload priority).

## 25. Response-time stat + per-category job counts on worker cards (P11)
- Status: PROPOSED
- Proposal: "Usually responds in X" and category-scoped counts ("42 cleaning
  jobs") on worker cards.
- Rationale: us-B3 (the "78% pick the first responder" figure is
  ESTIMATE/blog-sourced); us-A1 — category-scoped counts are the strongest
  trust element on TaskRabbit cards.
- Cost/risk: both need computed columns/views over messages/bookings —
  schema sign-off.
- Decision: pending — founder.

## 26. Post-a-job estimator for home-cleaning (P12)
- Status: PROPOSED
- Proposal: rooms/bathrooms → suggested duration + budget band derived from
  package base prices, outputs labelled ESTIMATE.
- Rationale: africa-C.2 — SweepSouth's quote-from-inputs pattern.
- Cost/risk: new wizard scope; do only after the packages-as-bookable work
  (N3) proves package-first booking; suggested budgets anchor negotiations —
  founder must accept that.
- Decision: pending — founder.

## 27. Worker earnings surface (P13)
- Status: PROPOSED
- Proposal: per-booking agreed/commission/net + a monthly "jobs + ETB
  logged" tile; later, honest aggregate earnings published as recruiting
  content.
- Rationale: uc-D12 (UC publishes its earnings index as trust marketing);
  africa-C.3 (SweepSouth publishes its split — earnings transparency is
  worker-side retention).
- Cost/risk: commission % display requires the founder's commission policy
  to exist; Phase-1 logged data is sparse and the tile must say "logged"
  (Gate 3). Never "earn up to X" claims (AVOID #6).
- Decision: pending — founder (commission policy + what to show).

## 28. Stalled-job check-in (P14)
- Status: PROPOSED
- Proposal: pg_cron — a booking `started` for >2× package duration with no
  `worker_done` → bot nudge to both parties: "all fine / need help".
- Rationale: trust-F16 — the Uber Ride Check analog.
- Cost/risk: MVP durations are estimates; needs cron + bot flow; nudge
  policy is a founder call.
- Decision: pending — founder.

## 29. Field performance telemetry (P15)
- Status: PROPOSED
- Proposal: `web-vitals` (~2KB) reporting LCP/INP/CLS from real Bole phones
  into a Supabase table pre-launch.
- Rationale: pwa-F16 — every current perf number is lab-only (see
  docs/PERFORMANCE.md); budgets stay ESTIMATE until field data exists.
- Cost/risk: the persistence table is schema (founder sign-off + retention
  decision); a console-only dev mode could ride along with the bundle work
  at any time.
- Decision: pending — founder (table + retention).

## 30. Strategic bench (P16 — each researched, none MVP)
- Status: PROPOSED (bench — revisit post-launch)
- Proposal/rationale, one line each:
  - Curated "Pro" shelf / Etalem-style premium tier (africa-A.3) and
    UC-Plus-style membership — only after users average 3+ services
    (asia-#14; retention figures ESTIMATE).
  - Tipping log at completion (africa-C.5).
  - TIN/E-Trade cross-check for business accounts (africa-B.4, Hahu Jobs
    pattern; `tin` column exists).
  - `pro_certified` trade-test ops program (africa-D.3).
  - Guarantor re-attestation as the local annual-recheck analog (us-D1).
  - Recurring bookings (us-A6).
  - Rolling rating window — design the recompute trigger so last-N is a
    one-line change (trust-F13; Bolt's "40 rides" is single-source).
  - Kavach-grade SOS (asia-#7).
  - `jobs.package_id` linkage (follows from packages-as-bookable, N3).
  - Self-hosted Ethiopic woff2 ONLY if the owner sees bad rendering
    (pwa-F8 — system Noto Sans Ethiopic is AOSP-verified at 400–700).
  - Telebirr mini-app distribution (africa-G.2) — see entry 2.
  - Fasting/holiday date-picker hints (asia-#17).
  - Retaliation-review removal ops policy (trust-F8).
  - Worker-fintech (ShegaMuya pattern, africa-F) — C1-adjacent, legal
    review FIRST.
- Cost/risk: each needs its own proposal before any build; filed here so
  nothing is re-researched from scratch.
- Decision: pending — founder, post-launch.

---

# What the research says never to copy (AVOID — 17 anti-patterns)

Filed 2026-08-27 from the same synthesis. These are the documented failure
modes of the platforms studied; an agent proposing any of them must cite why
the research below no longer applies.

1. **Lead-gen mechanics in any form** — pay-per-lead, selling one lead to
   3–4 pros, charging workers to apply/see jobs, paid "credits" for skill
   tests (us-B1: Thumbtack pros paying for silence; uc-D10: pay-to-work
   drove UC's partner protests). Commission on completed confirmed work
   only.
2. **Handing out phone numbers at discovery** — GoodayOn's
   discover→call→negotiate model monetizes nothing and controls nothing
   (africa-A); the GoLife post-mortems make disintermediation the
   existential risk (asia-A). Never weaken C3 to "make contact easier."
3. **Automatic financial penalties on workers** — the FTC made Handy pay
   $2.95M for exactly this (us-C1); SweepSouth's worst harm was a worker
   blocked for refusing free overtime (africa-C). Human ops review +
   audit_log always; an unjust auto-fine also poisons the guarantor
   network.
4. **Opaque penalties/demotions** — every rating gate or badge change
   visible to the worker with a reason (uc-D8/BehanBox; asia-#13: the
   difference between UC's strikes and a defensible trust story).
5. **Drip pricing** — no fee lines appearing between browse and confirm; no
   surge; the package-card number IS the confirm number (us-A4 TaskRabbit
   fee lawsuit; uc-A2: hidden charges are UC's #1 complaint cluster).
6. **"Earn up to X" recruiting claims** — core of the FTC complaint
   (us-C2); show worker-set ranges + exact commission instead.
7. **Faceless/late assignment and forced dispatch** — never "we're
   assigning someone" (uc-B4 — the named-worker booking is the structural
   advantage); never auto-assign jobs against worker choice (uc-D11).
8. **Inflated guarantee headlines** — a big cap with narrow fine print
   erodes trust worse than a small honest one (trust-F5b, TaskRabbit
   TikTok backlash).
9. **Artificial delays and interstitials** — no splash timers (v1 skip
   list), no upsell pages inside the booking flow, keep ≤4 steps (uc-B3);
   no arrival-time SLA promises — UC's own InstaHelp loses Rs 346/order
   chasing them (uc-G18, asia-B).
10. **Radius-as-filter / alphabetical geography** — proximity is a bias,
    never a filter (repo law; GoodayOn's 3km-radius model is the
    counter-example, africa-A; CategoryPage already does this right —
    verified in v2 — don't regress it).
11. **Points/tiers/XP loyalty ledgers** — Gojek killed GoClub, Grab killed
    tiers; instant discounts + one-tap rebook + habit are what survived
    (asia-H); a points ledger also skirts C1 stored-value territory.
12. **Bot-only support** — "unresponsive AI chatbots" is UC's most-damned
    trait (uc-E14). A human on Telegram, always reachable.
13. **SMS OTP as the sole auth gate** — the incumbent's #1 registration
    complaint in Addis is OTP delivery failure (africa-A);
    Telegram-primary stays visually dominant, SMS strictly fallback.
14. **Selling safety** — no paid verification tiers for workers, no upsold
    background checks to customers (implies the default is unsafe), and
    never grant the green check below id_verified (trust-F14/F7 — Airbnb's
    badge dilution is the documented mistake).
15. **Automated face-match / raw biometrics** — C2 + Proc. 1321/2024; the
    human photo-confirm (booking-screen trust card, N7) is the MVP
    version (trust-F11).
16. **Frontend weight** — no animation/skeleton libraries, no
    speculation-rules prerender, no third-party webfont host for Amharic
    (system Ethiopic is AOSP-verified), no eager full-app prefetch, and
    NEVER cache per-user/PII responses in the service worker (pwa-F15,
    pwa-F4 caution; enforced by the allowlist matchers in
    `apps/web/src/lib/swCache.ts`).
17. **Category sprawl and open bidding** — Lynk's 70+ bid categories =
    variance + decision fatigue (africa-D); expect 1–2 hero categories to
    carry volume and weight the UI accordingly rather than adding breadth
    (asia-A); no subscription bundles at MVP (Eden Life pivot, africa-F).

---

## Post-audit follow-ups (phase-2 adversarial review, 2026-08-27)

31. **Directed rebooking ("Book again" → same worker).** The rebook loop's
    `?worker=` deep-link param is currently informational: `rpc_post_job` has
    no directed-worker argument, so "Book again" prefills the category and the
    job stays open to all matching workers. A true rebook needs either a
    directed-job flag + RPC change or an "invite worker to job" notification
    path. *Sign-off:* founder on the matching model change. Until then the
    button's value is real (fast repost + the saved-worker loop) but not
    worker-pinned.
32. **Served-from-cache signal (repo law 6 residual).** `generateSW` cannot
    tell the page when NetworkFirst served day-old cache while ONLINE (slow
    network / server error) — the offline banner only fires on real offline.
    Mitigated now by a 1-hour cache ceiling on `api-read`. Full fix: switch
    vite-plugin-pwa to `injectManifest` and emit a `postMessage` from a custom
    handler when a cached response is served, driving the StaleBanner. Small,
    contained, worth doing with the first real-device perf pass (TESTPLAN
    S8.3).
