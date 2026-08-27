-- =============================================================================
-- Take It v2 — seed data (launch content, Bole-first)
--
-- * Everything user-shaped is is_seed = true → filterable/deletable at launch.
-- * Re-runnable: every insert is ON CONFLICT DO NOTHING on a fixed key
--   (fixed UUIDs); the profile field updates are deterministic and idempotent.
-- * Run as postgres/service_role AFTER all migrations (the signup trigger and
--   the phone-mask CHECKs must exist). Applies unchanged on the CI shim.
-- * Prices are ESTIMATE values — plausible Addis Ababa market prices chosen
--   for demo realism, not measured market data. All money integer cents, ETB.
-- * Coordinates are approximate points inside each named neighborhood
--   (ESTIMATE, for map demos — not surveyed addresses).
-- * Seed auth users can never log in: password is bcrypt of a throwaway
--   literal and no client ever learns it. Emails use the reserved-for-
--   documentation style *@seed.takeit.example.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Service categories (8 — SPEC launch set) — am first (C5)
-- ---------------------------------------------------------------------------
insert into public.service_categories
  (slug, name_am, name_en, icon, sort, active, min_verification_level)
values
  ('home-cleaning',    'የቤት ጽዳት',            'Home Cleaning',      '🧹', 10, true, 'none'),
  ('babysitting-care', 'የሕፃናት እንክብካቤ',      'Babysitting & Care', '🧸', 20, true, 'fayda_verified'),
  ('tutors',           'የቤት አስጠኚ',           'Tutors',             '📚', 30, true, 'none'),
  ('repairs-handyman', 'የቤት ጥገና',            'Repairs & Handyman', '🔧', 40, true, 'none'),
  ('event-staffing',   'የዝግጅት ሠራተኞች',       'Event Staffing',     '🎉', 50, true, 'none'),
  ('errands-city-help','መልእክት እና የከተማ እገዛ', 'Errands & City Help','🛵', 60, true, 'none'),
  ('photography',      'ፎቶግራፍ',              'Photography',        '📷', 70, true, 'none'),
  ('diaspora-property','የዲያስፖራ ንብረት እንክብካቤ','Diaspora Property',  '🏠', 80, true, 'none')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Service packages (2-3 per category; checklist items are {am,en} pairs)
-- ---------------------------------------------------------------------------
insert into public.service_packages
  (id, category_slug, name_am, name_en, description, checklist, base_price_cents, duration_min)
