import { describe, expect, it } from 'vitest';
import {
  BIO_MAX_LENGTH,
  DEFAULT_AVAILABILITY,
  ID_IMAGE_MAX_INPUT_BYTES,
  MAX_PRICE_CENTS,
  SKILLS_MAX_COUNT,
  buildVerificationPath,
  centsToEtbInput,
  fitWithin,
  hasPendingVerification,
  isMaskedContactSafe,
  isPriceType,
  latestVerification,
  maskGuarantorContact,
  notificationLabelKey,
  notificationRoute,
  parseAvailability,
  parseEtbInput,
  parseRadius,
  parseSkills,
  serializeAvailability,
  skillsToInput,
  toggleValue,
  validateBio,
  validateCategories,
  validateGuarantorName,
  validateGuarantorStatement,
  validateHours,
  validateIdImageFile,
  validatePrices,
} from '../logic';
import type { VerificationRow } from '../types';

// ---------------------------------------------------------------------------
// Availability jsonb (canonical shape: {"days":[...],"hours":"08:00-18:00"})
// ---------------------------------------------------------------------------

describe('parseAvailability', () => {
  it('parses the exact seed-data shape', () => {
    const parsed = parseAvailability({
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      hours: '08:00-18:00',
    });
    expect(parsed.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
    expect(parsed.start).toBe('08:00');
    expect(parsed.end).toBe('18:00');
  });

  it('degrades garbage to defaults instead of crashing', () => {
    expect(parseAvailability(null)).toEqual(DEFAULT_AVAILABILITY);
    expect(parseAvailability('nonsense')).toEqual(DEFAULT_AVAILABILITY);
    expect(parseAvailability([])).toEqual(DEFAULT_AVAILABILITY);
    expect(parseAvailability(42)).toEqual(DEFAULT_AVAILABILITY);
    expect(parseAvailability({})).toEqual({ ...DEFAULT_AVAILABILITY, days: [] });
  });

  it('drops unknown day names and normalizes order + duplicates', () => {
    const parsed = parseAvailability({
      days: ['fri', 'blursday', 'mon', 'mon', 7],
      hours: '09:00-17:00',
    });
    expect(parsed.days).toEqual(['mon', 'fri']); // WEEK_DAYS order, deduped
  });

  it('rejects malformed hours strings (falls back to default hours)', () => {
    expect(parseAvailability({ days: [], hours: '8-18' }).start).toBe('08:00');
    expect(parseAvailability({ days: [], hours: '25:00-26:00' }).start).toBe(
      '08:00',
    );
  });
});

describe('serializeAvailability', () => {
  it('round-trips to the canonical DB shape', () => {
    const serialized = serializeAvailability({
      days: ['sat', 'mon'],
      start: '07:30',
      end: '19:00',
    });
    expect(serialized).toEqual({ days: ['mon', 'sat'], hours: '07:30-19:00' });
    // and parses back identically
    expect(parseAvailability(serialized)).toEqual({
      days: ['mon', 'sat'],
      start: '07:30',
      end: '19:00',
    });
  });
});

describe('validateHours', () => {
  it('accepts a valid range', () => {
    expect(validateHours('08:00', '18:00')).toBeNull();
  });
  it('rejects end <= start (the guard actually fires)', () => {
    expect(validateHours('18:00', '08:00')).toBe('profile.hoursError');
    expect(validateHours('08:00', '08:00')).toBe('profile.hoursError');
  });
  it('rejects malformed times', () => {
    expect(validateHours('8:00', '18:00')).toBe('profile.hoursError');
    expect(validateHours('08:00', '24:00')).toBe('profile.hoursError');
    expect(validateHours('', '')).toBe('profile.hoursError');
  });
});

describe('toggleValue', () => {
  it('adds when absent, removes when present', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});

// ---------------------------------------------------------------------------
// Money (C7: integer cents; string math, no float drift)
// ---------------------------------------------------------------------------

describe('parseEtbInput', () => {
  it('parses whole birr to cents', () => {
    expect(parseEtbInput('350')).toEqual({ kind: 'cents', cents: 35000 });
    expect(parseEtbInput(' 1,250 ')).toEqual({ kind: 'cents', cents: 125000 });
  });

  it('parses fractional birr EXACTLY (no 19.99 → 1998.99… drift)', () => {
    expect(parseEtbInput('19.99')).toEqual({ kind: 'cents', cents: 1999 });
    expect(parseEtbInput('350.5')).toEqual({ kind: 'cents', cents: 35050 });
    expect(parseEtbInput('0.01')).toEqual({ kind: 'cents', cents: 1 });
  });

  it('distinguishes empty from invalid', () => {
    expect(parseEtbInput('')).toEqual({ kind: 'empty' });
    expect(parseEtbInput('   ')).toEqual({ kind: 'empty' });
    expect(parseEtbInput('abc')).toEqual({ kind: 'invalid' });
    expect(parseEtbInput('-5')).toEqual({ kind: 'invalid' });
    expect(parseEtbInput('1.234')).toEqual({ kind: 'invalid' }); // 3 decimals
    expect(parseEtbInput('1.2.3')).toEqual({ kind: 'invalid' });
  });

  it('rejects amounts above the sanity cap', () => {
    expect(parseEtbInput('100000001')).toEqual({ kind: 'invalid' }); // > 100M birr
    expect(parseEtbInput('100000000')).toEqual({
      kind: 'cents',
      cents: MAX_PRICE_CENTS,
    });
  });
});

describe('centsToEtbInput', () => {
  it('formats prefill values', () => {
    expect(centsToEtbInput(null)).toBe('');
    expect(centsToEtbInput(35000)).toBe('350');
    expect(centsToEtbInput(35050)).toBe('350.50');
    expect(centsToEtbInput(1)).toBe('0.01');
  });

  it('round-trips through parseEtbInput', () => {
    for (const cents of [0, 1, 99, 100, 35050, 123456789]) {
      expect(parseEtbInput(centsToEtbInput(cents))).toEqual({
        kind: 'cents',
        cents,
      });
    }
  });
});

describe('validatePrices', () => {
  it('flags min > max on the max field (mirrors the DB CHECK)', () => {
    const result = validatePrices('500', '100');
    expect(result.maxError).toBe('profile.priceOrderError');
    expect(result.minError).toBeNull();
  });
  it('allows equal min and max, single-sided, and empty', () => {
    expect(validatePrices('100', '100').maxError).toBeNull();
    expect(validatePrices('100', '')).toMatchObject({
      minCents: 10000,
      maxCents: null,
      minError: null,
      maxError: null,
    });
    expect(validatePrices('', '').minCents).toBeNull();
  });
  it('reports invalid fields individually', () => {
    const result = validatePrices('abc', 'def');
    expect(result.minError).toBe('profile.priceInvalid');
    expect(result.maxError).toBe('profile.priceInvalid');
  });
});

describe('isPriceType', () => {
  it('accepts exactly the DB CHECK values', () => {
    for (const value of ['hourly', 'fixed', 'per_task', 'negotiable']) {
      expect(isPriceType(value)).toBe(true);
    }
    expect(isPriceType('per-task')).toBe(false);
    expect(isPriceType('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bio / skills / categories / radius
// ---------------------------------------------------------------------------

describe('validateBio', () => {
  it('accepts a normal bio incl. Amharic', () => {
    expect(validateBio('የቤት ጽዳት ባለሙያ ነኝ።')).toBeNull();
  });
  it('rejects over-length (DB CHECK is 2000)', () => {
    expect(validateBio('አ'.repeat(BIO_MAX_LENGTH + 1))).toBe('profile.bioTooLong');
    expect(validateBio('አ'.repeat(BIO_MAX_LENGTH))).toBeNull();
  });
  it('rejects a smuggled phone number (C3)', () => {
    expect(validateBio('call me 0911 23 45 67')).toBe('profile.bioPhone');
    expect(validateBio('ደውሉልኝ +251911234567')).toBe('profile.bioPhone');
  });
});

describe('parseSkills', () => {
  it('splits on Latin and Ethiopic commas, trims, dedupes', () => {
    expect(parseSkills('plumbing, electrical ፣ plumbing,, ').skills).toEqual([
      'plumbing',
      'electrical',
    ]);
  });
  it('bounds the count', () => {
    const raw = Array.from({ length: SKILLS_MAX_COUNT + 1 }, (_, i) => `s${i}`).join(
      ',',
    );
    expect(parseSkills(raw).error).toBe('profile.skillsTooMany');
    const ok = Array.from({ length: SKILLS_MAX_COUNT }, (_, i) => `s${i}`).join(',');
    expect(parseSkills(ok).error).toBeNull();
  });
  it('bounds per-item length', () => {
    expect(parseSkills('x'.repeat(41)).error).toBe('profile.skillTooLong');
  });
  it('rejects a phone number posing as a skill (C3)', () => {
    expect(parseSkills('plumbing, 0911234567').error).toBe('profile.skillsPhone');
  });
  it('round-trips through skillsToInput', () => {
    expect(parseSkills(skillsToInput(['a', 'b'])).skills).toEqual(['a', 'b']);
  });
});

describe('validateCategories', () => {
  it('requires at least one', () => {
    expect(validateCategories([])).toBe('profile.categoriesRequired');
    expect(validateCategories(['home-cleaning'])).toBeNull();
  });
});

describe('parseRadius', () => {
  it('accepts 1..100 whole km (DB CHECK)', () => {
    expect(parseRadius('1')).toEqual({ km: 1, error: null });
    expect(parseRadius('100')).toEqual({ km: 100, error: null });
  });
  it('rejects out-of-range and non-integers', () => {
    expect(parseRadius('0').error).toBe('profile.radiusError');
    expect(parseRadius('101').error).toBe('profile.radiusError');
    expect(parseRadius('7.5').error).toBe('profile.radiusError');
    expect(parseRadius('-3').error).toBe('profile.radiusError');
    expect(parseRadius('').error).toBe('profile.radiusError');
  });
});

// ---------------------------------------------------------------------------
// Guarantors — masked-contact interaction (C3 / DB CHECK: no 7+ digit runs)
// ---------------------------------------------------------------------------

describe('isMaskedContactSafe (the guard itself)', () => {
  it('FAILS on a raw phone number — demonstrated firing, not decoration', () => {
    expect(isMaskedContactSafe('0911234567')).toBe(false);
    expect(isMaskedContactSafe('+251911234567')).toBe(false);
  });
  it('passes properly masked values', () => {
    expect(isMaskedContactSafe('+2519****567')).toBe(true);
    expect(isMaskedContactSafe('091****567')).toBe(true);
  });
});

describe('maskGuarantorContact', () => {
  it('empty input stores null (column is nullable)', () => {
    expect(maskGuarantorContact('')).toEqual({ masked: null, error: null });
    expect(maskGuarantorContact('   ')).toEqual({ masked: null, error: null });
  });

  it('masks Ethiopian numbers; output NEVER contains a 7+ digit run', () => {
    const inputs = [
      '0911234567',
      '+251911234567',
      '251711234567',
      '09 11 23 45 67',
      '+251-91-123-4567',
      '(0911) 234567',
    ];
    for (const input of inputs) {
      const result = maskGuarantorContact(input);
      expect(result.error).toBeNull();
      expect(result.masked).not.toBeNull();
      // the exact DB CHECK predicate
      expect(/[0-9]{7,}/.test(result.masked as string)).toBe(false);
    }
  });

  it('keeps only a masked form, not the input digits', () => {
    const { masked } = maskGuarantorContact('+251911234567');
    expect(masked).toBe('+2519****567');
  });

  it('rejects input that does not look like a phone', () => {
    expect(maskGuarantorContact('ask at the idir').error).toBe(
      'verification.contactInvalid',
    );
    expect(maskGuarantorContact('12345').error).toBe(
      'verification.contactInvalid',
    );
  });
});

describe('validateGuarantorName / Statement', () => {
  it('name: required and bounded to the DB CHECK (120)', () => {
    expect(validateGuarantorName('')).toBe('verification.nameRequired');
    expect(validateGuarantorName('  ')).toBe('verification.nameRequired');
    expect(validateGuarantorName('አ'.repeat(121))).toBe('verification.nameTooLong');
    expect(validateGuarantorName('ወ/ሮ አበበች ተስፋዬ')).toBeNull();
  });
  it('statement bounded to the DB CHECK (2000)', () => {
    expect(validateGuarantorStatement('አ'.repeat(2001))).toBe(
      'verification.statementTooLong',
    );
    expect(validateGuarantorStatement('ታማኝ ሠራተኛ ነው።')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Manual-ID verification
// ---------------------------------------------------------------------------

describe('buildVerificationPath', () => {
  const uid = 'a0000000-0000-4000-8000-000000000001';

  it('first folder segment is EXACTLY the user id (storage policy shape)', () => {
    const path = buildVerificationPath(uid, 'id-front', 1724700000000);
    expect(path.split('/')[0]).toBe(uid);
    expect(path).toBe(`${uid}/id-front-1724700000000.jpg`);
  });

  it('distinct kinds and timestamps never collide', () => {
    expect(buildVerificationPath(uid, 'id-front', 1)).not.toBe(
      buildVerificationPath(uid, 'id-back', 1),
    );
    expect(buildVerificationPath(uid, 'selfie', 1)).not.toBe(
      buildVerificationPath(uid, 'selfie', 2),
    );
  });
});

describe('validateIdImageFile', () => {
  it('rejects non-images — video/* included (C6: no video ever)', () => {
    expect(validateIdImageFile({ type: 'video/mp4', size: 100 })).toBe(
      'verification.fileTypeError',
    );
    expect(validateIdImageFile({ type: 'application/pdf', size: 100 })).toBe(
      'verification.fileTypeError',
    );
    expect(validateIdImageFile({ type: '', size: 100 })).toBe(
      'verification.fileTypeError',
    );
  });
  it('rejects oversized input (the guard fires)', () => {
    expect(
      validateIdImageFile({ type: 'image/jpeg', size: ID_IMAGE_MAX_INPUT_BYTES + 1 }),
    ).toBe('verification.fileTooLarge');
  });
  it('accepts a normal photo', () => {
    expect(validateIdImageFile({ type: 'image/jpeg', size: 2_000_000 })).toBeNull();
    expect(validateIdImageFile({ type: 'image/png', size: 500 })).toBeNull();
  });
});

describe('fitWithin', () => {
  it('never upscales', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it('scales the longest side down to max, preserving aspect', () => {
    expect(fitWithin(3200, 2400, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(2400, 3200, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it('degenerate input degrades to 1×1, never 0 or NaN', () => {
    expect(fitWithin(0, 100, 1600)).toEqual({ width: 1, height: 1 });
    expect(fitWithin(NaN, NaN, 1600)).toEqual({ width: 1, height: 1 });
    expect(fitWithin(100000, 1, 1600).height).toBeGreaterThanOrEqual(1);
  });
});

const verifRow = (
  status: VerificationRow['status'],
  created: string,
): VerificationRow => ({
  id: `id-${created}`,
  method: 'manual_id',
  status,
  created_at: created,
  decided_at: null,
  notes: null,
});

describe('latestVerification / hasPendingVerification', () => {
  it('latest = first row (API orders created_at DESC)', () => {
    const rows = [verifRow('rejected', '2026-08-27'), verifRow('approved', '2026-08-01')];
    expect(latestVerification(rows)?.status).toBe('rejected');
    expect(latestVerification([])).toBeNull();
  });
  it('pending anywhere in history blocks resubmission', () => {
    expect(
      hasPendingVerification([
        verifRow('rejected', '2026-08-27'),
        verifRow('pending', '2026-08-01'),
      ]),
    ).toBe(true);
    expect(hasPendingVerification([verifRow('approved', '2026-08-01')])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

describe('notificationLabelKey', () => {
  it('maps every RPC-enqueued type (audited in functions_triggers.sql)', () => {
    expect(notificationLabelKey('application.received')).toBe(
      'profile.notifApplicationReceived',
    );
    expect(notificationLabelKey('application.accepted')).toBe(
      'profile.notifApplicationAccepted',
    );
    expect(notificationLabelKey('booking.started')).toBe('profile.notifBookingStarted');
    expect(notificationLabelKey('booking.worker_done')).toBe(
      'profile.notifBookingWorkerDone',
    );
    expect(notificationLabelKey('booking.completed')).toBe(
      'profile.notifBookingCompleted',
    );
    expect(notificationLabelKey('booking.cancelled')).toBe(
      'profile.notifBookingCancelled',
    );
    expect(notificationLabelKey('booking.disputed')).toBe(
      'profile.notifBookingDisputed',
    );
    expect(notificationLabelKey('booking.auto_released')).toBe(
      'profile.notifBookingAutoReleased',
    );
    expect(notificationLabelKey('message.new')).toBe('profile.notifMessageNew');
    expect(notificationLabelKey('review.received')).toBe(
      'profile.notifReviewReceived',
    );
  });
  it('unknown types fall back to the generic label, never crash', () => {
    expect(notificationLabelKey('future.type')).toBe('profile.notifGeneric');
    expect(notificationLabelKey('')).toBe('profile.notifGeneric');
  });
});

describe('notificationRoute', () => {
  const bookingId = 'b1111111-2222-4333-8444-555555555555';
  const jobId = 'a1111111-2222-4333-8444-555555555555';

  it('booking_id wins over job_id', () => {
    expect(notificationRoute({ booking_id: bookingId, job_id: jobId })).toBe(
      `/bookings/${bookingId}`,
    );
  });
  it('falls back to job_id', () => {
    expect(notificationRoute({ job_id: jobId })).toBe(`/jobs/${jobId}`);
  });
  it('junk payloads route nowhere (and non-UUID values are ignored)', () => {
    expect(notificationRoute(null)).toBeNull();
    expect(notificationRoute('x')).toBeNull();
    expect(notificationRoute({})).toBeNull();
    expect(notificationRoute({ booking_id: '../admin' })).toBeNull();
    expect(notificationRoute({ booking_id: 42 })).toBeNull();
    expect(notificationRoute([bookingId])).toBeNull();
  });
});
