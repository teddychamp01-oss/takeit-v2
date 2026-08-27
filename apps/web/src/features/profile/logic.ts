// Pure logic for the profile + verification feature — no supabase, no DOM.
// Everything here is unit-tested (validation, money parsing, availability
// jsonb mapping, guarantor-contact masking interaction, path building).
//
// DB constraints these rules mirror (audited in 20260827000300_tables.sql):
//   * worker_profiles.bio <= 2000, travel_radius_km 1..100,
//     price_type in ('hourly','fixed','per_task','negotiable'),
//     price_min_cents <= price_max_cents (both >= 0)
//   * guarantors.guarantor_name 1..120, statement <= 2000,
//     guarantor_contact_masked rejects 7+ consecutive digits (C3)
//   * verifications image paths: first storage folder segment must equal
//     auth.uid() (storage policy in 20260827000600_storage_realtime.sql)

import { containsPhoneNumber, maskPhone } from '../../lib/phone';
import type { MessageKey } from '../../i18n';
import type { GuarantorType, VerificationRow } from './types';

// ---------------------------------------------------------------------------
// Neighborhoods (SPEC launch list). Same value/label pattern as the other
// features: the stored VALUE is the canonical Latin name; labels are data
// (proper-noun transliterations), not UI copy.
// ---------------------------------------------------------------------------
export const NEIGHBORHOODS = [
  { value: 'Bole', am: 'ቦሌ', en: 'Bole' },
  { value: 'Kazanchis', am: 'ካዛንቺስ', en: 'Kazanchis' },
  { value: 'CMC', am: 'ሲኤምሲ', en: 'CMC' },
  { value: 'Sarbet', am: 'ሳርቤት', en: 'Sarbet' },
  { value: 'Piazza', am: 'ፒያሳ', en: 'Piazza' },
  { value: 'Kirkos', am: 'ቂርቆስ', en: 'Kirkos' },
  { value: 'Yeka', am: 'የካ', en: 'Yeka' },
] as const;

// ---------------------------------------------------------------------------
// Weekly availability (worker_profiles.availability jsonb).
// Canonical shape — matches the seed data exactly:
//   {"days":["mon","tue",...],"hours":"08:00-18:00"}
// ---------------------------------------------------------------------------
export const WEEK_DAYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;
export type DayKey = (typeof WEEK_DAYS)[number];

export const DAY_LABEL_KEYS: Record<DayKey, MessageKey> = {
  mon: 'profile.dayMon',
  tue: 'profile.dayTue',
  wed: 'profile.dayWed',
  thu: 'profile.dayThu',
  fri: 'profile.dayFri',
  sat: 'profile.daySat',
  sun: 'profile.daySun',
};

export interface WeeklyAvailability {
  days: DayKey[];
  /** 'HH:MM', 24h. */
  start: string;
  /** 'HH:MM', 24h — must be after start. */
  end: string;
}

export const DEFAULT_AVAILABILITY: WeeklyAvailability = {
  days: [],
  start: '08:00',
  end: '18:00',
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const HOURS_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parse the availability jsonb defensively. Unknown/garbage shapes degrade
 * to DEFAULT_AVAILABILITY — a malformed row must never crash the editor.
 * Day order is normalized to WEEK_DAYS order and duplicates are dropped.
 */
export function parseAvailability(raw: unknown): WeeklyAvailability {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_AVAILABILITY };
  }
  const obj = raw as Record<string, unknown>;
  const days: DayKey[] = Array.isArray(obj.days)
    ? WEEK_DAYS.filter((day) => (obj.days as unknown[]).some((d) => d === day))
    : [];
  let start = DEFAULT_AVAILABILITY.start;
  let end = DEFAULT_AVAILABILITY.end;
  if (typeof obj.hours === 'string' && HOURS_RE.test(obj.hours)) {
    const [s, e] = obj.hours.split('-');
    start = s;
    end = e;
  }
  return { days, start, end };
}

