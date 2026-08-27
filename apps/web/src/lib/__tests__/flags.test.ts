// normalizeSupportUrl (N12) — the SupportLink renders ONLY for a valid
// https URL. Gate 2: the reject paths are demonstrated actually rejecting
// (unset, blank, http, bare handle, javascript:), not just the happy path.

import { describe, expect, it } from 'vitest';
import { normalizeSupportUrl } from '../flags';

describe('normalizeSupportUrl', () => {
  it('accepts an https t.me URL', () => {
    expect(normalizeSupportUrl('https://t.me/takeit_support')).toBe(
      'https://t.me/takeit_support',
    );
  });

  it('trims surrounding whitespace before validating', () => {
    expect(normalizeSupportUrl('  https://t.me/takeit_support  ')).toBe(
      'https://t.me/takeit_support',
    );
  });

  it('returns null for unset / empty / whitespace-only env', () => {
    expect(normalizeSupportUrl(undefined)).toBeNull();
    expect(normalizeSupportUrl('')).toBeNull();
    expect(normalizeSupportUrl('   ')).toBeNull();
  });

  it('rejects a bare handle (not a URL)', () => {
    expect(normalizeSupportUrl('takeit_support')).toBeNull();
    expect(normalizeSupportUrl('@takeit_support')).toBeNull();
    expect(normalizeSupportUrl('t.me/takeit_support')).toBeNull();
  });

  it('rejects non-https schemes — incl. javascript: (link injection)', () => {
    expect(normalizeSupportUrl('http://t.me/takeit_support')).toBeNull();
    expect(normalizeSupportUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeSupportUrl('tg://resolve?domain=takeit_support')).toBeNull();
  });
});
