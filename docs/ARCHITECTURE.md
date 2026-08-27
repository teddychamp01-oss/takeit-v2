# Take It v2 — Architecture

Engineering reference for this repo as it actually exists. Where a component is
specified but not yet in the tree, it is marked **(planned — not in repo yet)**.
Source of truth for constraints: `docs/SPEC.md` (C1–C8, R1–R7).

Last audited against the working tree: 2026-08-26.

---

## 1. Monorepo map

```
takeit-v2/
├── apps/
│   ├── web/                      Vite + React + TS mobile-first PWA
│   │   ├── src/routes.tsx        Route contract (all pages lazy-loaded)
│   │   ├── src/components/       Shared UI (MaskedPhone, StatusBadge, RequireAuth,
│   │   │                         RequireRole, BottomNav, WorkerCard, …)
│   │   ├── src/features/         auth/ home/ browse/ jobs/ bookings/ profile/ admin/
│   │   ├── src/lib/              supabase.ts (client), i18n.tsx, flags.ts,
│   │   │                         phone.ts (client-side mask helpers), format.ts
│   │   └── src/i18n/messages/    Per-feature am+en string tables (am default, C5)
│   └── telegram-bot/             (planned — not in repo yet) grammY webhook as a
│                                 Supabase Edge Function
├── supabase/
│   ├── migrations/               Numbered, fix-forward only (R4)
│   │   ├── 20260827000100_extensions.sql       postgis, pg_cron, pgcrypto
│   │   ├── 20260827000200_enums.sql            all Postgres enums
│   │   ├── 20260827000300_tables.sql           21 tables + CHECKs + indexes
│   │   ├── 20260827000400_functions_triggers.sql  RPCs, triggers, ACL grants
│   │   ├── 20260827000500_rls.sql              grants + policies, RLS on all tables
│   │   ├── 20260827000600_storage_realtime.sql buckets + realtime publication
│   │   └── rollbacks/            One `_down.sql` per migration
│   ├── seed/seed.sql             8 seed workers, 5 open jobs, is_seed=true
│   └── ci/                       supabase_shim.sql for fresh-db CI applies
└── docs/                         SPEC.md (contract), this file, compliance.md,
                                  TESTPLAN.md, BLOCKERS.md, PROPOSALS.md
```

Root files (`package.json`, `README.md`, `.github/workflows/ci.yml`,
`.env.example`) are orchestrator-owned.

---

## 2. Request / data flow

```
                         READS (RLS-filtered)                WRITES (state)
┌──────────────┐   PostgREST select / realtime      ┌────────────────────────┐
│  apps/web    │ ─────────────────────────────────▶ │      Supabase          │
│  (anon key + │                                    │  Postgres + RLS        │
│  user JWT)   │   supabase.rpc('rpc_*', args)      │                        │
│              │ ─────────────────────────────────▶ │  SECURITY DEFINER RPCs │
└──────────────┘                                    │  = the ONLY status/    │
       ▲                                            │    insert path for     │
       │ session (JWT)                              │    jobs, applications, │
┌──────────────┐    verified payload                │    bookings, payments, │
│ Edge funcs   │ ─────────────────────────────────▶ │    messages, reviews,  │
│ telegram-auth│    (service-role key lives HERE    │    disputes            │
│ bot webhook  │     and only here)                 └────────────────────────┘
│ (planned)    │
└──────────────┘
```

Rules the diagram encodes:

- **Reads** go straight through PostgREST/`select` with the anon key + user
  JWT; RLS policies (`supabase/migrations/20260827000500_rls.sql`) are the
  filter. There is no bespoke read API.
- **State-changing writes** never touch tables directly. Column grants for
  `authenticated` exclude every `status` column, and `jobs`, `applications`,
  `bookings`, `payments`, `messages`, `reviews`, `disputes` have **no client
  INSERT grant/policy at all**. The only write path is the `rpc_*` family in
  `20260827000400_functions_triggers.sql`.
- Tables clients may write directly (own-row only, non-status columns):
  `profiles`, `worker_profiles`, `verifications` (insert), `guarantors`
  (insert), `reports` (insert), `guarantee_claims` (insert), `saved_workers`,
  `notifications.read_at`, `messages.read_at`.

