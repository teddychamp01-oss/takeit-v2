// =============================================================================
// Take It v2 — telegram-webhook edge function (the bot itself, grammY).
//
// Commands: /start /help /categories /postjob /myjobs /cancel
// The /postjob guided flow is the PURE state machine in _shared/flows.ts
// (byte-identical mirror of apps/telegram-bot/src/flows.ts, where it is
// unit-tested); this file only wires Telegram I/O and the database around it.
//
// Security:
// * X-Telegram-Bot-Api-Secret-Token is checked on every request. The expected
//   value is TELEGRAM_WEBHOOK_SECRET, or — when that env is unset — the
//   SHA-256 hex of the bot token (a derived value that does not reveal it),
//   so no extra secret is strictly required. Set the same value in
//   setWebhook(secret_token=...).
// * TELEGRAM_BOT_TOKEN unset -> 503 { error:'telegram_bot_not_configured' }.
// * Handler errors -> logged, 200 to Telegram (non-2xx makes Telegram retry
//   the same broken update forever).
//
// C3: this flow never asks for phone numbers; jobs are inserted without any
// contact fields. C5: Amharic-default replies (profiles.locale when known).
// C7: budgets stored as integer ETB cents.
//
// FLOW-STATE LIMITATION (documented, honest): /postjob state lives in an
// in-memory Map keyed by telegram user id, TTL 15 min. Supabase keeps edge
// isolates warm between consecutive webhook calls, but a cold start LOSES the
// map; the bot then answers 'postjob_expired' and the user restarts — no
// wrong data, only a retry. The schema owns no bot-session table today; a
// `bot_sessions` table is the proper Phase-2 fix (needs a migration —
// proposal, not silently added here; see the orchestrator report).
//
// NOTIFY HOOK POINT (match notifications -> Telegram): the notifications
// table is written by the DB RPCs (application.received, booking.started,
// message.new, ...). Phase 2 wires them to Telegram like this:
//   1. pg_cron job (DB side) selects unread notifications joined to
//      profiles.telegram_id,
//   2. POSTs them via pg_net to THIS function's URL with
//      ?action=notify + the service-role Authorization header,
//   3. the branch marked NOTIFY-HOOK below sends bot.api.sendMessage(chat_id,
//      i18n text from _shared/texts.ts) and marks read_at.
// The branch currently returns 501 so the surface is documented but inert.
// =============================================================================

import { Bot, InlineKeyboard, webhookCallback } from 'npm:grammy@1';
import { json, preflight } from '../_shared/cors.ts';
import {
  advancePostJob,
  CATEGORIES,
  startPostJob,
  type CompletedPostJob,
  type PostJobState,
} from '../_shared/flows.ts';
import { sha256Hex, timingSafeEqual } from '../_shared/hmac.ts';
import { logEvent } from '../_shared/log.ts';
import { adminClient, type AnyClient } from '../_shared/supabaseAdmin.ts';
import { mintLoginToken } from '../_shared/telegramAuth.ts';
import { findOrCreateTelegramUser } from '../_shared/tgAccount.ts';
import {
  DEFAULT_LOCALE,
  isLocale,
  jobStatusLabel,
  formatEtbFromCents,
  t,
  type Locale,
} from '../_shared/texts.ts';

const FN = 'telegram-webhook';
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const LOGIN_DOMAIN = Deno.env.get('TELEGRAM_LOGIN_DOMAIN') ?? '';
const WEB_APP_URL = LOGIN_DOMAIN ? `https://${LOGIN_DOMAIN}` : null;

// --- in-memory /postjob sessions (see FLOW-STATE LIMITATION above) ----------
const SESSION_TTL_MS = 15 * 60 * 1000;
interface Session {
  state: PostJobState;
  touchedAt: number;
}
const sessions = new Map<number, Session>();

function getSession(userId: number): PostJobState | null {
  const s = sessions.get(userId);
  if (!s) return null;
  if (Date.now() - s.touchedAt > SESSION_TTL_MS) {
    sessions.delete(userId);
    return null;
  }
  return s.state;
}

function putSession(userId: number, state: PostJobState | null): void {
  if (state === null) sessions.delete(userId);
  else sessions.set(userId, { state, touchedAt: Date.now() });
}

// --- helpers -----------------------------------------------------------------

/** Today in the user's timezone — Addis Ababa, not UTC (they differ by +3h). */
function todayInAddisISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function localeFor(admin: AnyClient | null, telegramId: string): Promise<Locale> {
  if (!admin) return DEFAULT_LOCALE;
  const { data } = await admin
    .from('profiles')
    .select('locale')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  return isLocale(data?.locale) ? data.locale : DEFAULT_LOCALE;
}

