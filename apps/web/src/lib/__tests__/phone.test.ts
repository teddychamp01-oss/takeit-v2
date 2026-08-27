import { describe, expect, it } from 'vitest';
import { containsPhoneNumber, maskPhone } from '../phone';

describe('maskPhone', () => {
  it('masks the canonical international form (+2519****567)', () => {
    expect(maskPhone('+251911234567')).toBe('+2519****567');
  });

  it('masks Safaricom (+2517…) numbers', () => {
    expect(maskPhone('+251712345678')).toBe('+2517****678');
  });

  it('masks international form without plus', () => {
    expect(maskPhone('251911234567')).toBe('2519****567');
  });

  it('masks local 09/07 forms', () => {
    expect(maskPhone('0911234567')).toBe('091****567');
    expect(maskPhone('0712345678')).toBe('071****678');
  });

  it('ignores separators before masking', () => {
    expect(maskPhone('+251 91 123 45 67')).toBe('+2519****567');
    expect(maskPhone('091-123-4567')).toBe('091****567');
    expect(maskPhone('(0911) 23.45.67')).toBe('091****567');
  });

  it('degrades unknown shapes to heavier masking, never lighter', () => {
    // 9-digit foreign-looking number: only 2+2 digits survive
    expect(maskPhone('123456789')).toBe('12****89');
    expect(maskPhone('+4915112345678')).toBe('+49****78');
  });

  it('fully masks garbage and too-short input', () => {
    expect(maskPhone('abc')).toBe('****');
    expect(maskPhone('12345')).toBe('****');
    expect(maskPhone('')).toBe('****');
    expect(maskPhone('091123x4567')).toBe('****'); // letter inside → not a number
  });

  it('never leaks middle digits for any Ethiopian form', () => {
    for (const input of ['+251911234567', '0911234567', '251911234567']) {
      const masked = maskPhone(input);
      expect(masked).not.toContain('11234'); // subscriber middle
      expect(masked).toContain('****');
    }
  });
});

describe('containsPhoneNumber', () => {
  it('detects plain Ethiopian forms', () => {
    expect(containsPhoneNumber('+251911234567')).toBe(true);
    expect(containsPhoneNumber('251911234567')).toBe(true);
    expect(containsPhoneNumber('0911234567')).toBe(true);
    expect(containsPhoneNumber('0712345678')).toBe(true);
    expect(containsPhoneNumber('+251712345678')).toBe(true);
  });

  it('detects numbers with separators between digits', () => {
    expect(containsPhoneNumber('+251 91 123 45 67')).toBe(true);
    expect(containsPhoneNumber('091-123-45-67')).toBe(true);
    expect(containsPhoneNumber('09.11.23.45.67')).toBe(true);
    expect(containsPhoneNumber('(+251) 911 234 567')).toBe(true);
    expect(containsPhoneNumber('2519 1123 4567')).toBe(true);
    expect(containsPhoneNumber('091/123/4567')).toBe(true);
  });

  it('detects numbers embedded in Amharic and English text', () => {
    expect(containsPhoneNumber('ደውሉልኝ 0911 234 567 ላይ')).toBe(true);
    expect(containsPhoneNumber('call me at 0911234567 tonight')).toBe(true);
    expect(containsPhoneNumber('my number is +2519-1123-4567!')).toBe(true);
  });

  it('flags a number even when glued to a boundary evasion character', () => {
    expect(containsPhoneNumber('x+251911234567')).toBe(true);
  });

  it('does not flag ordinary text and prices', () => {
    expect(containsPhoneNumber('')).toBe(false);
    expect(containsPhoneNumber('ሰላም! ዋጋው 2,500 ብር ነው።')).toBe(false);
    expect(containsPhoneNumber('I need 25 kg of cement and 40 nails')).toBe(false);
    expect(containsPhoneNumber('Room 12, building 45, Bole')).toBe(false);
    expect(containsPhoneNumber('ETB 1,234,567 total')).toBe(false);
  });

  it('does not flag timestamps or short digit runs', () => {
    expect(containsPhoneNumber('meeting 2026-09-11 at 23:45')).toBe(false);
    expect(containsPhoneNumber('order #0912')).toBe(false);
    expect(containsPhoneNumber('the year 2519')).toBe(false);
  });

  it('does not flag digit runs that are too long to be a phone', () => {
    // 11 digits starting 09 — not a valid Ethiopian number
    expect(containsPhoneNumber('09112345678')).toBe(false);
    // phone-like sequence embedded inside a longer number
    expect(containsPhoneNumber('12519112345670')).toBe(false);
  });
});
