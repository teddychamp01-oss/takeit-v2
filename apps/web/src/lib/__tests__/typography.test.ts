import { describe, expect, it } from 'vitest';
import { microCaps } from '../typography';

describe('microCaps (N14 — fidel is never uppercased or letter-spaced)', () => {
  it('applies caps styling only for the Latin locale', () => {
    expect(microCaps('en')).toBe('uppercase tracking-wide');
  });

  it('returns NO casing/tracking classes for Amharic', () => {
    expect(microCaps('am')).toBe('');
  });
});