/** Insert the completed /postjob draft. Returns the new job id. */
async function insertTelegramJob(
  admin: AnyClient,
  telegramId: string,
  displayName: string,
  done: CompletedPostJob,
): Promise<string> {
  const { userId } = await findOrCreateTelegramUser(admin, telegramId, displayName);

  const { data: job, error } = await admin
    .from('jobs')
    .insert({
      customer_id: userId,
      category_slug: done.categorySlug,
      title: done.title,
      description: done.description,
      service_neighborhood: done.neighborhood || null,
      service_landmark: done.landmark,
      budget_cents: done.budgetCents,
      currency: done.currency,
      date_needed: done.dateNeeded,
      status: 'open',
    })
    .select('id')
    .single();
  if (error || !job) {
    throw new Error(`jobs insert failed: ${error?.message ?? 'no row returned'}`);
  }

  await admin.from('profiles').update({ is_customer: true }).eq('id', userId);

  // The schema has no jobs.source column; provenance ('telegram') is recorded
  // in audit_log, matching what rpc_post_job writes for web posts.
  const { error: auditErr } = await admin.from('audit_log').insert({
    actor_id: userId,
    action: 'job.post',
    entity: 'jobs',
    entity_id: job.id,
    diff: {
      source: done.source,
      category: done.categorySlug,
      voice_note_pending: done.voiceNotePending,
    },
  });
  if (auditErr) {
    logEvent(FN, 'error', 'audit_write_failed', { message: auditErr.message });
  }

  logEvent(FN, 'info', 'job_posted', {
    job_id: job.id,
    category: done.categorySlug,
    source: done.source,
    voice_note_pending: done.voiceNotePending,
  });
  return job.id as string;
}

