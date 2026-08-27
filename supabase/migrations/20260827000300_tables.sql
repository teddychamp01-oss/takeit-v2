-- =============================================================================
-- Take It v2 — 000300 tables
-- All tables from SPEC.md "Database schema v2". Conventions: uuid PKs
-- (gen_random_uuid()), created_at/updated_at timestamptz, money = amount_cents
-- bigint + currency char(3) default 'ETB' (C7).
--
-- C1 NON-CUSTODIAL: no table anywhere in this schema represents a Take It-held
-- user balance. payments/payouts/guarantee_claims record PROVIDER-side flows
-- (Chapa hold/release) or off-app logging only.
--
-- C3 phone masking: *_phone_masked / *_contact_masked columns carry a CHECK
-- rejecting 7+ consecutive digits, so a raw phone number cannot be stored in
-- them even by a buggy client or RPC.
--
-- C2: fayda_number_hash must look like SHA-256 hex (64 hex chars) — a raw
-- Fayda number cannot be stored in that column.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users, created by the signup trigger)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  display_name         text not null default '' check (char_length(display_name) <= 80),
  avatar_url           text check (avatar_url is null or char_length(avatar_url) <= 500),
  locale               text not null default 'am' check (locale in ('am', 'en')),
  is_customer          boolean not null default true,
  is_worker            boolean not null default false,
  phone_masked         text check (phone_masked is null or
                         (char_length(phone_masked) <= 32 and phone_masked !~ '[0-9]{7,}')),
  telegram_id          text unique check (telegram_id is null or char_length(telegram_id) <= 32),
  default_neighborhood text check (default_neighborhood is null or
                         char_length(default_neighborhood) <= 80),
  is_seed              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on column public.profiles.phone_masked is
  'C3: always stored masked; CHECK rejects 7+ consecutive digits (raw numbers cannot land here).';

-- ---------------------------------------------------------------------------
-- user_roles (C8: admin = role row on a normal user, set manually by founder)
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is
  'C8: set manually by founder (service_role/SQL). No client write path exists.';

-- ---------------------------------------------------------------------------
-- worker_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.worker_profiles (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  bio                 text check (bio is null or char_length(bio) <= 2000),
  categories          text[] not null default '{}',
  skills              text[] not null default '{}',
  neighborhood        text check (neighborhood is null or char_length(neighborhood) <= 80),
  geo                 extensions.geography(Point, 4326),
  travel_radius_km    integer not null default 10 check (travel_radius_km between 1 and 100),
  availability        jsonb not null default '{}'::jsonb,
  availability_status public.availability_status not null default 'off',
  price_min_cents     bigint check (price_min_cents is null or price_min_cents >= 0),
  price_max_cents     bigint check (price_max_cents is null or price_max_cents >= 0),
  price_type          text check (price_type is null or
                        price_type in ('hourly', 'fixed', 'per_task', 'negotiable')),
  rating_avg          numeric(3,2) not null default 0 check (rating_avg >= 0 and rating_avg <= 5),
  review_count        integer not null default 0 check (review_count >= 0),
  jobs_completed      integer not null default 0 check (jobs_completed >= 0),
  badge_level         public.badge_level not null default 'new',
  verification_level  public.verification_level not null default 'none',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint worker_profiles_price_order
    check (price_min_cents is null or price_max_cents is null
           or price_min_cents <= price_max_cents)
);
create index if not exists worker_profiles_geo_gist
  on public.worker_profiles using gist (geo);
create index if not exists worker_profiles_categories_gin
  on public.worker_profiles using gin (categories);