---

## 3. State machines

Both machines exist **only** inside SECURITY DEFINER RPCs. RLS grants no
UPDATE on any status column to any client role, so there is no second path.

### 3.1 Booking state machine

```
                rpc_accept_application (customer)
                          │  creates row
                          ▼
                     ┌───────────┐
                     │ confirmed │
                     └─────┬─────┘
        rpc_booking_start  │  (worker only)
                          ▼
                     ┌───────────┐
                     │  started  │
                     └─────┬─────┘
  rpc_booking_worker_done  │  (worker only)
                          ▼
                     ┌─────────────┐
                     │ worker_done │
                     └─────┬───────┘
rpc_booking_customer_confirm │ (customer only)     auto_release_bookings()
                          ▼                        (server-side, 24h after
              ┌─────────────────────┐               worker_done_at; written,
              │ customer_confirmed  │◀──────────────NOT scheduled — Phase 2)
              └─────────────────────┘
```

Every legal transition, with the RPC that performs it and who may call it:

| From | To | RPC | Caller allowed |
|---|---|---|---|
| — | `confirmed` | `rpc_accept_application` | job's customer |
| `confirmed` | `started` | `rpc_booking_start` | booking's worker |
| `started` | `worker_done` | `rpc_booking_worker_done` | booking's worker |
| `worker_done` | `customer_confirmed` | `rpc_booking_customer_confirm` | booking's customer |
| `worker_done` | `customer_confirmed` | `auto_release_bookings()` | service_role only (pg_cron, Phase 2, not yet scheduled) |
| `confirmed`, `started` | `cancelled` | `rpc_booking_cancel` | either party |
| `confirmed`, `started`, `worker_done` | `disputed` | `rpc_booking_dispute` | either party (also inserts the `disputes` row) |

Anything else raises `TAKEIT_INVALID_TRANSITION`. Terminal states:
`customer_confirmed`, `cancelled`. `disputed` is terminal for the RPCs;
resolution is an ops action on the `disputes` row (ops/admin UPDATE policy),
not a booking-status RPC — there is currently **no RPC out of `disputed`**.

Side effects worth knowing:
- `customer_confirmed` increments `worker_profiles.jobs_completed`, may
  complete the job (below), and returns `contact_unlocked: true` — the point
  where the C3 phone soft-block lifts.
- `rpc_submit_review` requires `customer_confirmed` and is the only insert
  path for reviews (double-blind: published when both submitted; the reviews
  RLS policy also reveals at 48h with no cron).
- `rpc_log_offapp_payment` requires status in
  `started | worker_done | customer_confirmed`.

### 3.2 Job state machine

Job status is derived — no RPC targets a job status directly; the booking
RPCs move it:

```
        rpc_post_job
             │
             ▼
         ┌──────┐   rpc_accept_application        ┌─────────┐
         │ open │ ───(bookings reach ───────────▶ │ matched │
         └──┬───┘    workers_needed)              └────┬────┘
            │  ▲                                       │
            │  └── rpc_booking_cancel (no non-         │ rpc_booking_start
            │      cancelled bookings remain)          ▼
            │                                   ┌─────────────┐
            │                                   │ in_progress │
            │                                   └──────┬──────┘
            │            all bookings customer_confirmed│(or cancelled)
            │                                          ▼
            │                                    ┌───────────┐
            │        rpc_booking_dispute         │ completed │
            └──────────(any party)──────────▶    └───────────┘
                       ┌──────────┐
                       │ disputed │   (job + booking together)
                       └──────────┘
   `cancelled` job status: enum value exists; no RPC currently sets it.
```

| Job transition | Performed inside |
|---|---|
| — → `open` | `rpc_post_job` (the only jobs insert path; masks the diaspora local-contact phone via `mask_phone()` before storage) |
| `open` → `matched` | `rpc_accept_application`, when active bookings ≥ `workers_needed` |
| `open`/`matched` → `in_progress` | `rpc_booking_start` |
| `matched`/`in_progress` → `open` | `rpc_booking_cancel`, when no non-cancelled bookings remain |
| any in-flight → `completed` | `rpc_booking_customer_confirm` / `auto_release_bookings()`, when no booking on the job is still in flight |
| any → `disputed` | `rpc_booking_dispute` |
| → `cancelled` | **no path yet** (enum value exists; a customer-cancel-job RPC is future work) |

