// The expected widget hash is computed here with node:crypto — an INDEPENDENT
// implementation of Telegram's spec — so these tests do not verify the
// WebCrypto helper against itself (the verifier-that-cannot-fail disease).
import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildDataCheckString,
  mintLoginToken,
  timingSafeEqualStr,
  verifyLoginToken,
  verifyTelegramWidget,
} from './telegramAuth.ts';

const BOT_TOKEN = '1234567890:TEST-FAKE-TOKEN-not-a-real-secret';
const NOW = 1_756_200_000; // fixed clock for determinism

/** Independent (node:crypto) implementation of the Telegram widget hash. */
function telegramHash(fields: Record<string, string | number>, botToken: string): string {
  const dcs = Object.keys(fields)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  return createHmac('sha256', secret).update(dcs).digest('hex');
}

function widgetPayload(
  overrides: Record<string, string | number> = {},
): Record<string, string | number> {
  const fields: Record<string, string | number> = {
    id: 987654321,
    first_name: 'Abebe',
    username: 'abebe_k',
    photo_url: 'https://t.me/i/userpic/320/abebe.jpg',
    auth_date: NOW - 10,
    ...overrides,
  };
  return { ...fields, hash: telegramHash(fields, BOT_TOKEN) };
}

describe('verifyTelegramWidget', () => {
  it('accepts a fresh, correctly signed payload', async () => {
    const r = await verifyTelegramWidget(widgetPayload(), BOT_TOKEN, { nowSeconds: NOW });
    expect(r).toMatchObject({ ok: true, telegramId: '987654321' });
  });

  it('rejects a payload with any tampered field', async () => {
    const payload = widgetPayload();
    const tampered = { ...payload, id: 111111111 };
    const r = await verifyTelegramWidget(tampered, BOT_TOKEN, { nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: 'bad_hash' });
  });

  it('rejects a payload signed with a different bot token', async () => {
    const r = await verifyTelegramWidget(widgetPayload(), 'other:token', {
      nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: false, reason: 'bad_hash' });
  });

  it('rejects a stale payload (auth_date older than 300 s)', async () => {
    const payload = widgetPayload({ auth_date: NOW - 301 });
    const r = await verifyTelegramWidget(payload, BOT_TOKEN, { nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: 'stale' });
  });

  it('accepts exactly at the 300 s boundary', async () => {
    const payload = widgetPayload({ auth_date: NOW - 300 });
    const r = await verifyTelegramWidget(payload, BOT_TOKEN, { nowSeconds: NOW });
    expect(r.ok).toBe(true);
  });

  it('rejects an auth_date too far in the future', async () => {
    const payload = widgetPayload({ auth_date: NOW + 3600 });
    const r = await verifyTelegramWidget(payload, BOT_TOKEN, { nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: 'future_auth_date' });
  });

  it('rejects a missing or malformed hash', async () => {
    const { hash: _hash, ...noHash } = widgetPayload();
    expect(await verifyTelegramWidget(noHash, BOT_TOKEN, { nowSeconds: NOW })).toEqual({
      ok: false,
      reason: 'missing_hash',
    });
    expect(
      await verifyTelegramWidget({ ...noHash, hash: 'zz' }, BOT_TOKEN, { nowSeconds: NOW }),
    ).toEqual({ ok: false, reason: 'missing_hash' });
  });

  it('rejects missing id / auth_date', async () => {
    const { id: _id, ...rest } = widgetPayload();
    expect(await verifyTelegramWidget(rest, BOT_TOKEN, { nowSeconds: NOW })).toEqual({
      ok: false,
      reason: 'missing_id',
    });
    const payload = widgetPayload({ auth_date: 'soon' as unknown as number });
    expect(await verifyTelegramWidget(payload, BOT_TOKEN, { nowSeconds: NOW })).toEqual({
      ok: false,
      reason: 'missing_auth_date',
    });
  });

  it('buildDataCheckString sorts fields and excludes hash (Telegram spec)', () => {
    const dcs = buildDataCheckString({
      username: 'abebe_k',
      id: '987654321',
      auth_date: '123',
      hash: 'deadbeef',
    });
    expect(dcs).toBe('auth_date=123\nid=987654321\nusername=abebe_k');
  });
});

describe('login deep-link token', () => {
  it('round-trips mint → verify', async () => {
    const token = await mintLoginToken('987654321', BOT_TOKEN, NOW);
    const r = await verifyLoginToken(token, BOT_TOKEN, { nowSeconds: NOW + 5 });
    expect(r).toMatchObject({ ok: true, telegramId: '987654321', authDate: NOW });
  });

  it('never embeds the bot token or its parts in the token', async () => {
    const token = await mintLoginToken('987654321', BOT_TOKEN, NOW);
    expect(token).not.toContain(BOT_TOKEN);
    expect(token).not.toContain(BOT_TOKEN.split(':')[1]);
  });

  it('rejects a tampered telegram_id', async () => {
    const token = await mintLoginToken('987654321', BOT_TOKEN, NOW);
    const tampered = token.replace('987654321', '111111111');
    const r = await verifyLoginToken(tampered, BOT_TOKEN, { nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: 'bad_hash' });
  });

  it('rejects a token minted with a different bot token', async () => {
    const token = await mintLoginToken('987654321', 'other:token', NOW);
    const r = await verifyLoginToken(token, BOT_TOKEN, { nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: 'bad_hash' });
  });

  it('rejects a stale token (> 300 s)', async () => {
    const token = await mintLoginToken('987654321', BOT_TOKEN, NOW - 301);
    const r = await verifyLoginToken(token, BOT_TOKEN, { nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: 'stale' });
  });

  it('rejects garbage token formats', async () => {
    for (const bad of ['', 'v1.abc.123.deadbeef', 'v2.1.2.' + 'a'.repeat(64), 'v1.1.2.short']) {
      const r = await verifyLoginToken(bad, BOT_TOKEN, { nowSeconds: NOW });
      expect(r).toEqual({ ok: false, reason: 'bad_token_format' });
    }
  });
});

describe('timingSafeEqualStr', () => {
  it('compares correctly', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true);
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false);
    expect(timingSafeEqualStr('abc', 'ab')).toBe(false);
  });
});
