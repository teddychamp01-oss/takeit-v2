# Take It — web app (`apps/web`)

Mobile-first PWA. Vite + React 18 + TypeScript + Tailwind v3. Amharic (am) is
the DEFAULT locale; English is second (SPEC C5).

## Run

From the **repo root** (npm workspace — no lockfile in this directory):

```sh
npm install                     # root, installs all workspaces
npm run dev -w apps/web
npm run typecheck -w apps/web
npm run test -w apps/web
npm run lint -w apps/web
npm run build -w apps/web       # tsc -b && vite build
```

## Environment

Copy `.env.example` (repo root) to `.env` and set:

| Name | Meaning |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (public) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public; RLS is the boundary) |
| `VITE_FEATURE_PAYMENTS_ENABLED` | `'true'`/`'1'` to enable; **defaults OFF** |
| `VITE_FEATURE_FAYDA_ENABLED` | `'true'`/`'1'` to enable; **defaults OFF** |

The app throws a clear error at startup if the Supabase values are missing.
The **service-role key must never appear anywhere under `apps/web/`** (SPEC
R5) — if you think you need it, the logic belongs in an edge function.

## Structure

```
src/
  lib/         i18n provider, supabase client, flags, format, phone (masking + detection)
  i18n/        message catalogs — index.ts merges per-namespace modules
  hooks/       useSession (single auth subscription)
  components/  shared UI (Button, WorkerCard, StatusBadge, MaskedPhone, …)
  features/    one folder per feature — route stubs feature agents replace
  routes.tsx   the routes contract (all paths registered as lazy imports)
```

## Rules for feature agents

- **Zero hardcoded UI strings.** Every user-facing string goes through
  `useT()`. Add keys to your namespace in `src/i18n/messages/<ns>.ts` — the
  `en` table is typed `Record<keyof typeof am, string>` so forgetting a
  translation is a compile error. Missing keys render the key string.
- **Money is integer cents** (`bigint` in the DB) + `'ETB'`. Display via
  `formatETB()`. Never float arithmetic on money.
- **Phones are masked pre-booking, everywhere** (SPEC C3). Render via
  `<MaskedPhone>`; use `containsPhoneNumber()` for the chat/job-text
  soft-warn. `src/components/__tests__/MaskedPhone.test.tsx` is the gate.
- **No state library, no icon library, no remote fonts** — React context +
  hooks, inline SVGs, system font stack (low-end-first, SPEC C6).
- Replace your feature's stub page files in place; `routes.tsx` already
  points at them.
