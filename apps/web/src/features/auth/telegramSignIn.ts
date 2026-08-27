// Telegram login — IMPURE half: calls the telegram-auth edge function and
// installs the returned Supabase session. See telegram.ts for the pure logic.
//
// Edge-function contract (supabase/functions/telegram-auth/index.ts):
//   POST { widget: {...} } → 200 { user: { id, telegram_id }, session: {...} }
//   503 { error: 'telegram_auth_not_configured' } when the bot token is unset
//   401 { error: 'verification_failed', reason } on a bad/stale hash

import { supabase } from '../../lib/supabase';
import {
  buildTelegramAuthBody,
  mapTelegramFunctionError,
  type TelegramSignInFailure,
  type TelegramWidgetUser,
} from './telegram';

interface TelegramAuthResponse {
  user?: { id?: string };
  session?: { access_token?: string; refresh_token?: string };
}

export type TelegramSignInResult =
  | { ok: true; userId: string }
  | { ok: false; reason: TelegramSignInFailure };

async function readErrorCode(error: unknown): Promise<string | undefined> {
  // FunctionsHttpError carries the raw Response as `context`.
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx instanceof Response) {
    try {
      const body = (await ctx.clone().json()) as { error?: unknown };
      if (typeof body.error === 'string') return body.error;
    } catch {
      // non-JSON error body — fall through
    }
  }
  return undefined;
}

export async function signInWithTelegram(
  widgetUser: TelegramWidgetUser,
): Promise<TelegramSignInResult> {
  const { data, error } = await supabase.functions.invoke<TelegramAuthResponse>(
    'telegram-auth',
    { body: buildTelegramAuthBody(widgetUser) },
  );

  if (error) {
    return { ok: false, reason: mapTelegramFunctionError(await readErrorCode(error)) };
  }

  const accessToken = data?.session?.access_token;
  const refreshToken = data?.session?.refresh_token;
  const userId = data?.user?.id;
  if (!accessToken || !refreshToken || !userId) {
    return { ok: false, reason: 'error' };
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) return { ok: false, reason: 'error' };

  return { ok: true, userId };
}