### 3.3 Application state machine

`pending → accepted` (`rpc_accept_application`) is the only transition
implemented. `rejected` and `withdrawn` enum values exist with **no RPC yet**.

---

## 4. Auth architecture

Three channels, in priority order. All end the same way: a Supabase session
(JWT) in the web client; everything after that is identical.

1. **Telegram-primary (planned — edge function not in repo yet).**
   Bot deep-link or the Telegram Login Widget produces a signed payload
   (`id, first_name, username, auth_date, hash`). An edge function
   (`telegram-auth`) verifies `hash` = HMAC-SHA256 of the data-check string
   keyed by SHA256(`TELEGRAM_BOT_TOKEN`), rejects stale `auth_date`, then uses
   the **service-role admin API** to create-or-fetch the user keyed on
   `profiles.telegram_id` (unique column, already in schema) and mints a
   session returned to the client. The bot token and service-role key exist
   only as edge-function secrets. Blocked on the founder's @BotFather token —
   see `docs/BLOCKERS.md`.
2. **SMS OTP fallback (planned).** Supabase phone auth with a **custom SMS
   auth hook** pointed at Africa's Talking (NOT the default Twilio provider).
   Blocked on the founder's Africa's Talking account.
3. **Email/password — the interim dev path, live today.** `AuthPage`
   (`apps/web/src/features/auth/AuthPage.tsx`) uses standard Supabase
   email/password. **Clearly marked as dev-only; not the launch flow.**

On any signup, the `on_auth_user_created` trigger (`handle_new_user()`)
creates the `profiles` row with `locale` defaulting to `'am'` (C5).

---

## 5. Money: non-custodial escrow (C1)

Take It never holds user funds. There is deliberately **no balance table** in
the schema, and no table may ever represent one (NBE payment-instrument
licensing = ETB 100M capital).

**Phase 1 (live path): off-app payment logging.** Customer pays the worker
directly (cash/Telebirr/bank). Either party calls `rpc_log_offapp_payment`,
which upserts one `payments` row per booking (`provider='offapp'`,
`status='logged'`) with two dual-confirmation booleans:
`customer_confirmed` and `worker_confirmed`. The row is a *record of a payment
that happened outside the app*, nothing more. Amount mismatch between the
parties raises `TAKEIT_PAYMENT_AMOUNT_MISMATCH`.

**Phase 2 (dark, behind `FEATURE_PAYMENTS_ENABLED=false`): Chapa escrow.**

```
customer ──charge──▶ Chapa (provider-held) ──release-on-confirmation──▶ worker
                        │                        (subaccount/split:
                        └── commission split ──▶  commission_cents to Take It)
```

Funds are Chapa-held from charge until `customer_confirmed` (or the 24h
auto-release); settlement to the worker uses Chapa subaccount/split
(`payments.chapa_subaccount_id`, `payouts` table). Payment status enum
(`initiated → held → released | refunded | failed`) models the provider's
state, not a Take It ledger. **Open dependency:** written Chapa confirmation
that hold-then-release / delayed split settlement is actually supported —
tracked in `docs/BLOCKERS.md`. Do not build Phase 2 UI before that lands.

---

## 6. RLS philosophy

Defense in depth, three layers, in `20260827000500_rls.sql`:

1. **Column grants first.** `revoke all ... from public, anon, authenticated`,
   then re-grant per table, per column. Status columns, trust numbers
   (`rating_avg`, `review_count`, `jobs_completed`, `badge_level`,
   `verification_level`) and `fayda_*` columns are simply not grantable —
   a permissive policy bug cannot expose what the grant layer never gave.
2. **Policies second.** Own-row reads/writes; worker profiles readable by all
   authenticated; open jobs visible to workers only on category match AND
   travel-radius `st_dwithin`; messages visible to the booking's two parties
   **only — deliberately not even admin**; `user_roles`/`audit_log` admin-read
   only. `auth.uid()` is always wrapped `(select auth.uid())` so the planner
   evaluates it once.
