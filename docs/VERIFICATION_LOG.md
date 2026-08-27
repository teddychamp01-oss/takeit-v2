# Verification Log — Take It v2

Measured evidence from the live Supabase project `snfkefcluzkdeztdtdnk`
(eu-central-1, Postgres 17). Every number here was produced by a query against
the live system, not asserted by an agent. Where something was NOT verified it
says so.

## S0 — schema applied to live DB (2026-08-27)

Migrations applied in order via Supabase MCP `apply_migration`, verbatim file
content, by an agent independent from the author:

| Migration | Result |
|---|---|
| 20260827000100_extensions | OK |
| 20260827000200_enums | OK |
| 20260827000300_tables | OK |
| 20260827000400_functions_triggers | OK |
| 20260827000500_rls | OK |
| 20260827000600_storage_realtime | OK |

Seed applied twice (idempotency): run 1 OK, run 2 OK, no duplicate-key errors,
row counts stable.

Measured structure (orchestrator re-confirmed independently, not taking the
apply agent's word — the gate-on-the-gates):

- Tables in `public`: **21**; tables with RLS disabled: **0**
- RLS policies: **40**
- SECURITY DEFINER functions: **19**
  - exposed to `anon`/`PUBLIC` (regprocedure-pinned, NULL-proof audit): **[]** (none)
  - missing `search_path` pin: **[]** (none)
- Storage buckets: `avatars` (public), `verifications` (private)
- Realtime publication `supabase_realtime`: `public.messages`, `public.notifications`
- Seed content: 8 categories, 22 service packages, 10 profiles (10 is_seed),
  8 worker_profiles, 5 jobs (5 is_seed, 1 diaspora)

### Gate 2 — guards demonstrated FIRING against the live DB

3-persona RLS attack matrix (customer persona `c…001`), each run in isolation:

| Attack | Result |
|---|---|
| `anon` SELECT profiles / workers / jobs / verifications / messages / audit | permission denied (grant-level) |
| customer edits another user's profile | BLOCKED (0 rows) |
| customer self-inserts `admin` into user_roles | BLOCKED (permission denied) |
| customer reads others' verification documents | BLOCKED (0 rows) |
| customer reads audit_log | BLOCKED (0 rows) |
| customer reads worker_profiles (should succeed) | visible = 8 ✓ |

Full live state-machine flow through the RPCs (rolled back — seed untouched):

| Step | Result |
|---|---|
| rpc_post_job | job status `open` |
| rpc_apply_to_job | application created |
| rpc_accept_application | job `matched`, booking `confirmed` |
| **attack: outsider `c…002` calls rpc_booking_start** | **BLOCKED** — `TAKEIT_NOT_BOOKING_WORKER` |
| rpc_booking_start | booking `started` |
| **rpc_send_message with "0911 22 33 44"** | stored as **`call me on [•••] to coordinate`** (phone soft-block) |
| rpc_booking_worker_done | booking `worker_done` |
| rpc_booking_customer_confirm | booking `customer_confirmed`, worker `jobs_completed` 31→32 |
| rpc_submit_review (customer) | review NOT published before both submit ✓ (double-blind) |
| rpc_submit_review (worker) | both published, worker `rating_avg` 4.70→5.00 |
| audit_log rows written across flow | 7 |

Note (seed realism): after one real review the recompute trigger sets
`review_count` from actual `reviews` rows (→1), because seed data sets a
denormalized display counter (23) without inserting 23 real review rows. In
production every review is a real row, so the counter is accurate. Not a defect;
flagged so the seed's display numbers aren't mistaken for review-table rows.

### Supabase advisors (security)

- 14 × `authenticated_security_definer_function_executable` (WARN): every RPC
  and `has_role`/`nearby_workers` is callable by `authenticated`. **Intended
  architecture** — the RPCs are the only sanctioned path to change state, and
  the independent audit confirms none is callable by `anon`/`PUBLIC`. Not a
  defect.
- 1 × `auth_leaked_password_protection` disabled (WARN): Auth dashboard toggle.
  Email/password is only the interim dev path; enable before real launch.
  Logged in BLOCKERS.md.

## S0b — post-audit fix-forward migration 20260827000700 (applied to live DB)

Two independent red-team agents (schema + compliance) reviewed the baseline;
the orchestrator re-confirmed every load-bearing finding against the live DB.
No critical/high issues in compliance; the schema red-team found one HIGH
(confirmed and fixed). See docs/AUDIT_FINDINGS.md for the full matrix.

Migration `20260827000700_post_audit_fixes` applied OK. Fixes + live proof:

- **Finding 1 (HIGH) — double-blind aggregate leak — FIXED + VERIFIED.**
  Pre-fix (Gate 2 "seen to fail"): an unpublished 1-star review moved the public
  `rating_avg` 4.70→1.00 while the row stayed RLS-hidden. Post-fix, clean
  baseline (0.00/0): unpublished review → aggregate unchanged (0.00/0, rating
  NOT leaked); after both submit → 1.00/1 (counted only at reveal).
- **Finding 3 (Low–Med) — phone soft-block bypass — FIXED + VERIFIED.**
  `09/11/22/33/44` and `09_11_22_33_44` now both mask to `[•••]`; innocuous
  "meet at 4pm sharp" left untouched (no false positive).
- **provider_ref uniqueness** — partial unique index added for Chapa rows.
- **B1 retention purge** — `purge_expired_verification_metadata()` added,
  service_role-only. ACL guard demonstrated firing: anon BLOCKED, authenticated
  BLOCKED, service_role OK (0 rows today).

ACLs preserved across all `CREATE OR REPLACE` (captured before, asserted after):
recompute + purge = `{postgres, service_role}`; phone fns = `{postgres,
authenticated, service_role}`. Migration re-confirmed via advisors: no new
`anon`/`PUBLIC`-exposed function.

Deferred (tracked): Finding 2 (worker geo / telegram_id column exposure) needs a
column-privilege fix coordinated with the finished frontend's query patterns —
applied post-integration. Seed aggregate realism — seed fix-forward.

## Not verified (stated plainly)

- Web app on a real Android device / Lighthouse ≥80 (needs the built app + device).
- Edge functions executed end-to-end (Deno runtime; deployed but not invoked
  with live Telegram/Chapa payloads — those need founder tokens, see BLOCKERS).
- Realtime *delivery* of messages (publication membership + RLS verified; the
  walrus delivery path not exercised from a client).
- Fayda/Chapa live integrations (sandbox + flags only; founder credentials
  pending).
- Amharic strings are machine translations pending native-speaker review.
