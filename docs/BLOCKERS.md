# Take It v2 — Founder-only blockers

Per R7: agents log founder-only items here and keep moving. Each item: what is
blocked, exact next action, where the output goes. Ordered roughly by how much
they block.

Status legend: OPEN / IN PROGRESS / DONE (date).

---

## Live infrastructure snapshot (2026-08-27)

- **Supabase project** `snfkefcluzkdeztdtdnk` (eu-central-1) — LIVE. 8 migrations
  applied; RLS on all 21 tables; seed loaded; TS types generated.
- **Edge functions deployed & ACTIVE:** `chapa-webhook`, `telegram-auth`,
  `purge-expired-verifications` (all verify_jwt=false; all return a graceful
  503 until their secrets are set).
- **Edge function NOT yet deployed:** `telegram-webhook` (the grammY bot). Its
  source contains Amharic strings that could not be transmitted byte-exact
  through the agent's deploy tool, and the CLI path has no access token in the
  agent shell. **Deploy it from the repo** once the bot token is set (item #3):
  `SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy telegram-webhook \
  --project-ref snfkefcluzkdeztdtdnk --no-verify-jwt`. The other three prove
  the shared-deps bundle is correct; only the transport blocked this one.
- **Repo:** committed locally + delivered as a git bundle; not on GitHub yet
  (item #1).

---

## 1. GitHub repo `takeit-v2` — OPEN

**Blocked:** pushing this repo anywhere; PR-based flow; branch protection; CI
on GitHub.
**Why founder:** the Claude GitHub integration got **403 creating
repositories** — repo creation is not permitted to the agents.
**Next actions:**
1. Create the repo yourself at https://github.com/new → name `takeit-v2`,
   private.
2. Grant the **Claude GitHub App** access to it: claude.ai → Settings →
   Connectors → GitHub → add `takeit-v2` to the allowed repositories. Agents
   can then push branches and open PRs.
3. Tell the orchestrator agent the repo exists so it can push the current
   tree.

## 2. Branch protection on `main` — OPEN (needs #1 first)

**Next action:** GitHub → repo → Settings → Branches → protect `main`:
require PR, require CI green, no force-push. Keeps R4 (fix-forward
migrations) honest.

## 3. Telegram bot token — OPEN

**Blocked:** the whole Telegram-primary auth path (login-widget verification
needs the bot token as HMAC key), `apps/telegram-bot`, S7 tests.
**Next actions:**
1. In Telegram, talk to **@BotFather** → `/newbot` → pick the public bot name
   and username.
2. `/setdomain` to the web app's domain (required for the Login Widget) —
   this value is `TELEGRAM_LOGIN_DOMAIN`.
3. Put the token into **Supabase edge function secrets** (Dashboard → Edge
   Functions → Secrets): `TELEGRAM_BOT_TOKEN`. Never into the repo or any
   client env (R5). Optionally set `TELEGRAM_WEBHOOK_SECRET` (else the function
   derives the expected secret-token as SHA-256 of the bot token).
4. **Deploy `telegram-webhook`** from the repo (see the infrastructure
   snapshot above for the exact command) — it is the only edge function not
   already deployed.
5. Register the webhook with Telegram:
   `https://api.telegram.org/bot<token>/setWebhook?url=https://snfkefcluzkdeztdtdnk.supabase.co/functions/v1/telegram-webhook&secret_token=<same-secret>`.

## 4. Africa's Talking account (SMS OTP fallback) — OPEN

**Blocked:** SMS auth fallback; until then email/password remains the marked
dev path.
**Next actions:**
1. Create an Africa's Talking account, verify, and provision an SMS
   sender/short code usable for Ethiopia.
2. Add `AFRICASTALKING_API_KEY` / `AFRICASTALKING_USERNAME` to edge secrets.
3. Approve the agents wiring a Supabase **send-SMS auth hook** edge function
   (Supabase's default Twilio provider is NOT used — hook instead).

## 5. Chapa merchant account + escrow confirmation — OPEN

**Blocked:** all of Phase-2 payments (kept dark behind
`FEATURE_PAYMENTS_ENABLED=false` regardless).
**Next actions:**
1. Register a Chapa merchant account; get **sandbox/test keys** →
   `CHAPA_SECRET_KEY_TEST`, `CHAPA_WEBHOOK_SECRET` into edge secrets.
2. Get **WRITTEN confirmation from Chapa** (email is fine, keep it) that they
   support hold-then-release / **delayed settlement with subaccount split** —
   i.e. funds stay Chapa-held until we signal release on customer
   confirmation. C1 (non-custodial) depends on this being true at the
   provider. If Chapa cannot hold, Phase-2 design must change — do not let
   agents build against an assumed API.
3. Create a test subaccount to exercise the split.

## 6. NBE scope confirmation — OPEN

**Blocked:** legal certainty for Phase-2 escrow.
**Next action:** through counsel, obtain **written confirmation from the
National Bank of Ethiopia** (or a formal counsel opinion referencing NBE's
licensing directives) that provider-routed, job-completion-conditioned
payments — where Chapa, a licensed PSP, holds the funds and Take It never
does — fall **outside** payment-instrument-issuer licensing scope. C1 exists
because that licence means ETB 100M capital.

## 7. Fayda eKYC partner application — OPEN

**Blocked:** `FEATURE_FAYDA_ENABLED` path beyond the public sandbox; real
eKYC at launch quality.
**Next actions:**
1. Apply at **partner.fayda.et** for eKYC-Partner status — this must be under
   a licensed FISP (financial-institution service provider); identify and
   engage the sponsoring FISP.
2. Obtain sandbox credentials → `FAYDA_ESIGNET_CLIENT_ID`,
   `FAYDA_ESIGNET_REDIRECT_URI` (secrets/env; redirect URI is public).
3. Until granted, agents develop against the eSignet public sandbox (mock
   personas, test OTP 111111) with the flag off.

## 8. Lovable ↔ GitHub ↔ external Supabase connection — OPEN (needs #1)

**Blocked:** Lovable-assisted frontend iteration on the real codebase.
**Next actions:**
1. In Lovable, connect the project to the GitHub repo `takeit-v2` (two-way
   sync on a branch, not `main`).
2. Point Lovable at the **external** Supabase project `snfkefcluzkdeztdtdnk`
   using URL + **anon key only**. Lovable never receives the service-role key
   (R5) — if any integration screen asks for it, stop.

## 9. ECA registration + DPO appointment — OPEN

**Blocked:** lawful-operation checklist in `docs/compliance.md` §3.
**Next actions:** appoint a DPO (can be founder initially, named in-app);
register as data controller with the Ethiopian Communications Authority;
start the data-residency question (compliance.md §2 — TOP-3 legal risk) with
counsel and, if possible, written ECA guidance.

## 10. MInT Startup Designation — OPEN

**Next action:** apply for startup designation with the Ministry of
Innovation and Technology (startup-act benefits: tax/customs incentives,
easier procurement). Not launch-blocking; cheap to start early.

## 11. Trade license + TIN — OPEN

**Blocked:** contracts with Chapa/Africa's Talking (both KYB the merchant),
bank account, invoicing.
**Next action:** register the business, obtain trade license + TIN; store
scans somewhere private (NOT the repo).

## 12. Supabase Auth hardening + retention cron — OPEN

Small dashboard/config items surfaced by the security review:
1. **Enable leaked-password protection** (Auth → Policies): Supabase advisor
   flags it off. Cheap; do before real signups. Email/password is only the
   interim dev path, but turn it on regardless.
2. **Schedule the retention purge.** `purge-expired-verifications` is deployed
   but never called. Set a `PURGE_SECRET` edge secret, then schedule a daily
   `pg_cron` job (or Supabase scheduled function) that POSTs to it with the
   `x-purge-secret` header — this is what actually enforces the C2 "ID images
   deleted 30 days after decision" rule (see docs/compliance.md §1).
3. **Schedule the Phase-2 crons** (`auto_release_bookings`,
   `publish_due_reviews`) when their slices go live — the functions exist,
   unscheduled by design.

## 13. Legal opinions to commission — OPEN

One engagement, three written questions:
1. **VAT on commission:** is Take It's commission VAT-able as an electronic
   service, and at what registration threshold; invoicing format for
   commission-only revenue.
2. **Worker classification:** are platform workers independent contractors
   under Ethiopian labour law; what wording must the ToS use; any
   withholding-tax duty on payouts to individuals.
3. **Competency certificates per category:** which launch categories legally
   require occupational competency certification (esp. babysitting-care,
   repairs/electrical) and whose duty verification is — also feeds the DPIA
   (compliance.md §3).

---

*Agents: when a blocker clears, move the credential into Supabase edge
secrets or CI secrets, never into the repo; flip the item to DONE with the
date.*
