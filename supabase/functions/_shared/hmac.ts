// Take It v2 — WebCrypto HMAC/SHA-256 helpers for edge functions
// (chapa-webhook signature check, telegram-webhook secret derivation).
// telegramAuth.ts deliberately does NOT import this file: it must stay
// self-contained so its byte-identical Node duplicate needs zero edge deps.

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/** Constant-time string comparison (length leak only). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
