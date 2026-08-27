# Take It v2 — Compliance & PII data map

Scope: personal data processed by Take It v2 (Supabase project
`snfkefcluzkdeztdtdnk`, eu-central-1) under Ethiopia's Personal Data
Protection Proclamation No. 1321/2024. This file is the C2 register required
by `docs/SPEC.md`: every PII field, its purpose, lawful basis, retention, and
masking rule. Update it in the same PR as any schema change that touches
personal data.

Status of this document: engineering draft. Retention periods below are
proposed defaults chosen by engineering; **none have been reviewed by counsel
yet** — see Open risks. Every number here is a policy choice, not a
measurement.

Lawful-basis shorthand (Proc. 1321/2024 grounds):
- **Contract** — processing necessary to perform the service contract with the
  data subject.
- **Consent** — explicit consent collected in-app.
- **Legal/LI** — legal obligation or legitimate interest (fraud prevention,
  dispute resolution, platform safety).

---

## 1. PII data map

### profiles

| Field | PII | Purpose | Lawful basis | Retention | Masking |
|---|---|---|---|---|---|
| id (=auth.users.id) | pseudonymous id | account | Contract | life of account + 90 days after deletion request | — |
| display_name | yes | identification to counterparties | Contract | life of account | shown as entered |
| avatar_url | yes (image) | recognition/trust | Consent | life of account; object deleted with account | public bucket by design |
| locale | low | UI language | Contract | life of account | — |
| phone_masked | yes (masked) | display only | Contract | life of account | **stored already masked**; CHECK constraint rejects 7+ consecutive digits, so a raw number cannot land in this column |
| telegram_id | yes | Telegram auth binding | Contract | life of account | never displayed to other users |
| default_neighborhood | location (coarse) | matching convenience | Contract | life of account | coarse (named neighborhood only) |
| auth.users.email / phone (Supabase-managed) | yes | login, OTP | Contract | life of account | never shown to counterparties |

### worker_profiles

| Field | PII | Purpose | Lawful basis | Retention | Masking |
|---|---|---|---|---|---|
| bio, skills | yes (self-published) | marketplace listing | Contract | life of worker profile | public to authenticated users by design |
| neighborhood | location (coarse) | matching | Contract | life of worker profile | coarse only |
| geo (Point) | location (precise) | proximity search (`nearby_workers`) | Contract | life of worker profile | never rendered as raw coordinates to other users; used server-side for distance; workers should be advised to pin a nearby landmark, not their home |
| availability, prices, rating_avg, review_count, jobs_completed, badge_level, verification_level | low | trust signals | Contract | life of worker profile | public to authenticated by design; trust numbers are server-set only (no client grant) |

### verifications (highest-sensitivity table)

| Field | PII | Purpose | Lawful basis | Retention | Masking |
|---|---|---|---|---|---|
| method, status | low | KYC state | Legal/LI (platform safety) | life of account + 2 years (fraud defense) | — |
| fayda_txn_id | pseudonymous ref | audit trail of eKYC transaction | Legal/LI | life of account + 2 years | opaque id only |
| fayda_number_hash | yes (hashed national id) | dedup / re-verification without storing the number | Legal/LI | life of account + 2 years | **SHA-256(salt ‖ number) only**; CHECK constraint forbids anything that is not 64 hex chars — plaintext structurally cannot be stored. Salt lives in edge-function secrets, never in the DB |
| attributes (jsonb) | yes | store ONLY the attributes Fayda returns (name, DOB, gender as returned) | Legal/LI + Consent | life of account + 2 years | never raw Fayda number, never biometrics — C2 hard rule |
| id_front_path, id_back_path, selfie_path | yes (ID images) | manual verification | Consent + Legal/LI | **objects deleted 30 days after decision** (`decided_at + 30d`), paths then nulled; pending rows keep objects until decided | private bucket `verifications`; RLS: owner may upload, **only ops/admin may read**; no client delete (retention is a service_role job) |
| reviewer_id, decided_at, notes | reviewer PII / free text | decision audit | Legal/LI | life of account + 2 years | notes must not repeat document contents (ops instruction) |

