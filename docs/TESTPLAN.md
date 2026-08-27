# Take It v2 — Human test plan

Phone-in-hand scripts for the founder. Run on a real Android device (low-end
if possible), on mobile data, against the live Supabase project. Every item:
steps → expected → checkbox. A failing item is a finding (repo law: never
weaken the check to make it pass).

**Test personas** (create once, keep):
- **CUST** — customer account (email/password dev auth for now).
- **WORK** — worker account, worker profile with categories
  `home-cleaning`, neighborhood Bole, geo pin set.
- **ADMIN** — normal account that the founder gave `role='admin'` in
  `user_roles` **manually in the DB** (never via the app — C8).

Feature-agent slices append their items to their own section. Anything not
listed here has NOT been human-tested — say so at release.

---

## S0 — Schema, RLS, and the 3-persona denial spot-checks

- [ ] **S0.1 Fresh apply.** Run all six migrations + seed on a fresh database
      (CI does this; re-run locally if in doubt).
      Expected: zero errors; seed shows 8 workers / 5 open jobs, all
      `is_seed=true`.
- [ ] **S0.2 RLS denial — CUST reads another user's verification.** As CUST
      in the app, open devtools → network (or use the app if a UI exists) and
      request `verifications` rows.
      Expected: only CUST's own rows (empty if none). WORK's verification row
      is never returned.
- [ ] **S0.3 RLS denial — WORK reads CUST's job before it is open to them.**
      As WORK whose categories do NOT include the job's category, open Browse
      / jobs list.
      Expected: the job does not appear anywhere for WORK.
- [ ] **S0.4 RLS denial — CUST reads audit_log / user_roles.** As CUST,
      attempt to load the Admin page (`/admin`) and, via devtools, select from
      `audit_log`.
      Expected: Admin page refuses (RequireRole); `audit_log` and `user_roles`
      selects return zero rows.
- [ ] **S0.5 ADMIN positive control.** As ADMIN, open `/admin`.
      Expected: loads; verification queue visible. (A denial test suite that
      never sees a success is a verifier that cannot fail.)
- [ ] **S0.6 Direct status write is refused.** As CUST, from devtools run
      `supabase.from('bookings').update({status:'customer_confirmed'}).eq('id', …)`.
      Expected: error / 0 rows — status columns have no client grant.
- [ ] **S0.7 Direct message insert is refused.** As CUST, from devtools run
      `supabase.from('messages').insert({...})`.
      Expected: permission error — chat only via `rpc_send_message`.

## S1 — Auth, onboarding, language

- [ ] **S1.1 Amharic default on a fresh device (acceptance gate).** Uninstall /
      clear site data, open the app URL in a fresh browser profile.
      Expected: every visible string is Amharic before any tap. Any English
      string on first paint = fail.
- [ ] **S1.2 Language switch.** Switch to English in the locale switcher, kill
      the tab, reopen.
      Expected: English persists for this user; new/incognito session is
      Amharic again.
- [ ] **S1.3 Signup → profile row.** Sign up a new email/password account,
      complete onboarding.
      Expected: lands on Home; Me page shows display name; locale is am.
- [ ] **S1.4 Dev-auth marking.** On the auth screen.
      Expected: email/password path is visibly marked as the interim/dev
      method (Telegram/SMS are the launch paths).
- [ ] **S1.5 Route guarding.** Signed out, open `/post`, `/inbox`, `/me`
      directly.
      Expected: redirected to auth, never a blank/broken page.

## S2 — Home & Browse

- [ ] **S2.1 Home sections.** As CUST on Home.
      Expected: 8 category tiles (Amharic names), "Available Now" green-dot
      section, seed workers visible with trust signals (verified badge,
      rating, jobs count) on every worker card.
- [ ] **S2.2 Nearby ordering.** In Browse with location allowed, compare the
      first two workers against their neighborhoods.
      Expected: ordered by distance, not alphabetically (repo law: geography
      is never decided by the alphabet).
