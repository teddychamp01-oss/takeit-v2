import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STATUS_DEF,
  BUDGET_MAX_BIRR,
  DESCRIPTION_MAX,
  EMPTY_POST_JOB_FORM,
  PHONE_MASK_TOKEN,
  POST_JOB_STEPS,
  TIME_WINDOW_PRESETS,
  TITLE_MAX,
  buildAcceptArgs,
  buildApplyArgs,
  buildPackagePrefill,
  buildPostJobArgs,
  centsToBirrInput,
  extractApplicationsCount,
  extractEmbedded,
  formatDateNeeded,
  isIsoDate,
  getErrorMessage,
  localTodayIso,
  maskPhonesInText,
  parseEtbToCents,
  resolvePackageParam,
  rpcErrorKey,
  validateApplyForm,
  validatePostJobStep,
  type PackagePrefillSource,
  type PostJobForm,
} from '../logic';
import { lookupMessage } from '../../../i18n';

const TODAY = '2026-08-27';

/** A form that passes every step — tests mutate one field at a time. */
function validForm(overrides: Partial<PostJobForm> = {}): PostJobForm {
  return {
    ...EMPTY_POST_JOB_FORM,
    categorySlug: 'home-cleaning',
    title: 'Deep clean my apartment',
    description: 'Two bedrooms, kitchen and windows.',
    address: 'Bole, near Edna Mall, 4th floor',
    landmark: 'Edna Mall',
    neighborhood: 'Bole',
    dateNeeded: TODAY,
    timeWindow: 'Morning 08:00–12:00',
    budgetBirr: '2500',
    workersNeeded: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Money (C7: integer cents, no float arithmetic)
// ---------------------------------------------------------------------------
describe('parseEtbToCents', () => {
  it('treats empty input as "no budget" (nullable column)', () => {
    expect(parseEtbToCents('')).toEqual({ ok: true, cents: null });
    expect(parseEtbToCents('   ')).toEqual({ ok: true, cents: null });
  });

  it('parses whole birr, thousands separators, and decimals to exact cents', () => {
    expect(parseEtbToCents('1250')).toEqual({ ok: true, cents: 125000 });
    expect(parseEtbToCents('1,250')).toEqual({ ok: true, cents: 125000 });
    expect(parseEtbToCents('1250.5')).toEqual({ ok: true, cents: 125050 });
    expect(parseEtbToCents('1250.55')).toEqual({ ok: true, cents: 125055 });
    expect(parseEtbToCents('0')).toEqual({ ok: true, cents: 0 });
  });

  it('computes cents from digit strings (no float drift on x.x5 amounts)', () => {
    // 4.35 * 100 === 434.99999… in floats; digit-string math must give 435
    expect(parseEtbToCents('4.35')).toEqual({ ok: true, cents: 435 });
  });

  it('rejects malformed input', () => {
    for (const bad of ['abc', '-5', '12.345', '1.2.3', '1,2,3.', '৫০']) {
      const result = parseEtbToCents(bad);
      expect(result.ok).toBe(false);
    }
  });

  it('enforces the max at the exact boundary', () => {
    expect(parseEtbToCents(String(BUDGET_MAX_BIRR))).toEqual({
      ok: true,
      cents: BUDGET_MAX_BIRR * 100,
    });
    const over = parseEtbToCents(String(BUDGET_MAX_BIRR + 1));
    expect(over).toEqual({ ok: false, errorKey: 'jobs.errorBudgetTooLarge' });
  });

  it('error keys resolve in BOTH locales', () => {
    for (const bad of ['abc', String(BUDGET_MAX_BIRR + 1)]) {
      const result = parseEtbToCents(bad);
      if (!result.ok) {
        expect(lookupMessage('am', result.errorKey)).toBeTruthy();
        expect(lookupMessage('en', result.errorKey)).toBeTruthy();
      }
    }
  });
});

describe('centsToBirrInput', () => {
  it('round-trips with parseEtbToCents', () => {
    for (const cents of [0, 435, 125000, 125050, 125055]) {
      const text = centsToBirrInput(cents);
      expect(parseEtbToCents(text)).toEqual({ ok: true, cents });
    }
  });

  it('formats whole and fractional amounts, blanks nullish/garbage', () => {
    expect(centsToBirrInput(125000)).toBe('1250');
    expect(centsToBirrInput(125005)).toBe('1250.05');
    expect(centsToBirrInput(null)).toBe('');
    expect(centsToBirrInput(undefined)).toBe('');
    expect(centsToBirrInput(-1)).toBe('');
    expect(centsToBirrInput(NaN)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// C3 display masking (application text is stored raw server-side pre-booking)
// ---------------------------------------------------------------------------
describe('maskPhonesInText', () => {
  it('masks local and international Ethiopian numbers', () => {
    expect(maskPhonesInText('Call me at 0911234567 ok?')).not.toContain(
      '0911234567',
    );
    expect(maskPhonesInText('Call me at 0911234567 ok?')).toContain(
      PHONE_MASK_TOKEN,
    );
    expect(maskPhonesInText('+251 91 123 4567 anytime')).not.toContain('4567');
  });

  it('masks numbers with separators between digits', () => {
    const masked = maskPhonesInText('reach me 09-11-23-45-67 tonight');
    expect(masked).toContain(PHONE_MASK_TOKEN);
    expect(masked).not.toMatch(/09-11-23-45-67/);
  });

  it('leaves text without Ethiopian phone numbers untouched (incl. dates)', () => {
    expect(maskPhonesInText('I can come on 2026-08-27 at 10:00')).toBe(
      'I can come on 2026-08-27 at 10:00',
    );
    expect(maskPhonesInText('ጥሩ ሥራ እሠራለሁ')).toBe('ጥሩ ሥራ እሠራለሁ');
    expect(maskPhonesInText('')).toBe('');
  });

  it('never leaves an Ethiopian phone number in its output', () => {
    const samples = [
      'plain 0911234567',
      '0 9 1 1 2 3 4 5 6 7',
      'two: 0911234567 and 0722334455',
      '+251911234567',
    ];
    for (const s of samples) {
      const out = maskPhonesInText(s);
      expect(out.replace(/[\s\-.()/]/g, '')).not.toMatch(/(?:2519|2517|09|07)\d{8}/);
    }
  });
});

// ---------------------------------------------------------------------------
// Wizard validation — bounds mirror the DB CHECKs / RPC guards
// ---------------------------------------------------------------------------
describe('validatePostJobStep', () => {
  it('a fully valid form passes every step including review', () => {
    const form = validForm();
    for (const step of POST_JOB_STEPS) {
      expect(validatePostJobStep(step, form, TODAY)).toEqual({});
    }
  });

  it('category: required', () => {
    expect(
      validatePostJobStep('category', validForm({ categorySlug: null }), TODAY),
    ).toEqual({ categorySlug: 'jobs.errorCategoryRequired' });
  });

  it('details: title bounds are 5–120 measured after trim', () => {
    const errs = (title: string) =>
      validatePostJobStep('details', validForm({ title }), TODAY);
    expect(errs('a'.repeat(4))).toHaveProperty('title');
    expect(errs('a'.repeat(5))).toEqual({});
    expect(errs('a'.repeat(120))).toEqual({});
    expect(errs('a'.repeat(121))).toHaveProperty('title');
    expect(errs(`  ${'a'.repeat(4)}  `)).toHaveProperty('title'); // trim first
  });

  it('details: description capped at 5000', () => {
    expect(
      validatePostJobStep(
        'details',
        validForm({ description: 'd'.repeat(5001) }),
        TODAY,
      ),
    ).toHaveProperty('description');
    expect(
      validatePostJobStep(
        'details',
        validForm({ description: 'd'.repeat(5000) }),
        TODAY,
      ),
    ).toEqual({});
  });

  it('location: address required and capped at 500', () => {
    expect(
      validatePostJobStep('location', validForm({ address: '   ' }), TODAY),
    ).toEqual({ address: 'jobs.errorAddressRequired' });
    expect(
      validatePostJobStep(
        'location',
        validForm({ address: 'a'.repeat(501) }),
        TODAY,
      ),
    ).toEqual({ address: 'jobs.errorAddressTooLong' });
  });

  it('location: landmark capped at 200; neighborhood must be a launch one', () => {
    expect(
      validatePostJobStep(
        'location',
        validForm({ landmark: 'l'.repeat(201) }),
        TODAY,
      ),
    ).toHaveProperty('landmark');
    expect(
      validatePostJobStep(
        'location',
        validForm({ neighborhood: 'Merkato' }),
        TODAY,
      ),
    ).toEqual({ neighborhood: 'jobs.errorNeighborhoodRequired' });
    expect(
      validatePostJobStep('location', validForm({ neighborhood: null }), TODAY),
    ).toEqual({ neighborhood: 'jobs.errorNeighborhoodRequired' });
  });

  it('location: diaspora requires a local contact NAME (mirrors the DB check)', () => {
    expect(
      validatePostJobStep(
        'location',
        validForm({ isDiaspora: true, localContactName: '  ' }),
        TODAY,
      ),
    ).toHaveProperty('localContactName', 'jobs.errorLocalContactNameRequired');
    expect(
      validatePostJobStep(
        'location',
        validForm({ isDiaspora: true, localContactName: 'Sara Tesfaye' }),
        TODAY,
      ),
    ).toEqual({});
  });

  it('location: a typed diaspora phone must be phone-shaped; empty is fine', () => {
    const base = { isDiaspora: true, localContactName: 'Sara Tesfaye' };
    expect(
      validatePostJobStep(
        'location',
        validForm({ ...base, localContactPhone: 'not a phone' }),
        TODAY,
      ),
    ).toHaveProperty('localContactPhone');
    expect(
      validatePostJobStep(
        'location',
        validForm({ ...base, localContactPhone: '0911234567' }),
        TODAY,
      ),
    ).toEqual({});
    expect(
      validatePostJobStep(
        'location',
        validForm({ ...base, localContactPhone: '+251 91 123 4567' }),
        TODAY,
      ),
    ).toEqual({});
    expect(
      validatePostJobStep(
        'location',
        validForm({ ...base, localContactPhone: '' }),
        TODAY,
      ),
    ).toEqual({});
  });

  it('location: contact fields are ignored when the diaspora toggle is OFF', () => {
    expect(
      validatePostJobStep(
        'location',
        validForm({ isDiaspora: false, localContactName: '', localContactPhone: 'junk' }),
        TODAY,
      ),
    ).toEqual({});
  });

  it('schedule: today passes, yesterday fails, empty date is allowed', () => {
    expect(
      validatePostJobStep('schedule', validForm({ dateNeeded: TODAY }), TODAY),
    ).toEqual({});
    expect(
      validatePostJobStep(
        'schedule',
        validForm({ dateNeeded: '2026-08-26' }),
        TODAY,
      ),
    ).toEqual({ dateNeeded: 'jobs.errorDatePast' });
    expect(
      validatePostJobStep('schedule', validForm({ dateNeeded: '' }), TODAY),
    ).toEqual({});
  });

  it('schedule: workers 1–20, integers only', () => {
    const errs = (workersNeeded: number) =>
      validatePostJobStep('schedule', validForm({ workersNeeded }), TODAY);
    expect(errs(0)).toHaveProperty('workersNeeded');
    expect(errs(1)).toEqual({});
    expect(errs(20)).toEqual({});
    expect(errs(21)).toHaveProperty('workersNeeded');
    expect(errs(1.5)).toHaveProperty('workersNeeded');
  });

  it('schedule: time window capped at 120; bad budget surfaces its key', () => {
    expect(
      validatePostJobStep(
        'schedule',
        validForm({ timeWindow: 'w'.repeat(121) }),
        TODAY,
      ),
    ).toHaveProperty('timeWindow');
    expect(
      validatePostJobStep('schedule', validForm({ budgetBirr: 'abc' }), TODAY),
    ).toEqual({ budgetBirr: 'jobs.errorBudgetInvalid' });
  });

  it('review aggregates errors from every step', () => {
    const errors = validatePostJobStep(
      'review',
      validForm({ categorySlug: null, title: 'ab', address: '' }),
      TODAY,
    );
    expect(errors).toHaveProperty('categorySlug');
    expect(errors).toHaveProperty('title');
    expect(errors).toHaveProperty('address');
  });

  it('every error key it can produce resolves in BOTH locales', () => {
    const broken = validatePostJobStep(
      'review',
      validForm({
        categorySlug: null,
        title: 'ab',
        description: 'd'.repeat(5001),
        address: 'a'.repeat(501),
        landmark: 'l'.repeat(201),
        neighborhood: 'Nope',
        isDiaspora: true,
        localContactName: '',
        localContactPhone: 'junk',
        dateNeeded: '2020-01-01',
        timeWindow: 'w'.repeat(121),
        budgetBirr: 'abc',
        workersNeeded: 0,
      }),
      TODAY,
    );
    const keys = Object.values(broken);
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const key of keys) {
      expect(lookupMessage('am', key)).toBeTruthy();
      expect(lookupMessage('en', key)).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// RPC payload shapes (Gate 4 — the exact call shape the client sends,
// parameter names audited against 20260827000400_functions_triggers.sql)
// ---------------------------------------------------------------------------
describe('buildPostJobArgs', () => {
  it('sends EXACTLY the 15 parameter names of rpc_post_job', () => {
    const args = buildPostJobArgs(validForm());
    expect(Object.keys(args).sort()).toEqual(
      [
        'p_category_slug',
        'p_title',
        'p_description',
        'p_service_address_text',
        'p_service_landmark',
        'p_service_neighborhood',
        'p_lat',
        'p_lng',
        'p_is_diaspora',
        'p_local_contact_name',
        'p_local_contact_phone',
        'p_date_needed',
        'p_time_window',
        'p_budget_cents',
        'p_workers_needed',
      ].sort(),
    );
  });

  it('maps values, trims text, converts budget to integer cents', () => {
    const args = buildPostJobArgs(
      validForm({ title: '  Fix my sink  ', budgetBirr: '1,250.50' }),
    );
    expect(args.p_title).toBe('Fix my sink');
    expect(args.p_budget_cents).toBe(125050);
    expect(args.p_category_slug).toBe('home-cleaning');
    expect(args.p_service_neighborhood).toBe('Bole');
    expect(args.p_workers_needed).toBe(1);
    expect(args.p_date_needed).toBe(TODAY);
  });

  it('empty optionals are OMITTED (undefined), never empty strings — the SQL defaults (null) then apply', () => {
    const args = buildPostJobArgs(
      validForm({ description: '  ', landmark: '', timeWindow: '', budgetBirr: '', dateNeeded: '' }),
    );
    expect(args.p_description).toBeUndefined();
    expect(args.p_service_landmark).toBeUndefined();
    expect(args.p_time_window).toBeUndefined();
    expect(args.p_budget_cents).toBeUndefined();
    expect(args.p_date_needed).toBeUndefined();
    // never an empty string in the payload
    expect(Object.values(args)).not.toContain('');
  });

  it('lat/lng pass through together; default is both omitted', () => {
    expect(buildPostJobArgs(validForm()).p_lat).toBeUndefined();
    expect(buildPostJobArgs(validForm()).p_lng).toBeUndefined();
    const args = buildPostJobArgs(validForm({ lat: 9.011, lng: 38.787 }));
    expect(args.p_lat).toBe(9.011);
    expect(args.p_lng).toBe(38.787);
  });

  it('NEVER sends contact fields when the diaspora toggle is off (C3)', () => {
    const args = buildPostJobArgs(
      validForm({
        isDiaspora: false,
        localContactName: 'Typed Then Untoggled',
        localContactPhone: '0911234567',
      }),
    );
    expect(args.p_is_diaspora).toBe(false);
    expect(args.p_local_contact_name).toBeUndefined();
    expect(args.p_local_contact_phone).toBeUndefined();
  });

  it('sends the RAW phone for the diaspora contact — the SERVER masks it', () => {
    const args = buildPostJobArgs(
      validForm({
        isDiaspora: true,
        localContactName: 'Sara Tesfaye',
        localContactPhone: '0911234567',
      }),
    );
    // rpc_post_job applies public.mask_phone() before storing (audited)
    expect(args.p_local_contact_phone).toBe('0911234567');
    expect(args.p_local_contact_name).toBe('Sara Tesfaye');
  });

  it('throws instead of silently mangling an unvalidated form', () => {
    expect(() => buildPostJobArgs(validForm({ budgetBirr: 'abc' }))).toThrow();
    expect(() => buildPostJobArgs(validForm({ categorySlug: null }))).toThrow();
  });
});

describe('buildApplyArgs / buildAcceptArgs', () => {
  it('rpc_apply_to_job shape: p_job_id, p_message, p_committed_window', () => {
    const args = buildApplyArgs('job-1', '  I can do this  ', ' ');
    expect(args.p_job_id).toBe('job-1');
    expect(args.p_message).toBe('I can do this');
    expect(args.p_committed_window).toBeUndefined();
    expect(Object.keys(args).sort()).toEqual([
      'p_committed_window',
      'p_job_id',
      'p_message',
    ]);
  });

  it('rpc_accept_application shape: p_application_id, p_agreed_price_cents', () => {
    const withPrice = buildAcceptArgs('app-1', 125000);
    expect(withPrice.p_application_id).toBe('app-1');
    expect(withPrice.p_agreed_price_cents).toBe(125000);
    // null price -> omitted, so the RPC falls back to the job budget
    expect(buildAcceptArgs('app-1', null).p_agreed_price_cents).toBeUndefined();
    expect(Object.keys(withPrice).sort()).toEqual([
      'p_agreed_price_cents',
      'p_application_id',
    ]);
  });
});

describe('validateApplyForm', () => {
  it('caps message at 1000 and window at 120; empty is allowed', () => {
    expect(validateApplyForm('', '')).toEqual({});
    expect(validateApplyForm('m'.repeat(1000), 'w'.repeat(120))).toEqual({});
    expect(validateApplyForm('m'.repeat(1001), '')).toHaveProperty('message');
    expect(validateApplyForm('', 'w'.repeat(121))).toHaveProperty(
      'committedWindow',
    );
  });
});

// ---------------------------------------------------------------------------
// Server-error mapping
// ---------------------------------------------------------------------------
describe('rpcErrorKey', () => {
  it('maps TAKEIT_ codes embedded in real messages', () => {
    expect(rpcErrorKey('TAKEIT_ALREADY_APPLIED: one application per worker')).toBe(
      'jobs.errorAlreadyApplied',
    );
    expect(
      rpcErrorKey('TAKEIT_JOB_NOT_OPEN: job abc is matched'),
    ).toBe('jobs.errorJobNotOpen');
    expect(rpcErrorKey('TAKEIT_VERIFICATION_LEVEL_TOO_LOW: x requires y')).toBe(
      'jobs.errorVerificationTooLow',
    );
    expect(rpcErrorKey('TAKEIT_PRICE_REQUIRED: pass p_agreed_price_cents')).toBe(
      'jobs.errorPriceRequired',
    );
  });

  it('falls back to the generic key for unknown codes and non-messages', () => {
    expect(rpcErrorKey('TAKEIT_SOMETHING_NEW: ?')).toBe('jobs.errorGeneric');
    expect(rpcErrorKey('network down')).toBe('jobs.errorGeneric');
    expect(rpcErrorKey(undefined)).toBe('jobs.errorGeneric');
    expect(rpcErrorKey(null)).toBe('jobs.errorGeneric');
  });

  it('every mappable RPC failure resolves in BOTH locales', () => {
    const codes = [
      'TAKEIT_AUTH_REQUIRED',
      'TAKEIT_PROFILE_MISSING',
      'TAKEIT_CATEGORY_UNKNOWN',
      'TAKEIT_TITLE_LENGTH',
      'TAKEIT_DESCRIPTION_TOO_LONG',
      'TAKEIT_ADDRESS_TOO_LONG',
      'TAKEIT_BUDGET_NEGATIVE',
      'TAKEIT_WORKERS_NEEDED_RANGE',
      'TAKEIT_GEO_INCOMPLETE',
      'TAKEIT_GEO_RANGE',
      'TAKEIT_DIASPORA_NEEDS_LOCAL_CONTACT',
      'TAKEIT_JOB_NOT_FOUND',
      'TAKEIT_JOB_NOT_OPEN',
      'TAKEIT_CANNOT_APPLY_OWN_JOB',
      'TAKEIT_WORKER_PROFILE_REQUIRED',
      'TAKEIT_CATEGORY_MISMATCH',
      'TAKEIT_VERIFICATION_LEVEL_TOO_LOW',
      'TAKEIT_MESSAGE_TOO_LONG',
      'TAKEIT_WINDOW_TOO_LONG',
      'TAKEIT_ALREADY_APPLIED',
      'TAKEIT_APPLICATION_NOT_FOUND',
      'TAKEIT_NOT_JOB_OWNER',
      'TAKEIT_APPLICATION_NOT_PENDING',
      'TAKEIT_JOB_FULL',
      'TAKEIT_BOOKING_EXISTS',
      'TAKEIT_PRICE_REQUIRED',
      'TAKEIT_UNKNOWN_FUTURE_CODE',
    ];
    for (const code of codes) {
      const key = rpcErrorKey(`${code}: detail`);
      expect(lookupMessage('am', key)).toBeTruthy();
      expect(lookupMessage('en', key)).toBeTruthy();
    }
  });
});

describe('getErrorMessage', () => {
  it('reads message off Error and PostgrestError-shaped objects', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage({ message: 'TAKEIT_JOB_FULL: 1 of 1' })).toBe(
      'TAKEIT_JOB_FULL: 1 of 1',
    );
  });

  it('returns undefined for anything else', () => {
    expect(getErrorMessage(null)).toBeUndefined();
    expect(getErrorMessage('string')).toBeUndefined();
    expect(getErrorMessage({ message: 42 })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PostgREST result-shape mappers
// ---------------------------------------------------------------------------
describe('extractApplicationsCount', () => {
  it('reads the `applications(count)` embed shape', () => {
    expect(extractApplicationsCount([{ count: 3 }])).toBe(3);
    expect(extractApplicationsCount([{ count: 0 }])).toBe(0);
  });

  it('tolerates object, plain number, and degrades garbage to 0', () => {
    expect(extractApplicationsCount({ count: 5 })).toBe(5);
    expect(extractApplicationsCount(7)).toBe(7);
    expect(extractApplicationsCount([])).toBe(0);
    expect(extractApplicationsCount(null)).toBe(0);
    expect(extractApplicationsCount(undefined)).toBe(0);
    expect(extractApplicationsCount({ count: 'x' })).toBe(0);
  });
});

describe('extractEmbedded', () => {
  it('normalizes to-one embeds that arrive as object or array', () => {
    expect(extractEmbedded({ a: 1 })).toEqual({ a: 1 });
    expect(extractEmbedded([{ a: 1 }, { a: 2 }])).toEqual({ a: 1 });
    expect(extractEmbedded([])).toBeNull();
    expect(extractEmbedded(null)).toBeNull();
    expect(extractEmbedded(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Presentation tables + date helpers
// ---------------------------------------------------------------------------
describe('i18n presentation tables', () => {
  it('every time-window preset resolves in BOTH locales', () => {
    for (const preset of TIME_WINDOW_PRESETS) {
      expect(lookupMessage('am', preset.labelKey)).toBeTruthy();
      expect(lookupMessage('en', preset.labelKey)).toBeTruthy();
    }
  });

  it('every application status resolves in BOTH locales', () => {
    for (const def of Object.values(APPLICATION_STATUS_DEF)) {
      expect(lookupMessage('am', def.key)).toBeTruthy();
      expect(lookupMessage('en', def.key)).toBeTruthy();
    }
  });
});

describe('localTodayIso', () => {
  it('formats a local date as YYYY-MM-DD with zero-padding', () => {
    expect(localTodayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localTodayIso(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('formatDateNeeded', () => {
  it('renders something non-empty for a valid date in both locales', () => {
    expect(formatDateNeeded('2026-08-27', 'am')).toBeTruthy();
    expect(formatDateNeeded('2026-08-27', 'en')).toBeTruthy();
  });

  it('N15: am renders the dual Ethiopic (Gregorian) form', () => {
    // Same engine expectation as lib/__tests__/format.test.ts — Node's ICU
    // carries the ethiopic calendar; the helper itself degrades when absent.
    expect(formatDateNeeded('2026-08-27', 'am')).toBe(
      '21 ነሐሴ 2018 (27 ኦገስት 2026)',
    );
  });

  it('N15: en output is unchanged (Gregorian en-GB medium)', () => {
    expect(formatDateNeeded('2026-08-27', 'en')).toBe('27 Aug 2026');
  });

  it('degrades to empty/raw, never throws', () => {
    expect(formatDateNeeded(null, 'am')).toBe('');
    expect(formatDateNeeded('garbage', 'en')).toBe('garbage');
  });
});

describe('isIsoDate', () => {
  it('accepts only the YYYY-MM-DD shape', () => {
    expect(isIsoDate('2026-08-27')).toBe(true);
    expect(isIsoDate('2026-8-27')).toBe(false);
    expect(isIsoDate('27/08/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate('2026-08-27T00:00:00')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// N3 — "Book this package": ?package= param + wizard seeding
// ---------------------------------------------------------------------------
describe('resolvePackageParam', () => {
  it('accepts only uuid-shaped values (case-insensitive)', () => {
    const id = '3f2b8c1d-9a4e-4f6b-8c2d-1e5a7b9c0d2f';
    expect(resolvePackageParam(id)).toBe(id);
    expect(resolvePackageParam(id.toUpperCase())).toBe(id.toUpperCase());
  });

  it('rejects null, empty, garbage, and near-uuids — no DB round trip', () => {
    expect(resolvePackageParam(null)).toBeNull();
    expect(resolvePackageParam('')).toBeNull();
    expect(resolvePackageParam('home-cleaning')).toBeNull();
    expect(resolvePackageParam('3f2b8c1d-9a4e-4f6b-8c2d')).toBeNull();
    expect(
      resolvePackageParam('3f2b8c1d-9a4e-4f6b-8c2d-1e5a7b9c0d2f-extra'),
    ).toBeNull();
  });
});

describe('buildPackagePrefill', () => {
  const EXTRAS =
    'Only what is listed is included — anything else is a new booking.';
  const CATS = [{ slug: 'home-cleaning' }, { slug: 'tutors' }];

  function pkg(
    overrides: Partial<PackagePrefillSource> = {},
  ): PackagePrefillSource {
    return {
      id: '3f2b8c1d-9a4e-4f6b-8c2d-1e5a7b9c0d2f',
      category_slug: 'home-cleaning',
      name_am: 'መደበኛ ጽዳት',
      name_en: 'Standard clean',
      checklist: [
        { am: 'ወለል መጥረግ', en: 'Mop the floors' },
        { am: 'መስኮት ማጽዳት', en: 'Clean the windows' },
      ],
      base_price_cents: 150000,
      ...overrides,
    };
  }

  it('seeds title, checklist-as-description + extras contract, and budget (en)', () => {
    const seed = buildPackagePrefill(pkg(), 'en', EXTRAS, CATS);
    expect(seed).toEqual({
      categorySlug: 'home-cleaning',
      title: 'Standard clean',
      description: `• Mop the floors\n• Clean the windows\n\n${EXTRAS}`,
      budgetBirr: '1500',
    });
  });

  it('uses the Amharic name and checklist text when locale=am', () => {
    const seed = buildPackagePrefill(pkg(), 'am', EXTRAS, CATS);
    expect(seed?.title).toBe('መደበኛ ጽዳት');
    expect(seed?.description).toBe(`• ወለል መጥረግ\n• መስኮት ማጽዳት\n\n${EXTRAS}`);
  });

  it('keeps exact cents in the editable budget (C7: never float birr)', () => {
    const seed = buildPackagePrefill(
      pkg({ base_price_cents: 150050 }),
      'en',
      EXTRAS,
      CATS,
    );
    expect(seed?.budgetBirr).toBe('1500.50');
    expect(parseEtbToCents(seed!.budgetBirr)).toEqual({
      ok: true,
      cents: 150050,
    });
  });

  it('refuses (null) when the package category is not a loaded ACTIVE one', () => {
    expect(
      buildPackagePrefill(pkg({ category_slug: 'retired-cat' }), 'en', EXTRAS, CATS),
    ).toBeNull();
    expect(buildPackagePrefill(pkg(), 'en', EXTRAS, [])).toBeNull();
  });

  it('degrades a missing/garbage checklist to the extras sentence alone', () => {
    for (const bad of [[], null, 'oops', { am: 'x' }, 42]) {
      const seed = buildPackagePrefill(pkg({ checklist: bad }), 'en', EXTRAS, CATS);
      expect(seed?.description).toBe(EXTRAS);
    }
  });

  it('accepts the legacy string-array checklist shape', () => {
    const seed = buildPackagePrefill(
      pkg({ checklist: ['Mop floors', 'Windows'] }),
      'en',
      EXTRAS,
      CATS,
    );
    expect(seed?.description).toBe(`• Mop floors\n• Windows\n\n${EXTRAS}`);
  });

  it('bounds the seeded title and description to the wizard maxima', () => {
    const seed = buildPackagePrefill(
      pkg({
        name_en: 'x'.repeat(TITLE_MAX + 40),
        checklist: [{ am: 'ሀ'.repeat(6000), en: 'y'.repeat(6000) }],
      }),
      'en',
      EXTRAS,
      CATS,
    );
    expect(seed?.title).toHaveLength(TITLE_MAX);
    expect(seed?.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it('the seeded fields pass the wizard validators as-is (happy package)', () => {
    const seed = buildPackagePrefill(pkg(), 'en', EXTRAS, CATS)!;
    const form = validForm({
      categorySlug: seed.categorySlug,
      title: seed.title,
      description: seed.description,
      budgetBirr: seed.budgetBirr,
    });
    expect(validatePostJobStep('review', form, TODAY)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// New surfaces' i18n keys (N3 / N8 / N6c / N11b) resolve in BOTH locales —
// a typo'd key would render as the raw key string on a driver's phone.
// ---------------------------------------------------------------------------
describe('N3/N8/N6c/N11b i18n keys', () => {
  it('resolve in am and en', () => {
    for (const key of [
      'jobs.bookPackageCta',
      'jobs.packageOnlyListed',
      'jobs.acceptChatOpener',
      'jobs.feedAntiScam',
      'jobs.feedMatchCount',
    ] as const) {
      expect(lookupMessage('am', key)).toBeTruthy();
      expect(lookupMessage('en', key)).toBeTruthy();
    }
  });

  it('feedMatchCount interpolates the live count, including zero', () => {
    const msg = lookupMessage('en', 'jobs.feedMatchCount')!;
    expect(msg.replace('{count}', '0')).toContain('0 open jobs');
  });
});