-- ---------------------------------------------------------------------------
-- verifications (C2: PII-minimized; images live in the private bucket)
-- ---------------------------------------------------------------------------
create table if not exists public.verifications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  method            public.verification_method not null,
  status            public.verification_status not null default 'pending',
  fayda_txn_id      text check (fayda_txn_id is null or char_length(fayda_txn_id) <= 128),
  fayda_number_hash text check (fayda_number_hash is null or fayda_number_hash ~ '^[0-9a-f]{64}$'),
  attributes        jsonb,
  id_front_path     text check (id_front_path is null or char_length(id_front_path) <= 500),
  id_back_path      text check (id_back_path is null or char_length(id_back_path) <= 500),
  selfie_path       text check (selfie_path is null or char_length(selfie_path) <= 500),
  reviewer_id       uuid references public.profiles (id) on delete set null,
  decided_at        timestamptz,
  notes             text check (notes is null or char_length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on column public.verifications.fayda_number_hash is
  'C2: SHA-256(salt || fayda_number) hex only — CHECK forbids anything that is not 64 hex chars.';
create index if not exists verifications_user_idx   on public.verifications (user_id);
create index if not exists verifications_status_idx on public.verifications (status);

-- ---------------------------------------------------------------------------
-- guarantors (community vouching: idir/equb/employer/verified worker)
-- ---------------------------------------------------------------------------
create table if not exists public.guarantors (
  id                       uuid primary key default gen_random_uuid(),
  worker_id                uuid not null references public.worker_profiles (user_id) on delete cascade,
  guarantor_type           public.guarantor_type not null,
  guarantor_name           text not null check (char_length(guarantor_name) between 1 and 120),
  guarantor_contact_masked text check (guarantor_contact_masked is null or
                             (char_length(guarantor_contact_masked) <= 64
                              and guarantor_contact_masked !~ '[0-9]{7,}')),
  statement                text check (statement is null or char_length(statement) <= 2000),
  verified_by              uuid references public.profiles (id) on delete set null,
  status                   public.guarantor_status not null default 'pending',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists guarantors_worker_idx on public.guarantors (worker_id);

-- ---------------------------------------------------------------------------
-- service_categories / service_packages (catalog)
-- ---------------------------------------------------------------------------
create table if not exists public.service_categories (
  slug                   text primary key check (slug ~ '^[a-z0-9-]{2,60}$'),
  name_am                text not null check (char_length(name_am) <= 80),
  name_en                text not null check (char_length(name_en) <= 80),
  icon                   text check (icon is null or char_length(icon) <= 16),
  sort                   integer not null default 0,
  active                 boolean not null default true,
  min_verification_level public.verification_level not null default 'none',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.service_packages (
  id               uuid primary key default gen_random_uuid(),
  category_slug    text not null references public.service_categories (slug),
  name_am          text not null check (char_length(name_am) <= 120),
  name_en          text not null check (char_length(name_en) <= 120),
  description      text check (description is null or char_length(description) <= 2000),
  checklist        jsonb not null default '[]'::jsonb,
  base_price_cents bigint not null check (base_price_cents >= 0),
  currency         char(3) not null default 'ETB',
  duration_min     integer check (duration_min is null or duration_min between 5 and 1440),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists service_packages_category_idx
  on public.service_packages (category_slug);

-- ---------------------------------------------------------------------------
-- jobs (two-location model: service address is typed, not the poster's GPS)
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id                         uuid primary key default gen_random_uuid(),
  customer_id                uuid not null references public.profiles (id) on delete cascade,
  category_slug              text not null references public.service_categories (slug),
  title                      text not null check (char_length(title) between 5 and 120),
  description                text check (description is null or char_length(description) <= 5000),
  service_address_text       text check (service_address_text is null or
                               char_length(service_address_text) <= 500),
  service_landmark           text check (service_landmark is null or
                               char_length(service_landmark) <= 200),
  service_neighborhood       text check (service_neighborhood is null or
                               char_length(service_neighborhood) <= 80),
  service_geo                extensions.geography(Point, 4326),
  is_diaspora                boolean not null default false,
  local_contact_name         text check (local_contact_name is null or
                               char_length(local_contact_name) <= 120),
  local_contact_phone_masked text check (local_contact_phone_masked is null or
                               (char_length(local_contact_phone_masked) <= 32
                                and local_contact_phone_masked !~ '[0-9]{7,}')),
  date_needed                date,
  time_window                text check (time_window is null or char_length(time_window) <= 120),
  budget_cents               bigint check (budget_cents is null or budget_cents >= 0),
  currency                   char(3) not null default 'ETB',
  workers_needed             integer not null default 1 check (workers_needed between 1 and 20),
  status                     public.job_status not null default 'open',
  is_seed                    boolean not null default false,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint jobs_diaspora_needs_local_contact
    check (not is_diaspora or local_contact_name is not null)
);
create index if not exists jobs_service_geo_gist on public.jobs using gist (service_geo);
create index if not exists jobs_status_category_idx on public.jobs (status, category_slug);
create index if not exists jobs_customer_idx on public.jobs (customer_id);

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------
create table if not exists public.applications (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references public.jobs (id) on delete cascade,
  worker_id        uuid not null references public.profiles (id) on delete cascade,
  message          text check (message is null or char_length(message) <= 1000),
  committed_window text check (committed_window is null or char_length(committed_window) <= 120),
  status           public.application_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (job_id, worker_id)
);
create index if not exists applications_worker_idx on public.applications (worker_id);

-- ---------------------------------------------------------------------------
-- bookings (status changes ONLY via SECURITY DEFINER RPCs)
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references public.jobs (id) on delete cascade,
  worker_id          uuid not null references public.profiles (id) on delete cascade,
  customer_id        uuid not null references public.profiles (id) on delete cascade,
  agreed_price_cents bigint not null check (agreed_price_cents >= 0),
  currency           char(3) not null default 'ETB',
  status             public.booking_status not null default 'confirmed',
  started_at         timestamptz,
  worker_done_at     timestamptz, -- anchor for the 24h auto-release (Phase 2)
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (job_id, worker_id)
);
create index if not exists bookings_worker_idx   on public.bookings (worker_id);
create index if not exists bookings_customer_idx on public.bookings (customer_id);
create index if not exists bookings_status_idx   on public.bookings (status);

-- ---------------------------------------------------------------------------
-- payments (C1: provider-side money only; 'offapp' rows are Phase-1 logging)
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.bookings (id) on delete cascade,
  provider            public.payment_provider not null,
  provider_ref        text check (provider_ref is null or char_length(provider_ref) <= 128),
  chapa_subaccount_id text check (chapa_subaccount_id is null or
                        char_length(chapa_subaccount_id) <= 128),
  amount_cents        bigint not null check (amount_cents >= 0),
  commission_cents    bigint not null default 0 check (commission_cents >= 0),
  currency            char(3) not null default 'ETB',
  status              public.payment_status not null default 'logged',
  customer_confirmed  boolean not null default false,
  worker_confirmed    boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.payments is
  'C1 NON-CUSTODIAL: records Chapa provider-held escrow states or off-app logs. Never a Take It-held balance.';
create index if not exists payments_booking_idx on public.payments (booking_id);
-- one off-app log per booking
create unique index if not exists payments_one_offapp_per_booking
  on public.payments (booking_id) where (provider = 'offapp');

-- ---------------------------------------------------------------------------
-- payouts (provider-executed; C1 applies)
-- ---------------------------------------------------------------------------
create table if not exists public.payouts (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references public.profiles (id) on delete cascade,
  payment_id   uuid references public.payments (id) on delete set null,
  amount_cents bigint not null check (amount_cents >= 0),
  currency     char(3) not null default 'ETB',
  provider_ref text check (provider_ref is null or char_length(provider_ref) <= 128),
  status       public.payout_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.payouts is
  'C1 NON-CUSTODIAL: mirror of provider (Chapa) payouts. Not a balance.';
create index if not exists payouts_worker_idx on public.payouts (worker_id);

-- ---------------------------------------------------------------------------
-- messages (booking-scoped chat; realtime; RLS = the two parties only)
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists messages_booking_created_idx
  on public.messages (booking_id, created_at);

-- ---------------------------------------------------------------------------
-- reviews (double-blind: hidden until both sides submit or 48h passes)
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings (id) on delete cascade,
  reviewer_id  uuid not null references public.profiles (id) on delete cascade,
  reviewee_id  uuid not null references public.profiles (id) on delete cascade,
  direction    public.review_direction not null,
  rating       integer not null check (rating between 1 and 5),
  comment      text check (comment is null or char_length(comment) <= 1000),
  is_published boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (booking_id, reviewer_id)
);
create index if not exists reviews_reviewee_idx on public.reviews (reviewee_id);

-- ---------------------------------------------------------------------------
-- reports / disputes / guarantee_claims
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  booking_id  uuid references public.bookings (id) on delete set null,
  reason      text not null check (char_length(reason) between 1 and 200),
  description text check (description is null or char_length(description) <= 5000),
  status      public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  notes       text check (notes is null or char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status);

create table if not exists public.disputes (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  opened_by   uuid not null references public.profiles (id) on delete cascade,
  reason      text not null check (char_length(reason) between 1 and 2000),
  evidence    jsonb not null default '[]'::jsonb,
  status      public.dispute_status not null default 'open',
  resolution  text check (resolution is null or char_length(resolution) <= 2000),
  resolved_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists disputes_booking_idx on public.disputes (booking_id);

create table if not exists public.guarantee_claims (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings (id) on delete cascade,
  claimant_id  uuid not null references public.profiles (id) on delete cascade,
  claim_type   text not null check (claim_type in
                 ('damage', 'theft', 'no_show', 'quality', 'safety', 'other')),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  currency     char(3) not null default 'ETB',
  status       public.claim_status not null default 'submitted',
  decided_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.guarantee_claims is
  'C1: Take It Guarantee ledger of DECISIONS; any payout is executed by the provider, never from a Take It balance.';
create index if not exists guarantee_claims_booking_idx on public.guarantee_claims (booking_id);

-- ---------------------------------------------------------------------------
-- saved_workers / business_accounts / notifications / audit_log
-- ---------------------------------------------------------------------------
create table if not exists public.saved_workers (
  customer_id uuid not null references public.profiles (id) on delete cascade,
  worker_id   uuid not null references public.worker_profiles (user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, worker_id)
);

create table if not exists public.business_accounts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  business_name text not null check (char_length(business_name) between 1 and 200),
  tin           text check (tin is null or char_length(tin) <= 32),
  type          text check (type is null or char_length(type) <= 80),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.business_accounts is 'Schema only at MVP — no UI (SPEC).';

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (char_length(type) <= 60),
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid,             -- no FK on purpose: audit rows outlive accounts
  action     text not null check (char_length(action) <= 80),
  entity     text not null check (char_length(entity) <= 80),
  entity_id  uuid,
  diff       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_entity_idx  on public.audit_log (entity, entity_id);
create index if not exists audit_log_created_idx on public.audit_log (created_at);