- [ ] **S2.3 Category filter.** Open `browse/c/home-cleaning`.
      Expected: only workers listing that category.
- [ ] **S2.4 Worker detail masked phone (acceptance gate).** As CUST with NO
      booking with this worker, open a worker detail page and inspect
      everything visible (and the network response in devtools).
      Expected: no full phone number anywhere — masked form (e.g. `+251•••…12`)
      only, in UI **and** in the JSON payloads.

## S3 — Post job → apply → booking lifecycle

- [ ] **S3.1 Post a job (two-location model).** As CUST, post a
      home-cleaning job: service address + landmark + neighborhood, date,
      budget in ETB.
      Expected: job appears in My Jobs as **Open**; price displays as ETB with
      correct cents handling (e.g. 500.00 ETB, never 50000).
- [ ] **S3.2 Diaspora toggle.** Post a job with the diaspora toggle on, local
      contact name + phone `0911223344`.
      Expected: form requires the contact name; after posting, the contact
      phone renders MASKED everywhere, including to the poster.
- [ ] **S3.3 Wrong-category worker cannot apply.** As a worker without the
      job's category.
      Expected: job not visible / apply refused with a clear message.
- [ ] **S3.4 Apply.** As WORK, apply with a message and committed window.
      Expected: application Pending; CUST gets a notification.
- [ ] **S3.5 Duplicate apply refused.** As WORK, apply again.
      Expected: clear "already applied" error, in Amharic.
- [ ] **S3.6 Accept → booking.** As CUST, accept WORK's application.
      Expected: booking **Confirmed**, job badge **Matched**, WORK notified
      with agreed price.
- [ ] **S3.7 Start (worker only).** As CUST first, try to start the booking.
      Expected: refused. As WORK: booking → **Started**, job →
      **In Progress**.
- [ ] **S3.8 Done → confirm.** As WORK mark done; as CUST confirm.
      Expected: worker_done then customer_confirmed; job **Done**; WORK's
      jobs_completed count on their public card increments by 1.
- [ ] **S3.9 Illegal transition refused.** On the completed booking, as WORK
      try to start it again (button should be gone; if reachable via devtools
      RPC call, expect a `TAKEIT_INVALID_TRANSITION` error).
- [ ] **S3.10 Cancel reopens.** On a second job: book, then cancel while
      Confirmed.
      Expected: booking Cancelled, job back to **Open**, other party notified.
- [ ] **S3.11 Dispute.** On a third booking in Started, open a dispute with a
      reason.
      Expected: booking + job show **Disputed**; ADMIN sees the dispute in
      `/admin`.

## S4 — Verification & guarantors

- [ ] **S4.1 Manual ID upload.** As WORK, submit manual verification: ID
      front/back + selfie (compressed on-device — watch upload size on mobile
      data; should be well under ~1 MB per image. ESTIMATE, not yet measured).
      Expected: status Pending; WORK **cannot re-download** the images
      afterward (private bucket, ops-read-only).
- [ ] **S4.2 CUST cannot see WORK's documents.** As CUST, attempt the storage
      URL of S4.1 (copy from devtools while signed in as WORK).
      Expected: 403/404 — never the image.
- [ ] **S4.3 Approve.** As ADMIN in `/admin`, approve WORK.
      Expected: WORK's badge shows id_verified; babysitting-care still
      refuses WORK's applications (needs fayda_verified).
- [ ] **S4.4 Verification gate on category.** As WORK (id_verified), add
      `babysitting-care` to profile and apply to a babysitting job.
      Expected: refused with a verification-level message.
- [ ] **S4.5 Guarantor.** As WORK, add an idir guarantor (name, masked
      contact, statement).
      Expected: visible on WORK's own profile management + to ADMIN;
      **not** visible to CUST; contact shows masked.

## S5 — Chat & reviews

