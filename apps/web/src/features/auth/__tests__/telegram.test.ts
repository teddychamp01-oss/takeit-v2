import { describe, expect, it } from 'vitest';
import {
  buildTelegramAuthBody,
  mapTelegramFunctionError,
  readTelegramBotUsername,
  type TelegramWidgetUser,
} from '../telegram';

describe('readTelegramBotUsername (the client-side feature flag)', () => {
  it('absent / empty / non-string env means OFF (null)', () => {
    expect(readTelegramBotUsername({})).toBeNull();
    expect(readTelegramBotUsername({ VITE_TELEGRAM_BOT_USERNAME: '' })).toBeNull();
    expect(
      readTelegramBotUsername({ VITE_TELEGRAM_BOT_USERNAME: '   ' }),
    ).toBeNull();
    expect(
      readTelegramBotUsername({ VITE_TELEGRAM_BOT_USERNAME: 42 }),
    ).toBeNull();
    expect(
      readTelegramBotUsername({ VITE_TELEGRAM_BOT_USERNAME: undefined }),
    ).toBeNull();
  });

  it('returns the trimmed username, stripping a leading @', () => {
    expect(
      readTelegramBotUsername({ VITE_TELEGRAM_BOT_USERNAME: 'TakeItBot' }),
    ).toBe('TakeItBot');
    expect(
      readTelegramBotUsername({ VITE_TELEGRAM_BOT_USERNAME: ' @TakeItBot ' }),
    ).toBe('TakeItBot');
  });

  it('a lone @ is still OFF', () => {
    expect(
      readTelegramBotUsername({ VITE_TELEGRAM_BOT_USERNAME: '@' }),
    ).toBeNull();
  });
});

describe('buildTelegramAuthBody', () => {
  it('wraps the widget payload under the `widget` key the edge function expects', () => {
    const user: TelegramWidgetUser = {
      id: 12345,
      auth_date: 1_724_700_000,
      hash: 'abc123',
      first_name: 'Abebe',
      username: 'abebe',
    };
    expect(buildTelegramAuthBody(user)).toEqual({ widget: { ...user } });
  });

  it('copies the payload rather than aliasing it', () => {
    const user: TelegramWidgetUser = {
      id: 1,
      auth_date: 2,
      hash: 'h',
    };
    const body = buildTelegramAuthBody(user);
    expect(body.widget).not.toBe(user);
  });
});

describe('mapTelegramFunctionError', () => {
  it('maps the documented edge-function codes', () => {
    expect(mapTelegramFunctionError('telegram_auth_not_configured')).toBe(
      'not_configured',
    );
    expect(mapTelegramFunctionError('verification_failed')).toBe('rejected');
  });

  it('anything else (unknown code, undefined) is a generic error', () => {
    expect(mapTelegramFunctionError('boom')).toBe('error');
    expect(mapTelegramFunctionError(undefined)).toBe('error');
    expect(mapTelegramFunctionError('')).toBe('error');
  });
});
