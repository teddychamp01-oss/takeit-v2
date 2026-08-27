// =============================================================================
// Take It v2 — telegram-auth edge function.
//
// POST { widget: { id, first_name, ..., auth_date, hash } }   (Login Widget)
// POST { login_token: "v1.<id>.<ts>.<mac>" }                  (bot deep link)
//
// Verifies the credential (see _shared/telegramAuth.ts: widget hash =
// HMAC-SHA256 with SHA256(bot_token) as key, auth_date freshness <= 300 s;
// deep-link token = stateless HMAC minted by the bot in /start), then
// finds-or-creates the Supabase user keyed on telegram_id (email alias
// tg<id>@telegram.takeit.example) and returns a session.
//
// SESSION ISSUANCE (documented choice): supabase-js has no direct
// "admin: create session for user X" API. The supported server-side path is:
//   1. service-role  admin.auth.admin.generateLink({ type:'magiclink', email })
//      -> properties.hashed_token  (one-time token hash; nothing is emailed)
//   2. anon-key      auth.verifyOtp({ type:'email', token_hash })
//      -> { access_token, refresh_token, ... }
// The token hash is consumed inside this function and never leaves it; only
// the resulting session is returned. The web client then calls
// supabase.auth.setSession({ access_token, refresh_token }).
//
// Config errors are graceful: TELEGRAM_BOT_TOKEN unset -> 503
// { error: 'telegram_auth_not_configured' } — never a crash.
//
// Deploy note: requires verify_jwt = false (callers are not yet signed in).
// =============================================================================

import { json, preflight } from '../_shared/cors.ts';
import { logEvent } from '../_shared/log.ts';
import { adminClient, anonClient } from '../_shared/supabaseAdmin.ts';
import { verifyLoginToken, verifyTelegramWidget } from '../_shared/telegramAuth.ts';
import { findOrCreateTelegramUser } from '../_shared/tgAccount.ts';

const FN = 'telegram-auth';

function displayNameFromWidget(fields: Record<string, string>): string {
  const name = [fields['first_name'], fields['last_name']].filter(Boolean).join(' ').trim();
  return (name || fields['username'] || '').slice(0, 80);
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    logEvent(FN, 'warn', 'not_configured', { missing: 'TELEGRAM_BOT_TOKEN' });
    return json(503, { error: 'telegram_auth_not_configured' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('not an object');
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  try {
    // --- 1. Verify the Telegram credential --------------------------------
    let verification;
    let mode: 'widget' | 'login_token';
    if (body.widget && typeof body.widget === 'object') {
      mode = 'widget';
      verification = await verifyTelegramWidget(
        body.widget as Record<string, unknown>,
        botToken,
      );
    } else if (typeof body.login_token === 'string') {
      mode = 'login_token';
      verification = await verifyLoginToken(body.login_token, botToken);
    } else {
      return json(400, { error: 'bad_request', hint: 'send { widget } or { login_token }' });
    }

    if (!verification.ok) {
      logEvent(FN, 'warn', 'verification_failed', { mode, reason: verification.reason });
      return json(401, { error: 'verification_failed', reason: verification.reason });
    }

    // --- 2. Find-or-create the user keyed on telegram_id ------------------
    const admin = adminClient();
    const anon = anonClient();
    if (!admin || !anon) {
      logEvent(FN, 'error', 'supabase_env_missing', {});
      return json(503, { error: 'supabase_not_configured' });
    }

    const displayName =
      mode === 'widget' ? displayNameFromWidget(verification.fields) : '';
    const { userId, email, created } = await findOrCreateTelegramUser(
      admin,
      verification.telegramId,
      displayName,
    );

    // --- 3. Issue a session (generateLink -> verifyOtp, see header) -------
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      logEvent(FN, 'error', 'generate_link_failed', { message: linkErr?.message });
      return json(500, { error: 'session_issuance_failed' });
    }

    const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
      type: 'email',
      token_hash: linkData.properties.hashed_token,
    });
    if (otpErr || !otpData?.session) {
      logEvent(FN, 'error', 'verify_otp_failed', { message: otpErr?.message });
      return json(500, { error: 'session_issuance_failed' });
    }

    logEvent(FN, 'info', 'login_ok', { mode, user_id: userId, created });
    const s = otpData.session;
    return json(200, {
      user: { id: userId, telegram_id: verification.telegramId },
      created,
      session: {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        token_type: s.token_type,
        expires_in: s.expires_in,
        expires_at: s.expires_at,
      },
    });
  } catch (err) {
    logEvent(FN, 'error', 'unhandled', {
      message: err instanceof Error ? err.message : String(err),
    });
    return json(500, { error: 'internal' });
  }
});
