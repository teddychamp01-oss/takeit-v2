# Take It v2

Verified gig/services marketplace for Addis Ababa. Full-stack managed
marketplace (Urban Company model) — trust is the product.

> "Everybody has something to sell and to service."

## Layout

| Path | What |
|---|---|
| `apps/web` | React (Vite) mobile-first PWA — Amharic default, English second |
| `apps/telegram-bot` | grammY bot, deployed as a Supabase Edge Function webhook |
| `supabase/migrations` | Numbered SQL migrations (never edited after merge — fix-forward) |
| `supabase/functions` | Edge functions (telegram-auth, telegram-webhook, chapa-webhook) |
| `supabase/seed` | Seed data (8 categories, packages, seed workers/jobs, `is_seed=true`) |
| `docs` | SPEC, ARCHITECTURE, compliance (PII map), TESTPLAN, BLOCKERS, PROPOSALS |

## Ground rules (short form — full contract in `docs/SPEC.md`)

- **Non-custodial money.** All funds flow through licensed providers (Chapa).
  No table may ever represent a Take It-held balance.
- **PII minimization.** No raw biometrics; Fayda numbers hashed; ID images
  private + time-limited. See `docs/compliance.md`.
- **Phones masked** until a booking is confirmed. Chat is job-scoped.
- **Amharic default.** Zero hardcoded UI strings.
- **Secrets never committed.** `.env.example` names only; service-role key
  never reaches a client.

## Develop

```bash
npm install
npm run typecheck && npm run lint && npm run test && npm run build
```

Copy `.env.example` → `apps/web/.env` and fill the `VITE_`-prefixed values
(Supabase URL + anon/publishable key only).