/** Serialize back to the canonical jsonb shape the seed/DB uses. */
export function serializeAvailability(value: WeeklyAvailability): {
  days: DayKey[];
  hours: string;
} {
  return {
    days: WEEK_DAYS.filter((day) => value.days.includes(day)),
    hours: `${value.start}-${value.end}`,
  };
}

/**
 * Validate an HH:MM range. Zero-padded 24h strings compare correctly as
 * strings, so `end > start` is a plain string comparison.
 */
export function validateHours(start: string, end: string): MessageKey | null {
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return 'profile.hoursError';
  if (end <= start) return 'profile.hoursError';
  return null;
}

/** Toggle a value in a list (used for day chips and category chips). */
export function toggleValue<T>(list: readonly T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

// ---------------------------------------------------------------------------
// Money (SPEC C7: integer cents + 'ETB'; the client NEVER does float math on
// money — parsing is done on the digit strings).
// ---------------------------------------------------------------------------
/** Sanity cap: 100 million birr in cents. Validation bound, not a price. */
export const MAX_PRICE_CENTS = 10_000_000_000;

export type EtbParse =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'cents'; cents: number };

/**
 * Parse a user-typed ETB amount ('350', '1,250.50') into integer cents.
 * String math only: '19.99' is exactly 1999, never 1998.999….
 */
export function parseEtbInput(raw: string): EtbParse {
  const trimmed = raw.trim().replace(/,/g, '');
  if (trimmed === '') return { kind: 'empty' };
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return { kind: 'invalid' };
  const [, whole, frac = ''] = match;
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents) || cents > MAX_PRICE_CENTS) {
    return { kind: 'invalid' };
  }
  return { kind: 'cents', cents };
}

