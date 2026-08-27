import { describe, expect, it } from 'vitest';
import { GREETING_KEY, greetingSlot } from '../logic';
import { lookupMessage } from '../../../i18n';

describe('greetingSlot', () => {
  it('boundaries: 5 starts morning, 12 starts afternoon, 18 starts evening', () => {
    expect(greetingSlot(4)).toBe('evening');
    expect(greetingSlot(5)).toBe('morning');
    expect(greetingSlot(11)).toBe('morning');
    expect(greetingSlot(12)).toBe('afternoon');
    expect(greetingSlot(17)).toBe('afternoon');
    expect(greetingSlot(18)).toBe('evening');
    expect(greetingSlot(23)).toBe('evening');
    expect(greetingSlot(0)).toBe('evening');
  });

  it('never crashes on garbage input', () => {
    expect(greetingSlot(Number.NaN)).toBe('evening');
    expect(greetingSlot(Infinity)).toBe('evening');
  });

  it('every greeting key resolves in BOTH locales (no missing-key leaks)', () => {
    for (const key of Object.values(GREETING_KEY)) {
      expect(lookupMessage('am', key)).toBeTruthy();
      expect(lookupMessage('en', key)).toBeTruthy();
    }
  });
});
