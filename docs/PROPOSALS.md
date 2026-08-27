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