- [ ] **S5.1 Realtime chat.** Two phones (CUST + WORK) on one confirmed
      booking. Send messages both ways.
      Expected: appear within ~2 s (ESTIMATE) without refresh; read receipts
      update.
- [ ] **S5.2 Phone-number soft-block pre-completion (acceptance gate).**
      Before completion, CUST sends `call me 0911 22 33 44`.
      Expected: message delivers with the digits replaced by `[•••]` on BOTH
      phones, plus the Amharic warning about sharing numbers pre-booking.
- [ ] **S5.3 Unlock after completion.** After customer confirmation, send a
      phone number again.
      Expected: passes through unmasked — contact is legitimately unlocked.
- [ ] **S5.4 Third-party cannot read chat.** As ADMIN, try to read the
      booking's messages (via any UI or devtools select).
      Expected: zero rows — chat is parties-only, even for admin.
- [ ] **S5.5 Double-blind reviews.** After completion, CUST submits a review;
      WORK has not.
      Expected: WORK cannot see CUST's rating/comment yet. After WORK submits:
      both visible; WORK's public rating_avg/review_count update.

## S6 — Payments (Phase 1), admin, release gates

- [ ] **S6.1 Off-app payment log, dual confirmation.** On a started booking,
      CUST logs the payment; then WORK confirms.
      Expected: one payment row, both `customer_confirmed` and
      `worker_confirmed` end true; no balance, wallet, or "funds held by
      Take It" wording appears **anywhere** (C1).
- [ ] **S6.2 Amount mismatch.** WORK logs a different amount than CUST logged.
      Expected: clear mismatch error; the original amount stands.
- [ ] **S6.3 Payments UI dark.** With `VITE_FEATURE_PAYMENTS_ENABLED` unset.
      Expected: no Chapa/checkout UI anywhere in the app.
- [ ] **S6.4 Service-role grep of dist (acceptance gate).** After
      `npm run build`:
      `grep -R "service_role" apps/web/dist/` and
      `grep -R "$SUPABASE_SERVICE_ROLE_KEY" apps/web/dist/` (with the real key
      value from the secrets store).
      Expected: **zero matches** for the key; any `service_role` hit is
      investigated to a harmless source. Positive control: grep for the anon
      key and confirm it IS found — proves the grep works (a grep that can't
      find anything proves nothing).
- [ ] **S6.5 Unmasked-phone sweep of dist + API.** Walk Home, Browse, worker
      detail, job detail, inbox as CUST pre-booking while devtools records;
      search all responses for your test numbers (`0911223344` etc.).
      Expected: zero raw hits pre-booking.
- [ ] **S6.6 Lighthouse (acceptance gate).** Lighthouse mobile run on Home,
      production build.
      Expected: Performance ≥ 80.

## S7 — Telegram bot *(blocked: apps/telegram-bot not built yet — waiting on
BotFather token, see BLOCKERS.md; run when it lands)*

- [ ] **S7.1 Deep-link onboarding.** From a fresh Telegram account, open the
      bot link, tap Start, follow the auth deep-link into the web app.
      Expected: signed-in session; profile has `telegram_id` set; locale am.
- [ ] **S7.2 Login-widget hash tampering.** Modify any widget parameter (e.g.
      the Telegram user id) before it reaches the edge function (replay from
      devtools).
      Expected: rejected — invalid hash. (Gate 2: see the guard fail.)
- [ ] **S7.3 Notifications reach Telegram.** Trigger S3.4 (new application)
      with the customer linked to Telegram.
      Expected: bot message arrives; **contains no unmasked phone numbers**.
- [ ] **S7.4 Bot respects state machine.** Try a bot action out of order
      (e.g. confirm completion on a booking still Confirmed).
      Expected: friendly refusal, Amharic default.

---

**Append rule (from SPEC):** every human-testable item a feature agent ships
gets added to its slice section here, in the same PR.