values
  -- home-cleaning
  ('b0000000-0000-4000-8000-000000000001', 'home-cleaning',
   'መደበኛ ጽዳት (እስከ 3 ክፍል)', 'Standard Clean (up to 3 rooms)',
   'ለመደበኛ ሳምንታዊ ጽዳት',
   '[{"am":"ወለል መጥረግ እና በውሃ ማጽዳት","en":"Sweep and mop all floors"},
     {"am":"አቧራ ማራገፍ","en":"Dust surfaces"},
     {"am":"መታጠቢያ ቤት ማጽዳት","en":"Clean bathroom"},
     {"am":"ቆሻሻ ማውጣት","en":"Take out trash"}]'::jsonb,
   90000, 180),
  ('b0000000-0000-4000-8000-000000000002', 'home-cleaning',
   'ጥልቅ ጽዳት', 'Deep Clean',
   'ወጥ ቤትና መስኮቶችን ጨምሮ ሙሉ ጽዳት',
   '[{"am":"የመደበኛ ጽዳት ሁሉም ሥራዎች","en":"Everything in Standard Clean"},
     {"am":"የወጥ ቤት ዕቃዎች ውስጥና ውጭ","en":"Inside/outside kitchen units"},
     {"am":"መስኮቶች እና መጋረጃ ሐዲዶች","en":"Windows and curtain rails"},
     {"am":"ከአልጋ/ሶፋ ሥር ማጽዳት","en":"Under beds and sofas"}]'::jsonb,
   220000, 360),
  ('b0000000-0000-4000-8000-000000000003', 'home-cleaning',
   'የመግቢያ/መውጫ ጽዳት', 'Move-in / Move-out Clean',
   'ባዶ ቤት ርክክብ ጽዳት',
   '[{"am":"ግድግዳ እና በሮች መጥረግ","en":"Wipe walls and doors"},
     {"am":"ወለል በጥልቀት ማጽዳት","en":"Deep-clean floors"},
     {"am":"የቁም ሳጥኖች ውስጥ","en":"Inside wardrobes"}]'::jsonb,
   300000, 420),

  -- babysitting-care
  ('b0000000-0000-4000-8000-000000000004', 'babysitting-care',
   'የማታ ሞግዚት (3 ሰዓት)', 'Evening Sit (3 hours)',
   'ለምሽት ፕሮግራም አጭር እንክብካቤ',
   '[{"am":"ልጆችን መጠበቅ እና መጫወት","en":"Supervise and play"},
     {"am":"እራት ማብላት","en":"Serve dinner"},
     {"am":"የመኝታ ሰዓት ማዘጋጀት","en":"Bedtime routine"}]'::jsonb,
   50000, 180),
  ('b0000000-0000-4000-8000-000000000005', 'babysitting-care',
   'የግማሽ ቀን እንክብካቤ', 'Half-day Care',
   'ጠዋት ወይም ከሰዓት 4 ሰዓት',
   '[{"am":"ምግብ እና መክሰስ","en":"Meals and snacks"},
     {"am":"የቤት ሥራ እገዛ","en":"Homework help"},
     {"am":"የውጭ ጨዋታ","en":"Outdoor play"}]'::jsonb,
   70000, 240),
  ('b0000000-0000-4000-8000-000000000006', 'babysitting-care',
   'ሙሉ ቀን እንክብካቤ', 'Full-day Care',
   'ከጠዋት እስከ ማታ (10 ሰዓት)',
   '[{"am":"ሙሉ ቀን ክትትል","en":"All-day supervision"},
     {"am":"ምግብ ማብሰል እና ማብላት","en":"Cook and serve meals"},
     {"am":"የእንቅልፍ ሰዓት","en":"Nap time"}]'::jsonb,
   120000, 600),

  -- tutors
  ('b0000000-0000-4000-8000-000000000007', 'tutors',
   'የ1ኛ-8ኛ ክፍል ትምህርት (2 ሰዓት)', 'Grades 1-8 Session (2 hours)',
   'ሒሳብ፣ እንግሊዝኛ፣ ሳይንስ',
   '[{"am":"የቤት ሥራ ክለሳ","en":"Homework review"},
     {"am":"አዲስ ትምህርት ማስረዳት","en":"Teach new material"},
     {"am":"የልምምድ ጥያቄዎች","en":"Practice questions"}]'::jsonb,
   50000, 120),
  ('b0000000-0000-4000-8000-000000000008', 'tutors',
   'የፈተና ዝግጅት (2 ሰዓት)', 'Exam Prep Session (2 hours)',
   'ለ8ኛ/12ኛ ክፍል ሚኒስትሪ እና መልቀቂያ ፈተና',
   '[{"am":"ያለፉ ፈተናዎች መስራት","en":"Past-paper practice"},
     {"am":"ደካማ ጎን መለየት","en":"Identify weak areas"},
     {"am":"የጥናት ዕቅድ","en":"Study plan"}]'::jsonb,
   80000, 120),

  -- repairs-handyman
  ('b0000000-0000-4000-8000-000000000009', 'repairs-handyman',
   'ምርመራ እና ግምት', 'Callout & Diagnosis',
   'ችግሩን መርምሮ የዋጋ ግምት መስጠት',
   '[{"am":"ችግሩን መመርመር","en":"Inspect the problem"},
     {"am":"የጥገና ዋጋ ግምት","en":"Repair quote"},
     {"am":"አስቸኳይ ጊዜያዊ መፍትሔ","en":"Emergency temporary fix"}]'::jsonb,
   35000, 60),
  ('b0000000-0000-4000-8000-000000000010', 'repairs-handyman',
   'የቧንቧ ጥገና', 'Plumbing Fix',
   'ፍሳሽ፣ ቧንቧ እና የውሃ መስመር',
   '[{"am":"ፍሳሽ ማቆም","en":"Stop leaks"},
     {"am":"ቧንቧ/ማጠቢያ መተካት","en":"Replace tap/sink parts"},
     {"am":"የውሃ ግፊት ማጣራት","en":"Check water pressure"}]'::jsonb,
   90000, 120),
  ('b0000000-0000-4000-8000-000000000011', 'repairs-handyman',
   'የኤሌክትሪክ ጥገና', 'Electrical Fix',
   'ሶኬት፣ መብራት እና ማብሪያ/ማጥፊያ',
   '[{"am":"ሶኬት/ማብሪያ መተካት","en":"Replace sockets/switches"},
     {"am":"መብራት መግጠም","en":"Install light fixtures"},
     {"am":"የደህንነት ፍተሻ","en":"Safety check"}]'::jsonb,
   90000, 120),

  -- event-staffing
  ('b0000000-0000-4000-8000-000000000012', 'event-staffing',
   'አስተናጋጅ (አንድ ዝግጅት)', 'Event Server (one event)',
   'ለሠርግ፣ ልደት እና ስብሰባ',
   '[{"am":"እንግዳ መቀበል","en":"Welcome guests"},
     {"am":"ምግብ እና መጠጥ ማቅረብ","en":"Serve food and drinks"},
     {"am":"ማጽዳት እና ማሰናዳት","en":"Clear and reset"}]'::jsonb,
   80000, 480),
  ('b0000000-0000-4000-8000-000000000013', 'event-staffing',
   'የዝግጅት ማዘጋጃ ቡድን አባል', 'Setup Crew Member',
   'ወንበር/ጠረጴዛ ዝርጋታ እና ማስዋብ',
   '[{"am":"ወንበርና ጠረጴዛ መዘርጋት","en":"Set up tables and chairs"},
     {"am":"ማስዋብ","en":"Decoration"},
     {"am":"ከዝግጅቱ በኋላ ማፍረስ","en":"Teardown after event"}]'::jsonb,
   70000, 300),

  -- errands-city-help
  ('b0000000-0000-4000-8000-000000000014', 'errands-city-help',
   'የገበያ ግዢ', 'Grocery Run',
   'ከመርካቶ/ሱቅ ገዝቶ ማድረስ',
   '[{"am":"ዝርዝር መቀበል","en":"Receive shopping list"},
     {"am":"መግዛት እና ደረሰኝ መያዝ","en":"Buy and keep receipts"},
     {"am":"እስከ በር ማድረስ","en":"Deliver to door"}]'::jsonb,
   25000, 90),
  ('b0000000-0000-4000-8000-000000000015', 'errands-city-help',
   'መደበኛ መልእክት', 'Standard Errand',
   'ሰነድ ማድረስ፣ ዕቃ መውሰድ',
   '[{"am":"መረከብ","en":"Pick up"},
     {"am":"በሰዓቱ ማድረስ","en":"Deliver on time"},
     {"am":"ማረጋገጫ ፎቶ","en":"Proof photo"}]'::jsonb,
   30000, 120),
  ('b0000000-0000-4000-8000-000000000016', 'errands-city-help',
   'ወረፋ እና የመንግሥት ጉዳይ እገዛ', 'Queue & Paperwork Help',
   'ወረፋ መጠበቅ እና ሰነድ ማስፈጸም',
   '[{"am":"ወረፋ መያዝ","en":"Hold your place in line"},
     {"am":"ስለሂደቱ ማሳወቅ","en":"Progress updates"},
     {"am":"ሰነድ ማድረስ","en":"Deliver documents"}]'::jsonb,
   50000, 240),

  -- photography
  ('b0000000-0000-4000-8000-000000000017', 'photography',
   'የፎቶ ሰዓት (ፖርትሬት)', 'Portrait Session',
   '1.5 ሰዓት፣ 20 የተስተካከሉ ፎቶዎች',
   '[{"am":"የቦታ ምርጫ ምክር","en":"Location advice"},
     {"am":"1.5 ሰዓት ቀረጻ","en":"1.5h shoot"},
     {"am":"20 የተስተካከሉ ፎቶዎች","en":"20 edited photos"}]'::jsonb,
   200000, 90),
  ('b0000000-0000-4000-8000-000000000018', 'photography',
   'የዝግጅት ሽፋን (2 ሰዓት)', 'Event Coverage (2 hours)',
   'ልደት፣ ምረቃ፣ ትንንሽ ዝግጅቶች',
   '[{"am":"2 ሰዓት ቀረጻ","en":"2h coverage"},
     {"am":"60+ የተስተካከሉ ፎቶዎች","en":"60+ edited photos"},
     {"am":"በ5 ቀን ማድረስ","en":"Delivery within 5 days"}]'::jsonb,
   350000, 120),
  ('b0000000-0000-4000-8000-000000000019', 'photography',
   'የሠርግ ግማሽ ቀን', 'Wedding Half-day',
   '5 ሰዓት ሙሉ ሽፋን',
   '[{"am":"5 ሰዓት ቀረጻ","en":"5h coverage"},
     {"am":"200+ ፎቶዎች","en":"200+ photos"},
     {"am":"የመታሰቢያ አልበም ዲዛይን","en":"Album design"}]'::jsonb,
   700000, 300),

  -- diaspora-property
  ('b0000000-0000-4000-8000-000000000020', 'diaspora-property',
   'የቤት ፍተሻ እና የፎቶ ሪፖርት', 'Property Check + Photo Report',
   'በየወሩ ቤትዎን ጎብኝቶ ሪፖርት',
   '[{"am":"የቤት ጉብኝት","en":"Site visit"},
     {"am":"ፎቶ እና ቪዲዮ ሪፖርት","en":"Photo report"},
     {"am":"የችግር ማንቂያ","en":"Issue alerts"}]'::jsonb,
   150000, 120),
  ('b0000000-0000-4000-8000-000000000021', 'diaspora-property',
   'የክፍያ እና የሰነድ መልእክት', 'Utility & Paperwork Errand',
   'መብራት/ውሃ ክፍያ እና የመንግሥት ጉዳይ',
   '[{"am":"ክፍያ መፈጸም","en":"Pay bills"},
     {"am":"ደረሰኝ ፎቶ መላክ","en":"Send receipt photos"},
     {"am":"ሰነድ ማሳደስ ክትትል","en":"Document renewals"}]'::jsonb,
   80000, 180),
  ('b0000000-0000-4000-8000-000000000022', 'diaspora-property',
   'የግንባታ/እድሳት ክትትል ጉብኝት', 'Renovation Supervision Visit',
   'የሥራ ሂደት ማረጋገጫ ጉብኝት',
   '[{"am":"የሥራ ሂደት ፍተሻ","en":"Progress inspection"},
     {"am":"ከሥራ ተቋራጭ ጋር መነጋገር","en":"Contractor liaison"},
     {"am":"ዝርዝር ሪፖርት","en":"Detailed report"}]'::jsonb,
   250000, 240)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Seed auth.users (8 workers + 2 customers). The signup trigger creates
