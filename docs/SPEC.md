# TAKE IT v2 — BUILD SPEC (contract for all agents)

Take It connects ID-verified workers (cleaners, tutors, repair workers, event
staff, errand runners, photographers, babysitters, diaspora property managers)
with customers in Addis Ababa. Motto: "Everybody has something to sell and to
service." Launch wedge: 8 categories, Bole sub-city first. Model: FULL-STACK
MANAGED marketplace (Urban Company model) — NOT lead-gen, NOT classifieds.
Trust is the product. v1 is dead; nothing is reused.

## Operating rules
- R1 AUDIT BEFORE EDIT: read the real file / query the real schema first.
- R2 NO FAKE "DONE": done = acceptance gate passed with real data.
- R3 NO SILENT SCOPE: extras go to docs/PROPOSALS.md, not into code silently.
- R4 Small conventional commits; migrations are numbered files, never edited
  after merge — fix-forward only.
- R5 SECRETS: never commit keys. `.env.example` names only. The service-role
  key never ships to any client (web, bot, or Lovable).
- R6 No paid cloud resources without founder approval.
- R7 Blocked on founder-only items → log in docs/BLOCKERS.md, keep moving.

## Hard constraints
- C1 NON-CUSTODIAL MONEY. Take It never holds user funds. Escrow routes
  through Chapa (charge → provider-held → release-on-confirmation via
  subaccount/split settlement). NO table may represent a Take It-owned user
  balance. (NBE PII licensing = ETB 100M capital = forbidden.)
- C2 PII MINIMIZATION (Proc. 1321/2024): no raw biometrics ever. Fayda: store
  only verification result, returned attributes, txn id, timestamp; Fayda
  numbers stored SHA-256+salt hashed, never plaintext. Manual-ID images:
  private bucket, deleted 30 days after decision. Every PII field documented
  in docs/compliance.md (data map + retention). Data-residency (in-country) is
  an open legal risk — design for future migration.
- C3 ANTI-DISINTERMEDIATION: phone numbers masked everywhere until a booking
  is confirmed. Chat is job-scoped. Soft-warn on sharing numbers pre-booking.
- C4 DUAL-ROLE: one account can be BOTH customer and worker.
- C5 LANGUAGE: Amharic (am) DEFAULT, English (en) second. i18n file from day
  one — zero hardcoded UI strings.
- C6 ANDROID-FIRST, LOW-END-FIRST: small payloads, offline-tolerant reads, no
  video, client-side image compression.
- C7 CURRENCY: ETB, integer cents (`amount_cents bigint` + `currency char(3)`).
- C8 Admin = role row in user_roles on a normal user, checked server-side via
  SECURITY DEFINER `has_role()`. No hardcoded admin credentials.

## Stack
- Monorepo: `/apps/web` (Vite React TS mobile-first PWA), `/apps/telegram-bot`
  (grammY, deployed as Supabase Edge Function webhook), `/supabase`
  (migrations, functions, seed), `/docs`.
- Supabase project (LIVE): ref `snfkefcluzkdeztdtdnk`, eu-central-1.
  Extensions: postgis, pg_cron, pgcrypto.
- Payments: Chapa sandbox behind `FEATURE_PAYMENTS_ENABLED=false`. Phase 1 is
  off-app payment logging.
- Identity: Fayda eSignet OIDC sandbox (mock personas, test OTP 111111) behind
  `FEATURE_FAYDA_ENABLED=false`; manual ID verification is the live path.
- Auth: Telegram-primary (bot deep-link + login-widget hash verified in an
  edge function that issues the Supabase session); SMS OTP fallback via
  Africa's Talking auth hook (NOT default Twilio). Both need founder tokens →
  until then email/password works as the dev path, clearly marked.
- AWS: nothing at MVP. Lovable: frontend generation only, never sees
  service-role key.

## Database schema v2 (Postgres, RLS ON for every table)
Conventions: uuid PKs (`gen_random_uuid()`), created_at/updated_at
timestamptz, soft-delete `deleted_at` where noted, money = amount_cents
bigint + currency char(3) default 'ETB', enums as Postgres enums.