**Fayda hard rules (C2):** store only verification result, returned
attributes, txn id, timestamp. Fayda numbers only as salted SHA-256. No raw
biometrics, ever, in any table, bucket, or log. The 30-day image deletion job
is service-role/pg_cron work — **not yet implemented; tracked as a gap in
§4.**

### guarantors

| Field | PII | Purpose | Lawful basis | Retention | Masking |
|---|---|---|---|---|---|
| guarantor_name | yes — **third party who is not a platform user** | community vouching | Legitimate interest (the guarantor's own consent is collected by the worker; the statement attests it) | life of the worker profile; delete on guarantor request | visible to owner + ops/admin only (RLS) |
| guarantor_contact_masked | yes (masked) | ops verification callback | LI | same | stored masked (CHECK, same rule as phones); ops obtain the full contact out-of-band |
| statement | free text | vouching context | LI | same | owner + ops/admin only |

### jobs (diaspora local contacts)

| Field | PII | Purpose | Lawful basis | Retention | Masking |
|---|---|---|---|---|---|
| service_address_text, service_landmark, service_neighborhood, service_geo | location of a household | service delivery | Contract | 1 year after job reaches terminal status, then null address/geo fields (row kept for stats) | visible only to poster, booked worker, matched-radius workers (open jobs), ops/admin — RLS |
| local_contact_name | yes — third party (diaspora flow) | worker's on-site contact | Contract (posted on the contact's behalf by the customer) | same as address fields | visible under the same jobs RLS |
| local_contact_phone_masked | yes (masked) | display pre-booking | Contract | same | **masked at insert by `mask_phone()` inside `rpc_post_job`**; CHECK rejects raw numbers; full number is exchanged in chat only after `customer_confirmed` |

### messages

| Field | PII | Purpose | Lawful basis | Retention | Masking |
|---|---|---|---|---|---|
| body | yes (free text; users may include anything) | job coordination | Contract | 1 year after the booking reaches terminal status, then delete | readable ONLY by the two booking parties — **deliberately not even admin** (RLS); pre-completion phone-like content is masked server-side by `rpc_send_message` (C3); chat bodies are never copied into `audit_log` |
| read_at, sender_id | low | delivery UX | Contract | same | — |

### payments / payouts

| Field | PII | Purpose | Lawful basis | Retention | Masking |
|---|---|---|---|---|---|
| amount_cents, commission_cents, status, provider_ref, chapa_subaccount_id | financial (linked to persons via booking) | payment record; C1 non-custodial log | Contract + Legal (tax/accounting) | **7 years** (accounting records; standard tax-retention assumption — counsel to confirm the Ethiopian requirement) | visible to booking parties + ops/admin only (RLS); no card/PAN data ever touches Take It (Chapa-hosted checkout) |

### reviews / reports / disputes / guarantee_claims

| Field | PII | Purpose | Lawful basis | Retention | Masking |
|---|---|---|---|---|---|
| reviews.comment | opinion about a person | trust system | Contract/LI | life of the reviewee's profile | double-blind until both submit or 48h (RLS + `is_published`) |
| reports.description, disputes.reason/evidence, guarantee_claims | allegations, possibly sensitive | safety, dispute resolution | LI/Legal | 2 years after resolution | reporter + ops/admin only (reports); parties + ops/admin (disputes) |

### notifications, audit_log

| Field | PII | Purpose | Lawful basis | Retention | Masking |
|---|---|---|---|---|---|
| notifications.payload | ids only | in-app alerts | Contract | 90 days, then delete | own rows only (RLS) |
| audit_log (actor_id, action, entity, diff) | pseudonymous activity trail | accountability for every state change (written by RPCs) | LI/Legal | 2 years | admin-read only (RLS); **never contains chat bodies, ID images, or raw phones** — RPCs log ids and flags only |

### Storage buckets

| Bucket | Contents | Access | Retention |
|---|---|---|---|
| `avatars` (public) | profile photos | owner writes `<uid>/…`, anyone reads | deleted with account |
| `verifications` (private) | ID front/back, selfie | owner uploads to `<uid>/…`; **ops/admin read only**; no client read-back or delete | **deleted 30 days after decision** (service-role job — not yet implemented) |