/** Prefill helper: integer cents → input string ('35000' cents → '350'). */
export function centsToEtbInput(cents: number | null): string {
  if (cents == null) return '';
  const whole = Math.trunc(cents / 100);
  const frac = Math.abs(cents % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

export interface PriceValidation {
  minCents: number | null;
  maxCents: number | null;
  minError: MessageKey | null;
  maxError: MessageKey | null;
}

/** Field-level price validation incl. the DB's min<=max cross check. */
export function validatePrices(minRaw: string, maxRaw: string): PriceValidation {
  const min = parseEtbInput(minRaw);
  const max = parseEtbInput(maxRaw);
  const result: PriceValidation = {
    minCents: min.kind === 'cents' ? min.cents : null,
    maxCents: max.kind === 'cents' ? max.cents : null,
    minError: min.kind === 'invalid' ? 'profile.priceInvalid' : null,
    maxError: max.kind === 'invalid' ? 'profile.priceInvalid' : null,
  };
  if (
    result.minError === null &&
    result.maxError === null &&
    result.minCents != null &&
    result.maxCents != null &&
    result.minCents > result.maxCents
  ) {
    result.maxError = 'profile.priceOrderError';
  }
  return result;
}

/** Values allowed by the worker_profiles.price_type CHECK constraint. */
export const PRICE_TYPES = [
  { value: 'hourly', labelKey: 'profile.priceTypeHourly' },
  { value: 'fixed', labelKey: 'profile.priceTypeFixed' },
  { value: 'per_task', labelKey: 'profile.priceTypePerTask' },
  { value: 'negotiable', labelKey: 'profile.priceTypeNegotiable' },
] as const satisfies readonly { value: string; labelKey: MessageKey }[];

export type PriceType = (typeof PRICE_TYPES)[number]['value'];

export function isPriceType(value: unknown): value is PriceType {
  return PRICE_TYPES.some((p) => p.value === value);
}

// ---------------------------------------------------------------------------
// Bio / skills / categories / radius
// ---------------------------------------------------------------------------
export const BIO_MAX_LENGTH = 2000; // DB CHECK
export const SKILLS_MAX_COUNT = 10;
export const SKILL_MAX_LENGTH = 40;

/**
 * Bio is public to every signed-in user, so C3 applies: no phone numbers
 * smuggled into free text.
 */
export function validateBio(raw: string): MessageKey | null {
  if (raw.trim().length > BIO_MAX_LENGTH) return 'profile.bioTooLong';
  if (containsPhoneNumber(raw)) return 'profile.bioPhone';
  return null;
}

export interface SkillsParse {
  skills: string[];
  error: MessageKey | null;
}

/**
 * Parse a comma-separated skill list (Latin ',' and Ethiopic '፣' both work):
 * trim, drop empties, dedupe. Bounded (count + per-item length) and — C3 —
 * no phone numbers hiding in a "skill".
 */
export function parseSkills(raw: string): SkillsParse {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const part of raw.split(/[,፣]/)) {
    const skill = part.trim();
    if (skill.length === 0) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push(skill);
  }
  if (skills.length > SKILLS_MAX_COUNT) {
    return { skills, error: 'profile.skillsTooMany' };
  }
  if (skills.some((skill) => skill.length > SKILL_MAX_LENGTH)) {
    return { skills, error: 'profile.skillTooLong' };
  }
  if (skills.some((skill) => containsPhoneNumber(skill))) {
    return { skills, error: 'profile.skillsPhone' };
  }
  return { skills, error: null };
}

/** Prefill helper for the comma-separated skills input. */
export function skillsToInput(skills: readonly string[]): string {
  return skills.join(', ');
}

/** A worker must offer at least one category (otherwise unmatchable). */
export function validateCategories(categories: readonly string[]): MessageKey | null {
  return categories.length === 0 ? 'profile.categoriesRequired' : null;
}

export const RADIUS_MIN = 1; // DB CHECK: between 1 and 100
export const RADIUS_MAX = 100;

/** Parse + bound the travel radius. Whole km only. */
export function parseRadius(raw: string): { km: number | null; error: MessageKey | null } {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return { km: null, error: 'profile.radiusError' };
  const km = Number(trimmed);
  if (km < RADIUS_MIN || km > RADIUS_MAX) {
    return { km: null, error: 'profile.radiusError' };
  }
  return { km, error: null };
}

// ---------------------------------------------------------------------------
// Guarantors (community vouching — SPEC S4 trust layer)
// ---------------------------------------------------------------------------
export const GUARANTOR_TYPES = [
  { value: 'idir', labelKey: 'verification.typeIdir' },
  { value: 'equb', labelKey: 'verification.typeEqub' },
  { value: 'employer', labelKey: 'verification.typeEmployer' },
  { value: 'verified_worker', labelKey: 'verification.typeVerifiedWorker' },
] as const satisfies readonly { value: GuarantorType; labelKey: MessageKey }[];

export const GUARANTOR_NAME_MAX = 120; // DB CHECK
export const GUARANTOR_STATEMENT_MAX = 2000; // DB CHECK

export function validateGuarantorName(raw: string): MessageKey | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 'verification.nameRequired';
  if (trimmed.length > GUARANTOR_NAME_MAX) return 'verification.nameTooLong';
  return null;
}

export function validateGuarantorStatement(raw: string): MessageKey | null {
  return raw.trim().length > GUARANTOR_STATEMENT_MAX
    ? 'verification.statementTooLong'
    : null;
}

/**
 * The DB CHECK on guarantors.guarantor_contact_masked rejects any value with
 * 7+ consecutive digits. This mirrors that exact predicate client-side so the
 * mask can be verified before insert (and so tests can demonstrate the guard
 * FAILING on a raw number — Gate 2).
 */
export function isMaskedContactSafe(value: string): boolean {
  return !/[0-9]{7,}/.test(value);
}

export type GuarantorContactResult =
  | { masked: string | null; error: null }
  | { masked: null; error: MessageKey };

/**
 * Turn the typed guarantor phone into the STORED, masked value (C3).
 * Empty is allowed (column is nullable). A non-empty value must look like a
 * phone; the output is maskPhone()'s masked form and is re-checked against
 * the DB predicate — if masking ever failed to strip digits we refuse to
 * submit rather than trip the DB CHECK with a raw number in-flight.
 */