- profiles: id (=auth.users.id), display_name, avatar_url, locale default
  'am', is_customer bool, is_worker bool, phone_masked, telegram_id,
  default_neighborhood, created_at
- user_roles: user_id, role enum('admin','ops','support') — set manually by
  founder in DB
- worker_profiles: user_id FK, bio, categories text[], skills, neighborhood,
  geo geography(Point,4326), travel_radius_km int, availability jsonb,
  availability_status enum('available_now','available_today','busy','off'),
  price_min_cents, price_max_cents, price_type, rating_avg numeric,
  review_count int, jobs_completed int,
  badge_level enum('new','rising','trusted','pro','top'),
  verification_level enum('none','basic','id_verified','fayda_verified',
  'pro_certified')
- verifications: id, user_id, method enum('manual_id','fayda_ekyc'), status
  enum('pending','approved','rejected'), fayda_txn_id, fayda_number_hash,
  attributes jsonb, id_front_path, id_back_path, selfie_path, reviewer_id,
  decided_at, notes
- guarantors: id, worker_id, guarantor_type enum('idir','equb','employer',
  'verified_worker'), guarantor_name, guarantor_contact_masked, statement,
  verified_by, status — community-vouching trust layer
- service_categories: slug PK, name_am, name_en, icon, sort, active,
  min_verification_level
- service_packages: id, category_slug, name_am/en, description, checklist
  jsonb, base_price_cents, duration_min — standardized offerings
- jobs: id, customer_id, category_slug, title, description,
  service_address_text, service_landmark, service_neighborhood, service_geo
  geography, is_diaspora bool, local_contact_name, local_contact_phone_masked,
  date_needed, time_window, budget_cents, workers_needed int, status
  enum('open','matched','in_progress','completed','cancelled','disputed'),
  created_at
- applications: id, job_id, worker_id, message, committed_window, status
  enum('pending','accepted','rejected','withdrawn')
- bookings: id, job_id, worker_id, customer_id, agreed_price_cents, status
  enum('confirmed','started','worker_done','customer_confirmed','disputed',
  'cancelled'), started_at, completed_at
- payments: id, booking_id, provider enum('chapa','offapp'), provider_ref,
  chapa_subaccount_id, amount_cents, commission_cents, status enum('logged',
  'initiated','held','released','refunded','failed'); 'offapp' rows are
  Phase-1 logging (customer_confirmed + worker_confirmed booleans)
- payouts: id, worker_id, payment_id, amount_cents, provider_ref, status
- messages: id, booking_id, sender_id, body, created_at, read_at — realtime
  enabled, job-scoped only
- reviews: id, booking_id, reviewer_id, reviewee_id, direction
  enum('c_to_w','w_to_c'), rating int 1-5, comment, created_at;
  UNIQUE(booking_id, reviewer_id); double-blind reveal after both submit or 48h
- reports: id, reporter_id, reported_id, booking_id, reason, description,
  status, resolved_by, notes
- disputes: id, booking_id, opened_by, reason, evidence jsonb, status,
  resolution, resolved_by
- guarantee_claims: id, booking_id, claimant_id, claim_type, amount_cents,
  status, decided_by — Take It Guarantee ledger (payouts via provider, C1)
- saved_workers: customer_id, worker_id, created_at
- business_accounts: id, owner_id, business_name, tin, type, active — schema
  only, no UI
- notifications: id, user_id, type, payload jsonb, read_at
- audit_log: id, actor_id, action, entity, entity_id, diff jsonb, created_at —
  written from RPCs/edge functions on every admin/state-machine change

Triggers/functions:
- auth signup → create profiles row
- reviews insert → recompute worker rating_avg/review_count
- booking + job status changes ONLY via SECURITY DEFINER RPCs enforcing the
  state machine (no direct status updates — RLS forbids direct UPDATE of
  status columns)