--    the profiles rows; the explicit insert below is a fallback so the seed
--    also works if a user row already existed.
-- ---------------------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'seed.worker1@seed.takeit.example',
   extensions.crypt('seed-disabled', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"አበበ ታደሰ","locale":"am"}'::jsonb, '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'seed.worker2@seed.takeit.example',
   extensions.crypt('seed-disabled', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"ሃና ግርማ","locale":"am"}'::jsonb, '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'seed.worker3@seed.takeit.example',
   extensions.crypt('seed-disabled', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"ዳዊት በቀለ","locale":"am"}'::jsonb, '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'seed.worker4@seed.takeit.example',
   extensions.crypt('seed-disabled', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"ሰላም ተስፋዬ","locale":"am"}'::jsonb, '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 'seed.worker5@seed.takeit.example',
   extensions.crypt('seed-disabled', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"ዮሐንስ ዓለሙ","locale":"am"}'::jsonb, '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000006',
   'authenticated', 'authenticated', 'seed.worker6@seed.takeit.example',
   extensions.crypt('seed-disabled', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"ሜሮን ኃይሌ","locale":"am"}'::jsonb, '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000007',
   'authenticated', 'authenticated', 'seed.worker7@seed.takeit.example',
   extensions.crypt('seed-disabled', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"ትዕግሥት አሰፋ","locale":"am"}'::jsonb, '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000008',
   'authenticated', 'authenticated', 'seed.worker8@seed.takeit.example',
   extensions.crypt('seed-disabled', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"በረከት ፍቅሬ","locale":"am"}'::jsonb, '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'seed.customer1@seed.takeit.example',
   extensions.crypt('seed-disabled', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"ማርታ ከበደ","locale":"am"}'::jsonb, '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'seed.customer2@seed.takeit.example',
   extensions.crypt('seed-disabled', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Samuel Gebremedhin","locale":"en"}'::jsonb, '', '', '', '', now(), now())
on conflict (id) do nothing;

-- fallback profile rows (normally created by the signup trigger)
insert into public.profiles (id, display_name, locale)
values
  ('a0000000-0000-4000-8000-000000000001', 'አበበ ታደሰ', 'am'),
  ('a0000000-0000-4000-8000-000000000002', 'ሃና ግርማ', 'am'),
  ('a0000000-0000-4000-8000-000000000003', 'ዳዊት በቀለ', 'am'),
  ('a0000000-0000-4000-8000-000000000004', 'ሰላም ተስፋዬ', 'am'),
  ('a0000000-0000-4000-8000-000000000005', 'ዮሐንስ ዓለሙ', 'am'),
  ('a0000000-0000-4000-8000-000000000006', 'ሜሮን ኃይሌ', 'am'),
  ('a0000000-0000-4000-8000-000000000007', 'ትዕግሥት አሰፋ', 'am'),
  ('a0000000-0000-4000-8000-000000000008', 'በረከት ፍቅሬ', 'am'),
  ('c0000000-0000-4000-8000-000000000001', 'ማርታ ከበደ', 'am'),
  ('c0000000-0000-4000-8000-000000000002', 'Samuel Gebremedhin', 'en')
on conflict (id) do nothing;

-- deterministic profile facts (idempotent on re-run)
update public.profiles set
  is_seed = true, is_worker = true, is_customer = false,
  phone_masked = '+2519' || '•••••' || lpad((substring(id::text from 36 for 1))::text, 2, '0'),
  default_neighborhood = case id
    when 'a0000000-0000-4000-8000-000000000001' then 'Bole'
    when 'a0000000-0000-4000-8000-000000000002' then 'Kazanchis'
    when 'a0000000-0000-4000-8000-000000000003' then 'CMC'
    when 'a0000000-0000-4000-8000-000000000004' then 'Sarbet'
    when 'a0000000-0000-4000-8000-000000000005' then 'Piazza'
    when 'a0000000-0000-4000-8000-000000000006' then 'Kirkos'
    when 'a0000000-0000-4000-8000-000000000007' then 'Yeka'
    when 'a0000000-0000-4000-8000-000000000008' then 'Bole'
  end
where id in (
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000008');

update public.profiles set
  is_seed = true, is_customer = true,
  phone_masked = case id
    when 'c0000000-0000-4000-8000-000000000001' then '+2519' || '•••••' || '11'
    when 'c0000000-0000-4000-8000-000000000002' then '+1202' || '•••••' || '88'
  end,
  default_neighborhood = case id
    when 'c0000000-0000-4000-8000-000000000001' then 'Bole'
    else null  -- diaspora customer lives abroad
  end
where id in ('c0000000-0000-4000-8000-000000000001',
             'c0000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- 4. Worker profiles. Coordinates: approximate neighborhood points (ESTIMATE).
--    rating_avg/review_count/jobs_completed are FICTIONAL demo values on
--    is_seed profiles (real ones are trigger-maintained from reviews).
-- ---------------------------------------------------------------------------
insert into public.worker_profiles
  (user_id, bio, categories, skills, neighborhood, geo, travel_radius_km,
   availability, availability_status, price_min_cents, price_max_cents,
   price_type, rating_avg, review_count, jobs_completed, badge_level,
   verification_level)
values
  ('a0000000-0000-4000-8000-000000000001',
   'የኤሌክትሪክ እና የቧንቧ ጥገና ባለሙያ። በቦሌ አካባቢ ፈጣን አገልግሎት።',
   '{repairs-handyman}', '{plumbing,electrical,painting}', 'Bole',
   extensions.st_setsrid(extensions.st_makepoint(38.7861, 9.0125), 4326)::extensions.geography,
   12, '{"days":["mon","tue","wed","thu","fri","sat"],"hours":"08:00-18:00"}'::jsonb,
   'available_now', 35000, 90000, 'fixed', 4.70, 23, 31, 'trusted', 'id_verified'),

  ('a0000000-0000-4000-8000-000000000002',
   'የቤት እና የቢሮ ጽዳት በጥንቃቄ። የራሴ የጽዳት መሣሪያዎች አሉኝ።',
   '{home-cleaning}', '{deep-cleaning,office-cleaning,laundry}', 'Kazanchis',
   extensions.st_setsrid(extensions.st_makepoint(38.7700, 9.0170), 4326)::extensions.geography,
   10, '{"days":["mon","tue","wed","thu","fri"],"hours":"07:30-17:00"}'::jsonb,
   'available_today', 80000, 300000, 'fixed', 4.50, 11, 14, 'rising', 'id_verified'),

  ('a0000000-0000-4000-8000-000000000003',
   'የሒሳብ እና ፊዚክስ አስጠኚ፤ የከፍተኛ ክፍል ተማሪዎችን አስጠናለሁ።',
   '{tutors}', '{maths,physics,exam-prep}', 'CMC',
   extensions.st_setsrid(extensions.st_makepoint(38.8300, 9.0200), 4326)::extensions.geography,
   15, '{"days":["mon","wed","fri","sat","sun"],"hours":"14:00-20:00"}'::jsonb,
   'available_today', 50000, 80000, 'hourly', 4.90, 6, 8, 'rising', 'basic'),

  ('a0000000-0000-4000-8000-000000000004',
   'የሕፃናት እንክብካቤ በፍቅር እና በኃላፊነት። የመጀመሪያ እርዳታ ሥልጠና አለኝ።',
   '{babysitting-care}', '{infant-care,first-aid,homework-help}', 'Sarbet',
   extensions.st_setsrid(extensions.st_makepoint(38.7260, 8.9940), 4326)::extensions.geography,
   8, '{"days":["mon","tue","wed","thu","fri","sat"],"hours":"07:00-20:00"}'::jsonb,
   'available_now', 25000, 50000, 'hourly', 4.80, 19, 27, 'trusted', 'fayda_verified'),

  ('a0000000-0000-4000-8000-000000000005',
   'የሠርግ እና የዝግጅት ፎቶግራፍ አንሺ፤ ከ5 ዓመት በላይ ልምድ።',
   '{photography}', '{weddings,events,portraits,editing}', 'Piazza',
   extensions.st_setsrid(extensions.st_makepoint(38.7520, 9.0345), 4326)::extensions.geography,
   25, '{"days":["thu","fri","sat","sun"],"hours":"08:00-22:00"}'::jsonb,
   'busy', 200000, 700000, 'fixed', 4.90, 34, 41, 'pro', 'id_verified'),

  ('a0000000-0000-4000-8000-000000000006',
   'ጽዳት እና የገበያ ግዢ አገልግሎት በኪርኮስ አካባቢ።',
   '{home-cleaning,errands-city-help}', '{cleaning,shopping,delivery}', 'Kirkos',
   extensions.st_setsrid(extensions.st_makepoint(38.7560, 9.0050), 4326)::extensions.geography,
   6, '{"days":["mon","tue","wed","thu","fri","sat"],"hours":"08:00-17:00"}'::jsonb,
   'available_now', 20000, 35000, 'hourly', 4.20, 5, 6, 'new', 'basic'),

  ('a0000000-0000-4000-8000-000000000007',
   'የዝግጅት አስተናጋጅ እና አስተባባሪ፤ ሠርግ እና ስብሰባዎች።',
   '{event-staffing,errands-city-help}', '{serving,coordination,setup}', 'Yeka',
   extensions.st_setsrid(extensions.st_makepoint(38.8000, 9.0430), 4326)::extensions.geography,
   15, '{"days":["fri","sat","sun"],"hours":"09:00-23:00"}'::jsonb,
   'available_today', 50000, 90000, 'fixed', 4.60, 9, 12, 'rising', 'id_verified'),

  ('a0000000-0000-4000-8000-000000000008',
   'ለዲያስፖራ ቤተሰቦች የንብረት ክትትል፣ ጥገና ማስተባበር እና ሪፖርት።',
   '{diaspora-property,repairs-handyman}', '{property-check,reporting,contractor-liaison}', 'Bole',
   extensions.st_setsrid(extensions.st_makepoint(38.7900, 9.0080), 4326)::extensions.geography,
   20, '{"days":["mon","tue","wed","thu","fri","sat"],"hours":"08:00-18:00"}'::jsonb,
   'available_today', 80000, 250000, 'fixed', 4.80, 15, 22, 'trusted', 'fayda_verified')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Open jobs (5; one diaspora with a masked local contact). date_needed is
--    relative so re-seeded demos always show upcoming work.
-- ---------------------------------------------------------------------------
insert into public.jobs
  (id, customer_id, category_slug, title, description,
   service_address_text, service_landmark, service_neighborhood, service_geo,
   is_diaspora, local_contact_name, local_contact_phone_masked,
   date_needed, time_window, budget_cents, workers_needed, status, is_seed)
values
  ('d0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'home-cleaning',
   'የቦሌ አፓርታማ ጥልቅ ጽዳት',
   'ባለ 2 መኝታ አፓርታማ፣ ወጥ ቤትና መስኮቶች ጨምሮ ጥልቅ ጽዳት ይፈልጋል።',
   'Bole, near Edna Mall, 4th floor', 'Edna Mall አጠገብ', 'Bole',
   extensions.st_setsrid(extensions.st_makepoint(38.7870, 9.0110), 4326)::extensions.geography,
   false, null, null,
   current_date + 3, 'ጠዋት 8:00-12:00', 250000, 1, 'open', true),

  ('d0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', 'tutors',
   'የ8ኛ ክፍል ሒሳብ አስጠኚ ይፈለጋል',
   'ለ8ኛ ክፍል ሚኒስትሪ ፈተና ዝግጅት፣ በሳምንት ሁለት ቀን።',
   'CMC area, near St. Michael church', 'ሚካኤል ቤተክርስቲያን አካባቢ', 'CMC',
   extensions.st_setsrid(extensions.st_makepoint(38.8280, 9.0190), 4326)::extensions.geography,
   false, null, null,
   current_date + 5, 'ቅዳሜ ከሰዓት', 60000, 1, 'open', true),

  ('d0000000-0000-4000-8000-000000000003',
   'c0000000-0000-4000-8000-000000000001', 'repairs-handyman',
   'የወጥ ቤት ቧንቧ ፍሳሽ ጥገና',
   'የወጥ ቤት ማጠቢያ ስር ፍሳሽ አለ፤ አስቸኳይ ጥገና ይፈልጋል።',
   'Kazanchis, behind Intercontinental Hotel', 'ኢንተርኮንቲኔንታል ሆቴል ጀርባ', 'Kazanchis',
   extensions.st_setsrid(extensions.st_makepoint(38.7710, 9.0160), 4326)::extensions.geography,
   false, null, null,
   current_date + 1, 'ማንኛውም ሰዓት', 90000, 1, 'open', true),

  ('d0000000-0000-4000-8000-000000000004',
   'c0000000-0000-4000-8000-000000000001', 'event-staffing',
   'ለልደት ዝግጅት 2 አስተናጋጆች',
   'የ50 ሰው ልደት ዝግጅት፤ ምግብ ማቅረብ እና ማስተናገድ።',
   'Piazza, Ras Mekonnen Hall area', 'ራስ መኮንን አዳራሽ አካባቢ', 'Piazza',
   extensions.st_setsrid(extensions.st_makepoint(38.7530, 9.0350), 4326)::extensions.geography,
   false, null, null,
   current_date + 10, 'ከቀኑ 16:00-22:00', 160000, 2, 'open', true),

  -- diaspora flow: poster is abroad, a local contact receives the worker
  ('d0000000-0000-4000-8000-000000000005',
   'c0000000-0000-4000-8000-000000000002', 'diaspora-property',
   'Monthly check on family house in Yeka',
   'I live in Washington DC. Need a monthly visit to my family house in Yeka: photo report, check utilities, small issues flagged. My uncle will open the gate.',
   'Yeka, off Meganagna–Kotebe road', 'ከመገናኛ ወደ ኮተቤ መንገድ', 'Yeka',
   extensions.st_setsrid(extensions.st_makepoint(38.8050, 9.0400), 4326)::extensions.geography,
   true, 'አቶ ተስፋዬ ለማ', '+2519' || '•••••' || '42',
   current_date + 7, 'ቅዳሜ ጠዋት', 150000, 1, 'open', true)
on conflict (id) do nothing;