// --- bot ---------------------------------------------------------------------
function buildBot(token: string): Bot {
  const bot = new Bot(token);

  bot.command('start', async (ctx) => {
    const locale = await localeFor(adminClient(), String(ctx.from?.id ?? ''));
    const kb = new InlineKeyboard();
    if (WEB_APP_URL) {
      kb.url(t(locale, 'btn_open_app'), WEB_APP_URL);
      if (ctx.from) {
        // Stateless 5-minute login token (see _shared/telegramAuth.ts).
        const token = await mintLoginToken(String(ctx.from.id), BOT_TOKEN);
        kb.row().url(
          t(locale, 'btn_login'),
          `${WEB_APP_URL}/auth/telegram?token=${encodeURIComponent(token)}`,
        );
      }
    } else {
      logEvent(FN, 'warn', 'login_domain_unset', {});
    }
    // C5: Amharic first, English second.
    const text =
      t('am', 'start_welcome') +
      '\n\n' +
      t('en', 'start_welcome') +
      (WEB_APP_URL ? `\n\n${t(locale, 'login_hint')}` : '');
    await ctx.reply(text, WEB_APP_URL ? { reply_markup: kb } : undefined);
  });

  bot.command('help', async (ctx) => {
    const locale = await localeFor(adminClient(), String(ctx.from?.id ?? ''));
    await ctx.reply(t(locale, 'help'));
  });

  bot.command('categories', async (ctx) => {
    const locale = await localeFor(adminClient(), String(ctx.from?.id ?? ''));
    // Prefer the live catalog; fall back to the seed-synced constant.
    let lines: string[] | null = null;
    const admin = adminClient();
    if (admin) {
      const { data, error } = await admin
        .from('service_categories')
        .select('slug, name_am, name_en, icon')
        .eq('active', true)
        .order('sort', { ascending: true });
      if (!error && data && data.length > 0) {
        lines = data.map(
          (c, i) => `${i + 1}. ${c.icon ?? ''} ${c.name_am} (${c.name_en})`,
        );
      } else if (error) {
        logEvent(FN, 'warn', 'categories_query_failed', { message: error.message });
      }
    }
    lines ??= CATEGORIES.map((c, i) => `${i + 1}. ${c.icon} ${c.nameAm} (${c.nameEn})`);
    await ctx.reply(`${t(locale, 'categories_header')}\n${lines.join('\n')}`);
  });

  bot.command('postjob', async (ctx) => {
    if (!ctx.from) return;
    const locale = await localeFor(adminClient(), String(ctx.from.id));
    const r = startPostJob(locale);
    putSession(ctx.from.id, r.state);
    await ctx.reply(r.reply);
  });

  bot.command('cancel', async (ctx) => {
    if (!ctx.from) return;
    const locale = getSession(ctx.from.id)?.locale ?? DEFAULT_LOCALE;
    putSession(ctx.from.id, null);
    await ctx.reply(t(locale, 'postjob_cancelled'));
  });

  bot.command('myjobs', async (ctx) => {
    if (!ctx.from) return;
    const admin = adminClient();
    const telegramId = String(ctx.from.id);
    const locale = await localeFor(admin, telegramId);
    if (!admin) {
      await ctx.reply(t(locale, 'not_configured'));
      return;
    }
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('telegram_id', telegramId)
      .maybeSingle();
    if (!profile) {
      await ctx.reply(t(locale, 'myjobs_empty'));
      return;
    }
    const { data: jobs, error } = await admin
      .from('jobs')
      .select('title, status, budget_cents, date_needed')
      .eq('customer_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) {
      logEvent(FN, 'error', 'myjobs_query_failed', { message: error.message });
      await ctx.reply(t(locale, 'err_generic'));
      return;
    }
    if (!jobs || jobs.length === 0) {
      await ctx.reply(t(locale, 'myjobs_empty'));
      return;
    }
    const lines = jobs.map((j) => {
      const budget =
        j.budget_cents === null
          ? t(locale, 'none_value')
          : formatEtbFromCents(Number(j.budget_cents), locale);
      const date = j.date_needed ?? t(locale, 'none_value');
      return `• ${j.title} — ${jobStatusLabel(locale, String(j.status))} · ${budget} · ${date}`;
    });
    await ctx.reply(`${t(locale, 'myjobs_header')}\n${lines.join('\n')}`);
  });

  // Voice notes: acknowledge + TODO flag (SPEC). Inside the flow the state
  // machine records voiceNotePending; outside it we just acknowledge.
  bot.on('message:voice', async (ctx) => {
    if (!ctx.from) return;
    const state = getSession(ctx.from.id);
    if (state) {
      const r = advancePostJob(state, { isVoiceNote: true }, { todayISO: todayInAddisISO() });
      putSession(ctx.from.id, r.state);
      await ctx.reply(r.reply);
    } else {
      const locale = await localeFor(adminClient(), String(ctx.from.id));
      await ctx.reply(t(locale, 'postjob_voice_ack'));
    }
  });

  bot.on('message:text', async (ctx) => {
    if (!ctx.from) return;
    const text = ctx.message.text;
    const state = getSession(ctx.from.id);

    if (!state) {
      const locale = await localeFor(adminClient(), String(ctx.from.id));
      await ctx.reply(t(locale, 'unknown_input'));
      return;
    }

    const r = advancePostJob(state, { text }, { todayISO: todayInAddisISO() });
    putSession(ctx.from.id, r.state);
    await ctx.reply(r.reply);

    if (r.done) {
      const admin = adminClient();
      const locale = state.locale;
      if (!admin) {
        logEvent(FN, 'error', 'supabase_env_missing', {});
        await ctx.reply(t(locale, 'not_configured'));
        return;
      }
      try {
        const displayName = [ctx.from.first_name, ctx.from.last_name]
          .filter(Boolean)
          .join(' ')
          .slice(0, 80);
        await insertTelegramJob(admin, String(ctx.from.id), displayName, r.done);
        await ctx.reply(t(locale, 'postjob_posted', { title: r.done.title }));
      } catch (err) {
        logEvent(FN, 'error', 'job_insert_failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        await ctx.reply(t(locale, 'postjob_post_failed'));
      }
    }
  });

  bot.catch((err) => {
    logEvent(FN, 'error', 'bot_error', {
      message: err.message,
      update_id: err.ctx?.update?.update_id,
    });
  });

  return bot;
}

const bot = BOT_TOKEN ? buildBot(BOT_TOKEN) : null;
const handleUpdate = bot ? webhookCallback(bot, 'std/http') : null;

// Expected value of X-Telegram-Bot-Api-Secret-Token (see header comment).
const expectedSecretPromise: Promise<string | null> = (async () => {
  const explicit = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (explicit) return explicit;
  if (!BOT_TOKEN) return null;
  return await sha256Hex(BOT_TOKEN);
})();

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  if (!bot || !handleUpdate) {
    logEvent(FN, 'warn', 'not_configured', { missing: 'TELEGRAM_BOT_TOKEN' });
    return json(503, { error: 'telegram_bot_not_configured' });
  }

  const expectedSecret = await expectedSecretPromise;
  const gotSecret = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!expectedSecret || !timingSafeEqual(gotSecret, expectedSecret)) {
    logEvent(FN, 'warn', 'bad_webhook_secret', { had_header: gotSecret.length > 0 });
    return json(401, { error: 'bad_webhook_secret' });
  }

  // NOTIFY-HOOK: reserved server-to-server surface for the Phase-2
  // notifications dispatcher (see header). Documented but inert.
  const url = new URL(req.url);
  if (url.searchParams.get('action') === 'notify') {
    return json(501, { error: 'notify_dispatch_not_implemented_phase2' });
  }

  try {
    return await handleUpdate(req);
  } catch (err) {
    // 200 on purpose: a non-2xx makes Telegram redeliver the same broken
    // update indefinitely. The failure is preserved in the structured logs.
    logEvent(FN, 'error', 'update_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return json(200, { ok: false });
  }
});
