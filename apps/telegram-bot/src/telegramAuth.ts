// =============================================================================
// Take It v2 — Telegram login verification (WebCrypto only, zero imports).
//
// ARCHITECTURE / DUPLICATED FILE — keep these two copies BYTE-IDENTICAL:
//   supabase/functions/_shared/telegramAuth.ts  (used by the telegram-auth and
//                                                telegram-webhook edge fns, Deno)
//   apps/telegram-bot/src/telegramAuth.ts       (node-compatible duplicate,
//                                                unit-tested with vitest)
// Both runtimes expose the same `crypto.subtle` WebCrypto API, so one source
// serves both; the vitest guard apps/telegram-bot/src/sync.test.ts FAILS if
// the copies drift.
//
// Two credentials are verified here:
//
// 1) Telegram Login Widget payload (https://core.telegram.org/widgets/login):
//    secret_key = SHA256(bot_token)
//    hash       = hex(HMAC_SHA256(data_check_string, secret_key))
//    where data_check_string is all received fields except `hash`, sorted
//    alphabetically, joined as "key=value" with "\n". auth_date must be fresh
//    (<= 300 s old by default).
//
// 2) Bot deep-link login token (our own, STATELESS — no login-tokens table):
//    token = "v1.<telegram_id>.<issued_at>.<hex(HMAC_SHA256(payload, secret_key))>"
//    payload = "takeit-tg-login-v1\n<telegram_id>\n<issued_at>"
//    Same derived secret_key, domain-separated by the payload prefix; same
//    300 s freshness window. The bot mints it in /start; the web app posts it
//    to the telegram-auth edge function. No secret ever appears in a token.
// =============================================================================

export const MAX_AUTH_AGE_SECONDS = 300;
/** Small allowance for clock skew between Telegram/bot and this server. */
export const MAX_FUTURE_SKEW_SECONDS = 60;

const LOGIN_TOKEN_PREFIX = 'takeit-tg-login-v1';

export type VerifyFailureReason =
  | 'missing_hash'
  | 'missing_auth_date'
  | 'missing_id'
  | 'bad_hash'
  | 'stale'
  | 'future_auth_date'
  | 'bad_token_format';

export type VerifyResult =
  | { ok: true; telegramId: string; authDate: number; fields: Record<string, string> }
  | { ok: false; reason: VerifyFailureReason };

export interface VerifyOptions {
  /** Injectable clock (seconds since epoch) so tests are deterministic. */
  nowSeconds?: number;
  maxAgeSeconds?: number;
}

// -----------------------------------------------------------------------------
// Crypto primitives (WebCrypto — identical on Deno and Node >= 20)
// -----------------------------------------------------------------------------
const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

async function sha256Bytes(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
}

async function hmacSha256Hex(keyBytes: Uint8Array, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/** Constant-time string comparison (length leak only, as usual). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// -----------------------------------------------------------------------------
// Telegram Login Widget
// -----------------------------------------------------------------------------

/** All fields except `hash`, sorted, "key=value" joined with "\n" (Telegram spec). */
export function buildDataCheckString(fields: Record<string, string>): string {
  return Object.keys(fields)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
}

function normalizeFields(payload: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    fields[k] = String(v);
  }
  return fields;
}

export async function verifyTelegramWidget(
  payload: Record<string, unknown>,
  botToken: string,
  opts: VerifyOptions = {},
): Promise<VerifyResult> {
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = opts.maxAgeSeconds ?? MAX_AUTH_AGE_SECONDS;

  const fields = normalizeFields(payload);
  const hash = fields['hash'];
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'missing_hash' };
  if (!fields['id']) return { ok: false, reason: 'missing_id' };
  const authDate = Number(fields['auth_date']);
  if (!Number.isInteger(authDate) || authDate <= 0) {
    return { ok: false, reason: 'missing_auth_date' };
  }

  const secretKey = await sha256Bytes(botToken);
  const expected = await hmacSha256Hex(secretKey, buildDataCheckString(fields));
  if (!timingSafeEqualStr(expected, hash)) return { ok: false, reason: 'bad_hash' };

  // Freshness AFTER authenticity: a valid-but-old payload is 'stale', while a
  // forged one is always 'bad_hash' regardless of its claimed time.
  if (now - authDate > maxAge) return { ok: false, reason: 'stale' };
  if (authDate - now > MAX_FUTURE_SKEW_SECONDS) {
    return { ok: false, reason: 'future_auth_date' };
  }

  return { ok: true, telegramId: fields['id'], authDate, fields };
}

// -----------------------------------------------------------------------------
// Bot deep-link login token (stateless)
// -----------------------------------------------------------------------------

export async function mintLoginToken(
  telegramId: string,
  botToken: string,
  nowSeconds?: number,
): Promise<string> {
  const issuedAt = nowSeconds ?? Math.floor(Date.now() / 1000);
  const secretKey = await sha256Bytes(botToken);
  const mac = await hmacSha256Hex(
    secretKey,
    `${LOGIN_TOKEN_PREFIX}\n${telegramId}\n${issuedAt}`,
  );
  return `v1.${telegramId}.${issuedAt}.${mac}`;
}

export async function verifyLoginToken(
  token: string,
  botToken: string,
  opts: VerifyOptions = {},
): Promise<VerifyResult> {
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = opts.maxAgeSeconds ?? MAX_AUTH_AGE_SECONDS;

  const match = /^v1\.(\d{1,20})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!match) return { ok: false, reason: 'bad_token_format' };
  const [, telegramId, issuedAtStr, mac] = match;
  const issuedAt = Number(issuedAtStr);

  const secretKey = await sha256Bytes(botToken);
  const expected = await hmacSha256Hex(
    secretKey,
    `${LOGIN_TOKEN_PREFIX}\n${telegramId}\n${issuedAt}`,
  );
  if (!timingSafeEqualStr(expected, mac)) return { ok: false, reason: 'bad_hash' };

  if (now - issuedAt > maxAge) return { ok: false, reason: 'stale' };
  if (issuedAt - now > MAX_FUTURE_SKEW_SECONDS) {
    return { ok: false, reason: 'future_auth_date' };
  }

  return {
    ok: true,
    telegramId,
    authDate: issuedAt,
    fields: { id: telegramId, auth_date: String(issuedAt) },
  };
}
