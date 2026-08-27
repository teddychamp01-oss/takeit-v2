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

## 6. "Happiness Pledge" guarantee productization
- Status: PROPOSED
- Proposal: turn the existing `guarantee_claims` table into a marketed
  promise ("if it's not right, we send someone to fix it / refund up to X"),
  with public terms, claim UI, and an ops SLA.
- Rationale: trust is the product; a visible guarantee is the strongest
  trust signal a managed marketplace can make. Schema already exists.
- Cost/risk: real money paid out of Take It's own revenue — payouts must
  route via the provider (C1: it is Take It's expense, never user funds
  held); requires claim-abuse rules and a funded reserve. Terms need counsel
  review before anything is promised publicly.
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

## 8. Structured review questions
- Status: PROPOSED
- Proposal: replace/augment the free-text review with fixed yes/partial/no
  questions — customer→worker: "Arrived on time?", "Completed the work?";
  worker→customer: "Clear communication?", "Job description accurate?",
  "Would you work with them again?" — stored as `reviews.attributes jsonb`,
  submitted through the existing review RPC.
- Rationale: the best model idea in v1 — structured answers are comparable
  across reviews, harder to game than stars alone, and readable for
  low-literacy users. v1's chip-row answer UI (v1 `ReviewPage.tsx:94–109`)
  is a ready presentation pattern.
- Cost/risk: **needs a schema change** (`reviews.attributes jsonb`,
  fix-forward numbered migration per R4) plus a review-RPC signature change —
  both need founder sign-off; the two miner reports themselves split on
  migrate-now vs defer. Question wording must ship am-first through i18n.
- Decision: pending — founder.

## 9. Job completion PIN
- Status: PROPOSED
- Proposal: a short numeric PIN the customer reads to the worker (or vice
  versa) at job completion, proving physical presence before the booking can
  move to `worker_done` / `customer_confirmed`.
- Rationale: cheap real-world handshake against "marked done but never
  showed up" disputes.
- Cost/risk: **server-side only, or it is worthless.** v1 generated the PIN
  client-side with `Math.random()` and stored it readable by the counterparty
  (v1 `store.ts:236`) — the PIN verified nothing. If adopted: generated with
  `gen_random_bytes` inside the booking RPC, and RLS must expose it to the
  *checking* party only (a naive column on `bookings` is readable by both
  sides and defeats the purpose). Changes RPC semantics for every booking.
  Note: SPEC line ~148 "pin ACLs" means pinning *function ACLs* by
  `regprocedure` — unrelated to job PINs; v2 has no PIN today (verified).
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
