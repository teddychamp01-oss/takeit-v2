// Telegram login — PURE half (types, env reading, payload/error mapping).
// No supabase import here so it stays unit-testable without VITE_ env.
// The impure half (edge-function call + setSession) lives in telegramSignIn.ts.

/**
 * Fields the official Telegram Login Widget passes to its onauth callback.
 * The telegram-auth edge function re-verifies the HMAC hash server-side —
 * nothing here is trusted by itself.
 */
export interface TelegramWidgetUser {
  id: number;
  auth_date: number;
  hash: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

/** Official widget script (loaded ONLY when the feature is configured). */
export const TELEGRAM_WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22';

/** Name of the global onauth callback the widget invokes (must match below). */
export const TELEGRAM_ONAUTH_GLOBAL = '__takeitTelegramAuth';

declare global {
  interface Window {
    __takeitTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

/**
 * The client-side flag for Telegram login: the bot username the widget needs.
 * Absent/empty ⇒ feature OFF ⇒ the UI shows a graceful "coming soon".
 * (Read from a passed-in record so tests can exercise it without Vite.)
 */
export function readTelegramBotUsername(
  env: Record<string, unknown>,
): string | null {
  const raw = env['VITE_TELEGRAM_BOT_USERNAME'];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^@/, '');
  return trimmed.length > 0 ? trimmed : null;
}

/** Request body for the telegram-auth edge function (widget mode). */
export function buildTelegramAuthBody(user: TelegramWidgetUser): {
  widget: Record<string, unknown>;
} {
  return { widget: { ...user } };
}

export type TelegramSignInFailure = 'not_configured' | 'rejected' | 'error';

/**
 * Map the edge function's documented error codes to a UI-level reason.
 *   503 telegram_auth_not_configured → not_configured ("coming soon")
 *   401 verification_failed          → rejected
 *   anything else                    → error
 */
export function mapTelegramFunctionError(
  errorCode: string | undefined,
): TelegramSignInFailure {
  if (errorCode === 'telegram_auth_not_configured') return 'not_configured';
  if (errorCode === 'verification_failed') return 'rejected';
  return 'error';
}
