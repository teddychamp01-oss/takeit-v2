# Take It v2 — Supabase Edge Functions

Three functions (Deno, Supabase Edge Runtime, `npm:` specifiers) plus shared
helpers in `_shared/`.

| Function | Purpose | Auth |
|---|---|---|
| `telegram-auth` | Verifies a Telegram Login Widget payload OR a bot deep-link login token, finds-or-creates the user keyed on `telegram_id`, returns a Supabase session | none (public endpoint, HMAC-verified payloads) |
| `telegram-webhook` | The bot: /start /help /categories /postjob /myjobs /cancel; guided /postjob flow; inserts jobs (source `telegram` recorded in `audit_log`) | `X-Telegram-Bot-Api-Secret-Token` |
| `chapa-webhook` | Mirrors Chapa events into `payments.status` (valid transitions only, idempotent, amounts checked against the stored row). No-ops with `200 {ignored:true}` unless `FEATURE_PAYMENTS_ENABLED=true` | `Chapa-Signature` HMAC of raw body |

## Environment (edge secrets — names only, values never in the repo; R5)

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — injected
  by the platform. Service-role key is used ONLY inside these functions.
- `TELEGRAM_BOT_TOKEN` — unset ⇒ `telegram-auth`/`telegram-webhook` answer
  `503` gracefully (`telegram_auth_not_configured` / `telegram_bot_not_configured`).
- `TELEGRAM_LOGIN_DOMAIN` — web app host for /start deep-link buttons.
- `TELEGRAM_WEBHOOK_SECRET` — *optional*, not in the SPEC env list. Expected
  value of `X-Telegram-Bot-Api-Secret-Token`. When unset, the SHA-256 hex of
  the bot token is used (derived, does not reveal the token), so no extra
  secret is required. Pass the same value to `setWebhook(secret_token=…)`.
- `CHAPA_WEBHOOK_SECRET`, `FEATURE_PAYMENTS_ENABLED` — chapa-webhook.

## Deploy notes (for the orchestrator / founder)

- All three functions must be deployed with **`verify_jwt = false`**
  (`supabase functions deploy <name> --no-verify-jwt` or `[functions.<name>]
  verify_jwt = false` in `supabase/config.toml` — that file is owned by the
  orchestrator, not written here): Telegram and Chapa cannot send Supabase
  JWTs, and login callers are not signed in yet.
- Register the Telegram webhook:
  `https://api.telegram.org/bot<token>/setWebhook?url=<functions-url>/telegram-webhook&secret_token=<value>`.

## Session issuance (telegram-auth) — documented choice

supabase-js has no direct "admin: create a session for user X" API. The
supported server-side path used here:

1. service-role `admin.auth.admin.generateLink({type:'magiclink', email})`
   → `properties.hashed_token` (nothing is emailed),
2. anon-key `auth.verifyOtp({type:'email', token_hash})` → session.

The one-time token hash is consumed inside the function; only the resulting
`{access_token, refresh_token}` is returned. The email is the deterministic
alias `tg<telegram_id>@telegram.takeit.example` (never deliverable; it only
keys the auth account).

## Duplicated modules (ARCHITECTURE)

`_shared/texts.ts`, `_shared/flows.ts`, `_shared/telegramAuth.ts` are
BYTE-IDENTICAL mirrors of `apps/telegram-bot/src/*` — the edge runtime cannot
import the npm workspace without a build step. The canonical copies live in
`apps/telegram-bot` where they are unit-tested; the vitest guard
`apps/telegram-bot/src/sync.test.ts` fails CI the moment the copies drift.
Edit the `apps/telegram-bot/src` copy first, then `cp` it here.

## Known limitations / hook points

- **/postjob state** is in-memory per edge isolate (TTL 15 min). A cold start
  loses it; the bot replies "expired, restart /postjob" — never wrong data.
  Proper fix: a `bot_sessions` table (migration owned by the schema owner).
- **Notifications → Telegram** (Phase 2): DB RPCs already write the
  `notifications` table. Hook point: pg_cron + pg_net POST to
  `telegram-webhook?action=notify` (branch exists, returns 501) which will
  send `bot.api.sendMessage` using `profiles.telegram_id` and mark `read_at`.
- **payments.provider_ref has no UNIQUE index** in the current migrations;
  chapa-webhook therefore refuses ambiguous refs (>1 row) loudly instead of
  guessing. Proposed to the schema owner: partial unique index on
  `payments(provider_ref) WHERE provider = 'chapa'`.
- Voice notes: acknowledged + `voice_note_pending` recorded (marker in the
  job description, flag in `audit_log.diff`); transcription is out of MVP.