- GIST indexes on all geography columns; RPC nearby_workers(lat,lng,category,
  radius) using PostGIS
- pg_cron: auto-release 'worker_done' → 'customer_confirmed' after 24h
  (Phase 2, flag-gated; write the function now, don't schedule)

RLS principles:
- users read/write own rows only
- verified workers readable by all authenticated
- open jobs readable by workers whose categories match AND within
  travel_radius (via RPC)
- messages readable only by the two booking parties
- verifications: owner writes, only ops/admin read documents
- user_roles/audit_log: admin-only
- has_role(uid, role) SECURITY DEFINER backs all admin policies; pin ACLs —
  REVOKE PUBLIC EXECUTE on SECURITY DEFINER functions

## Frontend rules
- Mobile-first PWA. Bottom nav: Home, Browse, Post(+), Inbox, Me.
- Palette: primary orange #F97316, cream background, dark navy ink, green
  verified badge. Trust signals (verified badge, rating, jobs count) on every
  worker surface.
- ≤3 primary actions per screen. Status badges: Open / Matched / In Progress /
  Done / Disputed. "Available Now" green-dot section on Home.
- Neighborhoods: Bole, Kazanchis, CMC, Sarbet, Piazza, Kirkos, Yeka. Landmark
  text field on every address input.
- Post-a-job uses the TWO-LOCATION model (service address ≠ current GPS) +
  diaspora toggle (is_diaspora, local contact name + masked phone).
- No localStorage-dependent business logic; all business logic server-side.

## Categories (launch set)
home-cleaning, babysitting-care (min level fayda_verified), tutors,
repairs-handyman, event-staffing, errands-city-help, photography,
diaspora-property.

## Seed
8 workers + 5 open jobs (realistic Ethiopian names, neighborhoods, ETB
prices), all is_seed=true so they're filterable/deletable at launch. All 8
categories with am+en names; 2-3 service_packages each with checklists.

## Acceptance gates (definition of done)
- Migrations apply clean on fresh db; RLS tested with 3 personas (customer,
  worker, admin) — cross-access DENIED.
- Integration flow passes: signup→post job→apply→book→chat→complete→review
  updates rating.
- No service-role key in any client bundle (grep the build).
- Phones never rendered unmasked pre-booking (test).
- Amharic default renders on fresh device. Lighthouse mobile ≥80 on Home.
- Every human-testable item appended to docs/TESTPLAN.md.

## NOT building (MVP)
Goods/classifieds, own wallet/float, video uploads, AI matching, iOS native,
multi-city, B2B UI (schema only), push campaigns, public API, M-Pesa.

## Env names (.env.example — names only)
SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY /
CHAPA_SECRET_KEY_TEST / CHAPA_WEBHOOK_SECRET / TELEGRAM_BOT_TOKEN /
TELEGRAM_LOGIN_DOMAIN / AFRICASTALKING_API_KEY / AFRICASTALKING_USERNAME /
FAYDA_ESIGNET_CLIENT_ID / FAYDA_ESIGNET_REDIRECT_URI /
FEATURE_PAYMENTS_ENABLED=false / FEATURE_FAYDA_ENABLED=false

## Research-report deltas folded in (Aug 2026 report)
- Chapa is Telegram's exclusive payment provider in Africa → in-Telegram
  payments later; Chapa split/subaccount = the escrow rail; confirm true
  hold-then-release with Chapa (BLOCKERS).
- Fayda: 49.1M enrolled; eKYC-Partner via partner.fayda.et under a FISP;
  eSignet OIDC; sandbox mock personas + OTP 111111.
- Guarantor layer (idir/equb/employer/verified-worker vouching) is a genuine
  differentiator — capture in S4.
- Diaspora-pays-for-family is a first-class flow (USD 7B+ remittances).
- Data residency (Proc. 1321/2024 localization) unresolved → compliance.md
  top-3 risk; plan in-country migration path.
- Avoid: custody of funds, pure lead-gen, M-Pesa bets, over-expansion.
