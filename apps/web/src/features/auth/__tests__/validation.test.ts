import { describe, expect, it } from 'vitest';
import {
  AVATAR_MAX_DIMENSION,
  AVATAR_MAX_INPUT_BYTES,
  DISPLAY_NAME_MAX_LENGTH,
  NEIGHBORHOODS,
  PASSWORD_MIN_LENGTH,
  buildAvatarPath,
  computeResizeDims,
  flagsToRole,
  isNeighborhood,
  needsOnboarding,
  roleToFlags,
  signInErrorKey,
  signUpErrorKey,
  validateAvatarFile,
  validateDisplayName,
  validateEmail,
  validateNeighborhood,
  validatePassword,
} from '../validation';
import { lookupMessage } from '../../../i18n';

describe('validateEmail', () => {
  it('accepts a normal address (with surrounding whitespace)', () => {
    expect(validateEmail('abebe@example.com')).toBeNull();
    expect(validateEmail('  abebe@example.com  ')).toBeNull();
  });

  it('rejects empty, missing @, missing domain dot, inner spaces', () => {
    expect(validateEmail('')).toBe('auth.errorEmailInvalid');
    expect(validateEmail('abebe.example.com')).toBe('auth.errorEmailInvalid');
    expect(validateEmail('abebe@example')).toBe('auth.errorEmailInvalid');
    expect(validateEmail('ab ebe@example.com')).toBe('auth.errorEmailInvalid');
  });
});

describe('validatePassword', () => {
  it('distinguishes empty from too-short', () => {
    expect(validatePassword('')).toBe('auth.errorPasswordRequired');
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(
      'auth.errorPasswordTooShort',
    );
  });

  it('accepts exactly the minimum length', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });
});

describe('validateDisplayName', () => {
  it('accepts Amharic and Latin names', () => {
    expect(validateDisplayName('አበበ ከበደ')).toBeNull();
    expect(validateDisplayName('Abebe Kebede')).toBeNull();
  });

  it('requires non-whitespace content', () => {
    expect(validateDisplayName('')).toBe('auth.errorNameRequired');
    expect(validateDisplayName('   ')).toBe('auth.errorNameRequired');
  });

  it('bounds length to the DB check (80), measured after trim', () => {
    expect(
      validateDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH)),
    ).toBeNull();
    expect(validateDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toBe(
      'auth.errorNameTooLong',
    );
    // trailing spaces do not count against the limit
    expect(
      validateDisplayName(`${'a'.repeat(DISPLAY_NAME_MAX_LENGTH)}   `),
    ).toBeNull();
  });

  // C3 anti-disintermediation: a display name renders on every pre-booking
  // surface, so a phone number smuggled into it must be rejected.
  it('rejects Ethiopian phone numbers hidden in the name (C3)', () => {
    expect(validateDisplayName('Abebe 0911234567')).toBe(
      'auth.errorNamePhone',
    );
    expect(validateDisplayName('Call +251911234567')).toBe(
      'auth.errorNamePhone',
    );
    expect(validateDisplayName('Abebe 09 11 23 45 67')).toBe(
      'auth.errorNamePhone',
    );
    expect(validateDisplayName('ደውሉ 0712345678')).toBe('auth.errorNamePhone');
  });

  it('does not flag ordinary digits that are not phone-shaped', () => {
    expect(validateDisplayName('Abebe 2nd')).toBeNull();
    expect(validateDisplayName('Taxi 4x4')).toBeNull();
  });
});

describe('neighborhoods', () => {
  it('is exactly the SPEC launch list, in order', () => {
    expect(NEIGHBORHOODS.map((n) => n.value)).toEqual([
      'Bole',
      'Kazanchis',
      'CMC',
      'Sarbet',
      'Piazza',
      'Kirkos',
      'Yeka',
    ]);
  });

  it('every option resolves to a real message in BOTH locales', () => {
    for (const n of NEIGHBORHOODS) {
      expect(lookupMessage('am', n.labelKey)).toBeTruthy();
      expect(lookupMessage('en', n.labelKey)).toBeTruthy();
    }
  });

  it('isNeighborhood accepts list members only', () => {
    expect(isNeighborhood('Bole')).toBe(true);
    expect(isNeighborhood('bole')).toBe(false); // canonical casing only
    expect(isNeighborhood('Merkato')).toBe(false);
    expect(isNeighborhood(null)).toBe(false);
    expect(isNeighborhood(undefined)).toBe(false);
  });

  it('validateNeighborhood maps invalid values to the i18n error key', () => {
    expect(validateNeighborhood('Yeka')).toBeNull();
    expect(validateNeighborhood('')).toBe('auth.errorNeighborhoodRequired');
    expect(validateNeighborhood(undefined)).toBe(
      'auth.errorNeighborhoodRequired',
    );
  });
});

