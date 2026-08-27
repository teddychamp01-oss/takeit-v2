# Audit findings & remediation — Take It v2 (S0 red-team)

Two independent adversarial agents (briefed to break, not approve) reviewed the
schema, edge functions, docs, and live DB. The orchestrator re-confirmed
load-bearing claims directly against the live project. No critical/high findings.

Status key: ✅ fixed this pass · 🔜 fix-forward (tracked) · 📝 doc/flag note ·
🧭 founder/counsel.

## Compliance & correctness audit — findings

| # | Sev | Finding | Disposition |
|---|---|---|---|
| A | — | Non-custodial (C1): no balance/wallet/float/ledger anywhere; webhook never credits internal balance | ✅ PASS (live-confirmed) |
| B1 | Med | 30-day ID-image deletion promised but not implemented (no function, no schedule) | 🔜 consolidated fix-forward migration + `purge-expired-verifications` edge function |
| B2 | Med | Data map omitted `business_accounts.tin/business_name`, `applications.message/committed_window`, `jobs.title/description`, `saved_workers` | ✅ added to compliance.md §1 |
| B3 | Low | `verifications.attributes` jsonb has no structural guard (policy-only) | 🔜 add CHECK/shape guard when the Fayda write path is built (no writer today) |
| C1 | Med | SPEC C3 said "masked until a booking is confirmed"; build unmasks at `customer_confirmed`. SPEC wording, read literally, would unmask at booking creation — the exact hazard C3 prevents | ✅ SPEC.md C3 reworded to `customer_confirmed`; build was already correct |
| C2 | Low | Bot `insertTelegramJob` inserts into `jobs` via service-role, bypassing `rpc_post_job` — contradicts "RPC-only" docs; can post to inactive category | 🔜 route bot insert through an actor-scoped RPC (or add active-category check) + correct ARCHITECTURE wording (deferred: apps/telegram-bot under active integration) |
| D | — | Money (C7): integer cents + currency everywhere; no persisted float | ✅ PASS |
| E | — | Secrets (R5): no service_role/JWT literal in any client path; service-role only from Deno.env | ✅ PASS (grep-confirmed) |
| F | Low | Fayda flag `FEATURE_FAYDA_ENABLED` gates no code yet; client `flags.*` imported by nothing | 📝 honest for phase — Fayda "off" because unbuilt; wire the flag when S4 Fayda lands |
| G1 | Low | SPEC stated ETB 100M capital / report figures as fact; "NBE PII licensing" mislabeled | ✅ SPEC.md relabeled to payment-instrument-issuer + hedged to the report/BLOCKERS |
| — | Low | `.env.example` omitted VITE_FEATURE_* names | ✅ added |
| — | Low | `payments.provider_ref` has no uniqueness for `provider='chapa'` (webhook handles ambiguity defensively) | 🔜 consolidated fix-forward: partial unique index |

## Schema red-team — findings

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | **HIGH** | Double-blind leak: `recompute_worker_rating()` recomputed the world-readable `worker_profiles.rating_avg`/`review_count` over ALL c_to_w reviews with no `is_published` filter, so a hidden first review moved the public aggregate — reviewee could read their rating before submitting theirs. **Live-reproduced** (unpublished 1-star moved a worker 4.70→1.00). | ✅ **FIXED + VERIFIED** in 000700: recompute counts only `is_published`; reveal (UPDATE flipping is_published) re-fires the trigger. Live proof w/ clean baseline: unpublished→0.00/0 (no leak), reveal→1.00/1. |
| 2 | Med | Any authenticated user can read every worker's raw `geo` point (precise home/base) and `profiles.telegram_id` (a direct contact channel — undercuts C3). `worker_profiles_select using(true)` + selectable columns; `nearby_workers` only returns distance, but the table exposes the raw point. Care categories make this a safety concern. | ✅ **FIXED + VERIFIED** in migration 20260827000710: table-wide SELECT replaced with column-level SELECT omitting `geo` / `telegram_id`; owner write-grants untouched; `nearby_workers` (definer) still reads geo; ops user-directory moved to admin-gated, audit-logged `rpc_admin_search_users`; frontend `searchUsers` repointed. Live proof: `geo`/`telegram_id` denied to authenticated, all 6 real frontend queries still OK, non-admin blocked from the RPC, admin RPC returns telegram_id. Web typecheck/lint/test/build all green after the change. |
| 3 | Low–Med | C3 phone soft-block bypassable with `/` or `_` separators (`09/11/22/33/44` passed unmasked). Detector/masker only stripped `[space () . -]`. | ✅ **FIXED + VERIFIED** in 000700: separator class widened to `/ _ , : ;`; live proof both bypass strings now → `[•••]`, innocuous text untouched. |
| — | Low | Seed workers carry fabricated `rating_avg`/`review_count`/`jobs_completed` with no backing review rows; the first real review recomputes from actual published rows (→ "1 review, 31 jobs" oddity). Demo-data cosmetics; production workers accrue real rows. | 🔜 seed fix-forward: generate backing published seed reviews (or start aggregates at 0). Non-blocking. |
| — | Low | RPCs don't copy `currency` from the source row (`bookings`/`payments` default 'ETB'). Harmless in single-currency launch (C7). | 🔜 fix-forward when multi-currency is enabled. |
| — | Low/Info | `reviews_select` has no direction restriction after reveal — published `w_to_c` (worker's review of a customer) is readable by all authenticated. Confirm customer-facing reputation is intended to be public. | 🧭 product decision (documented). |
| — | Cosmetic | `mask_phone('0911223344')` → `+091•••••44` (prepends `+` to a local number). Display only, masking constraint still satisfied. | 📝 note only. |

### Categories the schema red-team checked and found CLEAN (explicit negatives)
Verifier-that-cannot-fail / ACL disease (all 24 fns by regprocedure — none PUBLIC/anon), RLS cross-access (audit_log/user_roles/verifications/reports/disputes all 0 to attacker; anon hard-denied; third-party messages 0), trust/status column bypass (column-specific lock fires), state-machine bypass (creation/transition RPC-only), C1 non-custodial (no balance table), C2 PII (hash CHECK, no plaintext, private bucket), C7 money (integer cents, no float), `nearby_workers` (distance + stable-id order, ≤80 bounded, truncated flag), seed (clean apply, correct GoTrue shape).

## Consolidated fix-forward migration (planned, one numbered file)

To be written as `supabase/migrations/20260827000700_post_audit_fixes.sql`
after the schema red-team returns, covering at least:
1. B1 — `purge_expired_verification_metadata()` (nulls image paths + writes
   audit_log for verifications decided > 30 days ago) paired with a
   `purge-expired-verifications` edge function that deletes the storage objects
   via the storage admin API (SQL cannot delete bucket objects). pg_cron
   schedule left commented (founder-gated, like the other Phase-2 crons).
2. provider_ref partial unique index on `payments (provider_ref) where
   provider='chapa' and provider_ref is not null`.
3. Any schema/RLS finding the schema red-team confirms.

Applied with full rigor: ACL captured before/after, guard demonstrated firing,
rollback written, re-confirmed on the live DB.