---

## 2. Data-residency — TOP-3 OPEN LEGAL RISK

**The problem.** Proclamation 1321/2024 contemplates data-localization /
cross-border-transfer restrictions for personal data of Ethiopian residents.
Production today is Supabase **eu-central-1 (Frankfurt)** — all PII above is
stored outside Ethiopia. Whether the current directives permit this (e.g. with
consent, or pending ECA transfer rules) is **not established**. This is a
launch-blocking legal question, not an engineering one.

**Migration path options (decision pending, counsel + ECA guidance needed):**

1. **In-country hosting.** Self-hosted Supabase (it is open source) or plain
   Postgres + PostgREST on an Ethiopian datacenter (Ethio Telecom / Safaricom
   ET / Wingu-style colo). Highest compliance certainty; highest ops burden;
   loses managed Supabase (auth, realtime, storage need self-managing).
2. **Segregation.** Keep low-sensitivity operational data abroad; move the
   high-sensitivity tables (`verifications`, ID images, `messages`) to an
   in-country store; foreign side keeps only pseudonymous ids. Middle cost;
   complex; only works if the law permits partial transfer.
3. **Stay + legal basis for transfer.** Obtain ECA guidance / rely on consent
   + contractual-necessity transfer grounds if the implementing directives
   allow. Cheapest; entirely dependent on counsel's reading and ECA's
   position.

**Engineering posture now:** design for migration — all state lives in
Postgres migrations (re-appliable on any Postgres), storage paths are
relative, no hard-coded region endpoints outside env vars. Founder action:
legal counsel + ECA engagement — `docs/BLOCKERS.md`.

---

## 3. Process placeholders

### 72-hour breach process (placeholder — to be completed with counsel)

1. Detect/contain: revoke leaked credentials, rotate keys, snapshot evidence.
2. Assess within 24h: what data classes (use the map above), how many
   subjects, ongoing or stopped.
3. Notify the **Ethiopian Communications Authority (ECA)** within **72 hours**
   of becoming aware, per Proc. 1321/2024 (exact form/threshold: counsel to
   confirm).
4. Notify affected data subjects without undue delay where there is likely
   serious harm (ID images or Fayda attributes involved = yes).
5. Post-mortem into this file + `audit_log` review.

Contact chain: founder → DPO (once appointed) → counsel → ECA. Fill in names
and channels when the DPO exists.

### DPO + ECA registration checklist (founder items — mirrored in BLOCKERS.md)

- [ ] Appoint a Data Protection Officer (named person, contact published in-app).
- [ ] Register as a data controller with the ECA as required under 1321/2024.
- [ ] Records of processing = this file; keep current.
- [ ] Data-subject rights channel (access/correction/deletion requests) —
      support inbox + documented SLA.
- [ ] Processor agreements: Supabase, Chapa, Africa's Talking, Telegram,
      Fayda/eKYC partner — collect DPAs where available.
- [ ] Cross-border transfer position (§2) resolved in writing.

### DPIA note — babysitting-care category

The `babysitting-care` category places workers alone with children. This is a
high-risk processing/vetting context and needs a **Data Protection Impact
Assessment** before launch of that category. Current mitigations already in
the product: category `min_verification_level = 'fayda_verified'` (highest
identity assurance), guarantor vouching, double-blind reviews, ops-only access
to ID documents. Open DPIA questions: whether additional background/competency
checks are legally required for childcare work (see legal-opinion item in
BLOCKERS.md), retention of safety reports involving minors, and whether any
data about the children themselves is ever captured (current schema: **none —
keep it that way**; job descriptions may incidentally contain it, which the
DPIA must address).

---

## 4. Known gaps (honest list)

- The 30-day verification-image deletion job is **specified but not
  implemented** (no pg_cron schedule, no deletion function yet).
- Retention periods other than the 30-day image rule are engineering
  proposals, unreviewed by counsel.
- No data-subject deletion (right-to-erasure) flow exists yet beyond manual
  service-role SQL.
- Supabase Auth server logs / edge-function logs may hold IPs and phone
  numbers outside this map; scope them before launch.
- Data-residency (§2) is unresolved.