describe('dual-role mapping (C4)', () => {
  it('roleToFlags covers all three choices', () => {
    expect(roleToFlags('customer')).toEqual({
      is_customer: true,
      is_worker: false,
    });
    expect(roleToFlags('worker')).toEqual({
      is_customer: false,
      is_worker: true,
    });
    expect(roleToFlags('both')).toEqual({
      is_customer: true,
      is_worker: true,
    });
  });

  it('flagsToRole inverts roleToFlags for every choice', () => {
    for (const role of ['customer', 'worker', 'both'] as const) {
      const flags = roleToFlags(role);
      expect(flagsToRole(flags.is_customer, flags.is_worker)).toBe(role);
    }
  });

  it('a neither-flag row (degenerate DB state) defaults to customer', () => {
    expect(flagsToRole(false, false)).toBe('customer');
  });
});

describe('needsOnboarding', () => {
  it('true for missing profile or missing neighborhood', () => {
    expect(needsOnboarding(null)).toBe(true);
    expect(needsOnboarding(undefined)).toBe(true);
    expect(needsOnboarding({ default_neighborhood: null })).toBe(true);
  });

  it('false once a neighborhood was actively picked', () => {
    expect(needsOnboarding({ default_neighborhood: 'Bole' })).toBe(false);
  });
});

describe('avatar rules (C6: no video ever)', () => {
  it('accepts images under the cap', () => {
    expect(validateAvatarFile({ type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/webp', size: 1024 })).toBeNull();
  });

  it('rejects video, other non-images, and empty types', () => {
    expect(validateAvatarFile({ type: 'video/mp4', size: 1024 })).toBe(
      'auth.errorAvatarType',
    );
    expect(validateAvatarFile({ type: 'application/pdf', size: 1 })).toBe(
      'auth.errorAvatarType',
    );
    expect(validateAvatarFile({ type: '', size: 1 })).toBe(
      'auth.errorAvatarType',
    );
  });

  it('rejects oversized inputs (boundary exact)', () => {
    expect(
      validateAvatarFile({ type: 'image/png', size: AVATAR_MAX_INPUT_BYTES }),
    ).toBeNull();
    expect(
      validateAvatarFile({
        type: 'image/png',
        size: AVATAR_MAX_INPUT_BYTES + 1,
      }),
    ).toBe('auth.errorAvatarTooLarge');
  });

  it('computeResizeDims caps the LONGEST side at 512 preserving ratio', () => {
    expect(computeResizeDims(2048, 1024)).toEqual({ width: 512, height: 256 });
    expect(computeResizeDims(1024, 2048)).toEqual({ width: 256, height: 512 });
    expect(computeResizeDims(4032, 3024)).toEqual({ width: 512, height: 384 });
  });

  it('never upscales small images', () => {
    expect(computeResizeDims(100, 50)).toEqual({ width: 100, height: 50 });
    expect(computeResizeDims(512, 512)).toEqual({ width: 512, height: 512 });
  });

  it('degrades garbage dimensions to 1x1 instead of NaN/0', () => {
    expect(computeResizeDims(NaN, 100)).toEqual({ width: 1, height: 1 });
    expect(computeResizeDims(0, 100)).toEqual({ width: 1, height: 1 });
    expect(computeResizeDims(Infinity, 100)).toEqual({ width: 1, height: 1 });
  });

  it('extreme aspect ratios never produce a 0 dimension', () => {
    const { width, height } = computeResizeDims(100000, 2, AVATAR_MAX_DIMENSION);
    expect(width).toBe(512);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it('buildAvatarPath puts the uid as the FIRST folder segment (storage RLS)', () => {
    const uid = 'e7a1c9f2-0000-4000-8000-123456789abc';
    const path = buildAvatarPath(uid);
    expect(path.split('/')[0]).toBe(uid);
    expect(path).toBe(`${uid}/avatar.jpg`);
  });
});

describe('supabase auth error mapping', () => {
  it('maps known GoTrue messages to specific keys', () => {
    expect(signInErrorKey('Invalid login credentials')).toBe(
      'auth.errorCredentials',
    );
    expect(signUpErrorKey('User already registered')).toBe(
      'auth.errorEmailInUse',
    );
  });

  it('falls back to generic keys for unknown/undefined messages', () => {
    expect(signInErrorKey(undefined)).toBe('auth.errorSignInFailed');
    expect(signInErrorKey('network down')).toBe('auth.errorSignInFailed');
    expect(signUpErrorKey(undefined)).toBe('auth.errorSignUpFailed');
    expect(signUpErrorKey('weird')).toBe('auth.errorSignUpFailed');
  });

  it('every mapped key resolves in BOTH locales', () => {
    for (const key of [
      signInErrorKey('Invalid login credentials'),
      signInErrorKey(undefined),
      signUpErrorKey('User already registered'),
      signUpErrorKey(undefined),
    ]) {
      expect(lookupMessage('am', key)).toBeTruthy();
      expect(lookupMessage('en', key)).toBeTruthy();
    }
  });
});