export function maskGuarantorContact(raw: string): GuarantorContactResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { masked: null, error: null };
  if (!containsPhoneNumber(trimmed)) {
    return { masked: null, error: 'verification.contactInvalid' };
  }
  const masked = maskPhone(trimmed);
  if (!isMaskedContactSafe(masked)) {
    return { masked: null, error: 'verification.contactInvalid' };
  }
  return { masked, error: null };
}

// ---------------------------------------------------------------------------
// Manual-ID verification (C2)
// ---------------------------------------------------------------------------
export type IdImageKind = 'id-front' | 'id-back' | 'selfie';

export const ID_IMAGE_MAX_INPUT_BYTES = 10 * 1024 * 1024; // pre-compression
/** Documents need to stay legible for the ops reviewer — larger than avatars. */
export const ID_IMAGE_MAX_DIMENSION = 1600;

/** Images only (C6: no video, ever) and bounded input size. */
export function validateIdImageFile(file: {
  type: string;
  size: number;
}): MessageKey | null {
  if (!file.type.startsWith('image/')) return 'verification.fileTypeError';
  if (file.size > ID_IMAGE_MAX_INPUT_BYTES) return 'verification.fileTooLarge';
  return null;
}

/**
 * Storage object path in the PRIVATE 'verifications' bucket. The storage
 * policy requires the FIRST folder segment to equal auth.uid() — this is the
 * only shape that can pass it. Timestamped so a resubmission never overwrites
 * evidence of an earlier attempt.
 */
export function buildVerificationPath(
  userId: string,
  kind: IdImageKind,
  timestamp: number,
): string {
  return `${userId}/${kind}-${timestamp}.jpg`;
}

/**
 * Scale (w, h) to fit within `max` on the longest side, preserving aspect
 * ratio, never upscaling, never returning a dimension below 1.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    return { width: 1, height: 1 };
  }
  const w = Math.round(width);
  const h = Math.round(height);
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** Rows come from the API ordered created_at DESC; first row is the latest. */
export function latestVerification(
  rows: readonly VerificationRow[],
): VerificationRow | null {
  return rows.length > 0 ? rows[0] : null;
}

export function hasPendingVerification(rows: readonly VerificationRow[]): boolean {
  return rows.some((row) => row.status === 'pending');
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
/** Types enqueued by the RPCs in 20260827000400_functions_triggers.sql. */
const NOTIFICATION_LABEL_KEYS: Record<string, MessageKey> = {
  'application.received': 'profile.notifApplicationReceived',
  'application.accepted': 'profile.notifApplicationAccepted',
  'booking.started': 'profile.notifBookingStarted',
  'booking.worker_done': 'profile.notifBookingWorkerDone',
  'booking.completed': 'profile.notifBookingCompleted',
  'booking.cancelled': 'profile.notifBookingCancelled',
  'booking.disputed': 'profile.notifBookingDisputed',
  'booking.auto_released': 'profile.notifBookingAutoReleased',
  'message.new': 'profile.notifMessageNew',
  'review.received': 'profile.notifReviewReceived',
};

/** i18n key for a notification type; unknown types get a generic label. */
export function notificationLabelKey(type: string): MessageKey {
  return NOTIFICATION_LABEL_KEYS[type] ?? 'profile.notifGeneric';
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidField(payload: unknown, field: string): string | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

/**
 * Deep-link for a notification payload. booking_id wins over job_id (the
 * booking page is the more specific surface); junk payloads link nowhere.
 */
export function notificationRoute(payload: unknown): string | null {
  const bookingId = uuidField(payload, 'booking_id');
  if (bookingId) return `/bookings/${bookingId}`;
  const jobId = uuidField(payload, 'job_id');
  if (jobId) return `/jobs/${jobId}`;
  return null;
}