3. **RPCs for state.** Everything in section 3. Each RPC validates
   `auth.uid()`, validates the transition, raises a `TAKEIT_*` error, and
   writes `audit_log` via `audit_write()`.

Admin is C8: a row in `user_roles` on a normal account, checked server-side by
`has_role()` (SECURITY DEFINER, `set search_path = ''`, EXECUTE revoked from
PUBLIC/anon). No admin credentials exist anywhere.

**Phone masking (C3)** is enforced at three levels: CHECK constraints on every
`*_masked` column reject 7+ consecutive digits (a raw number *cannot* be
stored); `mask_phone()` masks the diaspora local contact at insert;
`rpc_send_message` masks phone-like chat content server-side until the booking
reaches `customer_confirmed` and returns `phone_masked: true` so the client
shows the i18n soft-warning. Client-side `MaskedPhone`/`lib/phone.ts` are
presentation only — the server does not trust them.

---

## 7. Realtime chat

- `messages` and `notifications` are in the `supabase_realtime` publication
  (`20260827000600_storage_realtime.sql`; the migration **fails loudly** if the
  publication is missing — silently-dead realtime is the "silence is not
  safety" failure mode).
- Realtime (walrus) enforces the tables' RLS, so parties-only visibility
  carries over to the socket: you cannot subscribe your way into someone
  else's chat.
- Send path is `rpc_send_message` only (C3 soft-block lives there); the client
  subscribes to INSERTs on `messages` filtered by `booking_id` and marks
  `read_at` via its column-scoped UPDATE grant (recipient only — the
  `messages_mark_read` policy requires `sender_id <> auth.uid()`).
- Chat is job-scoped by construction: `messages.booking_id` is the only
  addressing; there is no free-form DM surface.

---

## 8. Feature flags

`apps/web/src/lib/flags.ts`: flags default **false** — absent env, empty
string, anything but `'true'`/`'1'` is OFF. Current flags:

| Flag | Env (client) | Gates |
|---|---|---|
| `paymentsEnabled` | `VITE_FEATURE_PAYMENTS_ENABLED` | Chapa UI (Phase 2) |
| `faydaEnabled` | `VITE_FEATURE_FAYDA_ENABLED` | Fayda eKYC flow (manual ID is the live path) |

Server-side counterparts (`FEATURE_PAYMENTS_ENABLED`, `FEATURE_FAYDA_ENABLED`)
gate edge-function behavior. Flags gate *availability*, never *authorization* —
turning a flag on client-side exposes UI only; the server still enforces
grants/policies/RPC checks.

---

## 9. Why no service-role key can ever reach a client

The service-role key bypasses RLS entirely (BYPASSRLS); in a browser or bot
client it would be a full database dump for anyone who opens devtools. The
layers preventing that:

1. **Build-time exposure boundary.** Vite only inlines `VITE_`-prefixed env
   vars. The key is named `SUPABASE_SERVICE_ROLE_KEY` (no `VITE_` prefix — see
   `.env.example`), so the bundler cannot embed it.
2. **The web code never references it.** `apps/web/src/lib/supabase.ts`
   constructs the client from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
   only.
3. **The only legitimate holders** are Supabase Edge Functions (secrets store)
   and CI/server jobs. Lovable gets frontend generation only and never sees
   the key (SPEC, R5).
4. **Acceptance gate:** CI/founder greps the built `apps/web/dist/` for the
   key and for `service_role` before ship (TESTPLAN S6). A key that leaked
   would also show up as `role":"service_role"` inside the JWT payload — grep
   both.
5. **Blast-radius design:** even the anon key + a hostile client gets only
   what section 6 grants — which is why the grant layer is trimmed to columns,
   not just guarded by policies.

---

## 10. Telegram bot (planned — not in repo yet)

`apps/telegram-bot`: grammY, deployed as a Supabase Edge Function webhook.
Duties: deep-link onboarding into Telegram auth (section 4), booking/job
notifications fan-out from the `notifications` table, and simple
status/inbox queries. It authenticates users by `telegram_id`, calls the same
`rpc_*` functions with the user's session where possible, and holds the bot
token + service-role key only as edge secrets. Blocked on founder items in
`docs/BLOCKERS.md`.
