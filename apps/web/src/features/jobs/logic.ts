// Pure jobs-feature logic — no supabase import, no DOM. Everything here is
// unit-tested: wizard validation, ETB parsing (integer cents, C7), the exact
// RPC payload shapes (Gate 4: the call shape the real client sends), display
// masking of phone-like text (C3), and RPC-error → i18n-key mapping.
//
// Bounds mirror supabase/migrations/20260827000300_tables.sql and the RPCs in
// 20260827000400_functions_triggers.sql (R1: audited before writing).

import { containsPhoneNumber } from '../../lib/phone';
import { isNeighborhood } from '../auth/validation';
import type { MessageKey } from '../../i18n';

// ---------------------------------------------------------------------------
// Bounds (each one matches a DB CHECK or an RPC guard — see file header)
// ---------------------------------------------------------------------------
export const TITLE_MIN = 5;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 5000;
export const ADDRESS_MAX = 500;
export const LANDMARK_MAX = 200;
export const LOCAL_CONTACT_NAME_MAX = 120;
export const TIME_WINDOW_MAX = 120;
export const APPLY_MESSAGE_MAX = 1000;
export const WORKERS_MIN = 1;
export const WORKERS_MAX = 20;
/**
 * Client-side budget ceiling: 1,000,000 birr. A product bound, not a DB one
 * (the column is bigint) — it stops fat-finger amounts, not real prices.
 */
export const BUDGET_MAX_BIRR = 1_000_000;
/** How many list rows one query requests; law: report what a cap dropped. */
export const LIST_LIMIT = 50;
export const APPLICATIONS_LIMIT = 100;

// ---------------------------------------------------------------------------
// Money: birr text input <-> integer cents (C7 — never float arithmetic)
// ---------------------------------------------------------------------------
export type ParsedBudget =
  | { ok: true; cents: number | null }
  | { ok: false; errorKey: MessageKey };

const BIRR_RE = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parse a user-typed birr amount ("1,250", "1250.50") into integer cents.
 * Empty input is valid and means "no budget" (the column is nullable).
 * Cents are computed from the digit strings — no float multiplication.
 */
export function parseEtbToCents(input: string): ParsedBudget {
  const cleaned = input.trim().replace(/[,\s]/g, '');
  if (cleaned === '') return { ok: true, cents: null };
  const match = BIRR_RE.exec(cleaned);
  if (!match) return { ok: false, errorKey: 'jobs.errorBudgetInvalid' };
  const birr = Number(match[1]);
  if (!Number.isSafeInteger(birr)) {
    return { ok: false, errorKey: 'jobs.errorBudgetTooLarge' };
  }
  if (birr > BUDGET_MAX_BIRR) {
    return { ok: false, errorKey: 'jobs.errorBudgetTooLarge' };
  }
  const frac = (match[2] ?? '').padEnd(2, '0');
  return { ok: true, cents: birr * 100 + Number(frac) };
}

/** Inverse of parseEtbToCents for prefilled inputs. null/undefined -> ''. */
export function centsToBirrInput(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents) || cents < 0) return '';
  const whole = Math.floor(cents / 100);
  const rem = cents % 100;
  return rem === 0 ? String(whole) : `${whole}.${String(rem).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// C3 display masking — belt-and-braces for text the SERVER does not mask
// (application messages / committed windows are stored raw and shown
// pre-booking). Mirrors public.mask_phone_numbers: replace phone-like runs
// with a language-neutral token; if a creative spacing still leaks, blank all.
// ---------------------------------------------------------------------------
const PHONE_RUN = /[+]?\d[\d\s()./-]{5,}\d/g;
export const PHONE_MASK_TOKEN = '[•••]';

export function maskPhonesInText(text: string): string {
  if (!text || !containsPhoneNumber(text)) return text;
  const replaced = text.replace(PHONE_RUN, PHONE_MASK_TOKEN);
  return containsPhoneNumber(replaced) ? PHONE_MASK_TOKEN : replaced;
}

// ---------------------------------------------------------------------------
// Post-a-job wizard
// ---------------------------------------------------------------------------
export type PostJobStep =
  | 'category'
  | 'details'
  | 'location'
  | 'schedule'
  | 'review';

export const POST_JOB_STEPS: readonly PostJobStep[] = [
  'category',
  'details',
  'location',
  'schedule',
  'review',
];

export interface PostJobForm {
  categorySlug: string | null;
  title: string;
  description: string;
  /** TWO-LOCATION model: typed service address — never derived from GPS. */
  address: string;
  landmark: string;
  neighborhood: string | null;
  /** Optional convenience point for service_geo; both set or both null. */
  lat: number | null;
  lng: number | null;
  isDiaspora: boolean;
  localContactName: string;
  localContactPhone: string;
  /** '' or YYYY-MM-DD */
  dateNeeded: string;
  timeWindow: string;
  /** Raw birr text input; parsed via parseEtbToCents. */
  budgetBirr: string;
  workersNeeded: number;
}

export const EMPTY_POST_JOB_FORM: PostJobForm = {
  categorySlug: null,
  title: '',
  description: '',
  address: '',
  landmark: '',
  neighborhood: null,
  lat: null,
  lng: null,
  isDiaspora: false,
  localContactName: '',
  localContactPhone: '',
  dateNeeded: '',
  timeWindow: '',
  budgetBirr: '',
  workersNeeded: 1,
};

export type PostJobField =
  | 'categorySlug'
  | 'title'
  | 'description'
  | 'address'
  | 'landmark'
  | 'neighborhood'
  | 'localContactName'
  | 'localContactPhone'
  | 'dateNeeded'
  | 'timeWindow'
  | 'budgetBirr'
  | 'workersNeeded';

export type FieldErrors = Partial<Record<PostJobField, MessageKey>>;

/** Local YYYY-MM-DD for "not in the past" checks (device-local day). */
export function localTodayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function validateCategory(form: PostJobForm): FieldErrors {
  return form.categorySlug ? {} : { categorySlug: 'jobs.errorCategoryRequired' };
}

function validateDetails(form: PostJobForm): FieldErrors {
  const errors: FieldErrors = {};
  const title = form.title.trim();
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    errors.title = 'jobs.errorTitleLength';
  }
  if (form.description.length > DESCRIPTION_MAX) {
    errors.description = 'jobs.errorDescriptionTooLong';
  }
  return errors;
}

function validateLocation(form: PostJobForm): FieldErrors {
  const errors: FieldErrors = {};
  const address = form.address.trim();
  if (address.length === 0) errors.address = 'jobs.errorAddressRequired';
  else if (address.length > ADDRESS_MAX) errors.address = 'jobs.errorAddressTooLong';
  if (form.landmark.trim().length > LANDMARK_MAX) {
    errors.landmark = 'jobs.errorLandmarkTooLong';
  }
  if (!isNeighborhood(form.neighborhood)) {
    errors.neighborhood = 'jobs.errorNeighborhoodRequired';
  }
  if (form.isDiaspora) {
    const name = form.localContactName.trim();
    if (name.length === 0) {
      errors.localContactName = 'jobs.errorLocalContactNameRequired';
    } else if (name.length > LOCAL_CONTACT_NAME_MAX) {
      errors.localContactName = 'jobs.errorLocalContactNameTooLong';
    }
    const phone = form.localContactPhone.trim();
    if (phone.length > 0 && !containsPhoneNumber(phone)) {
      errors.localContactPhone = 'jobs.errorLocalContactPhoneInvalid';
    }
  }
  return errors;
}

function validateSchedule(form: PostJobForm, todayIso: string): FieldErrors {
  const errors: FieldErrors = {};
  // YYYY-MM-DD compares correctly as text
  if (form.dateNeeded !== '' && form.dateNeeded < todayIso) {
    errors.dateNeeded = 'jobs.errorDatePast';
  }
  if (form.timeWindow.trim().length > TIME_WINDOW_MAX) {
    errors.timeWindow = 'jobs.errorWindowTooLong';
  }
  const budget = parseEtbToCents(form.budgetBirr);
  if (!budget.ok) errors.budgetBirr = budget.errorKey;
  if (
    !Number.isInteger(form.workersNeeded) ||
    form.workersNeeded < WORKERS_MIN ||
    form.workersNeeded > WORKERS_MAX
  ) {
    errors.workersNeeded = 'jobs.errorWorkersRange';
  }
  return errors;
}

export function validatePostJobStep(
  step: PostJobStep,
  form: PostJobForm,
  todayIso: string,
): FieldErrors {
  switch (step) {
    case 'category':
      return validateCategory(form);
    case 'details':
      return validateDetails(form);
    case 'location':
      return validateLocation(form);
    case 'schedule':
      return validateSchedule(form, todayIso);
    case 'review':
      return {
        ...validateCategory(form),
        ...validateDetails(form),
        ...validateLocation(form),
        ...validateSchedule(form, todayIso),
      };
  }
}

// ---------------------------------------------------------------------------
// RPC payloads — parameter names copied from the SQL, verbatim (Gate 4).
// Optional params are set to `undefined` when absent: JSON serialization
// drops those keys, and PostgREST then applies the SQL defaults (all null in
// the audited functions) — identical semantics, and it matches the generated
// Database types (src/lib/database.types.ts) the supabase client enforces.
// ---------------------------------------------------------------------------
export interface RpcPostJobArgs {
  p_category_slug: string;
  p_title: string;
  p_description?: string;
  p_service_address_text?: string;
  p_service_landmark?: string;
  p_service_neighborhood?: string;
  p_lat?: number;
  p_lng?: number;
  p_is_diaspora: boolean;
  p_local_contact_name?: string;
  p_local_contact_phone?: string;
  p_date_needed?: string;
  p_time_window?: string;
  p_budget_cents?: number;
  p_workers_needed: number;
}

/**
 * Build the exact rpc_post_job payload. Assumes validatePostJobStep('review')
 * passed; throws (rather than silently mangling data) if the budget is
 * unparseable. Contact fields are NEVER sent when the diaspora toggle is off,
 * even if the user typed and then untoggled.
 */
export function buildPostJobArgs(form: PostJobForm): RpcPostJobArgs {
  const budget = parseEtbToCents(form.budgetBirr);
  if (!budget.ok) throw new Error('buildPostJobArgs: validate before building');
  if (!form.categorySlug) {
    throw new Error('buildPostJobArgs: category is required');
  }
  const orOmit = (s: string): string | undefined => {
    const trimmed = s.trim();
    return trimmed === '' ? undefined : trimmed;
  };
  return {
    p_category_slug: form.categorySlug,
    p_title: form.title.trim(),
    p_description: orOmit(form.description),
    p_service_address_text: orOmit(form.address),
    p_service_landmark: orOmit(form.landmark),
    p_service_neighborhood: form.neighborhood ?? undefined,
    p_lat: form.lat ?? undefined,
    p_lng: form.lng ?? undefined,
    p_is_diaspora: form.isDiaspora,
    p_local_contact_name: form.isDiaspora
      ? orOmit(form.localContactName)
      : undefined,
    p_local_contact_phone: form.isDiaspora
      ? orOmit(form.localContactPhone)
      : undefined,
    p_date_needed: form.dateNeeded === '' ? undefined : form.dateNeeded,
    p_time_window: orOmit(form.timeWindow),
    p_budget_cents: budget.cents ?? undefined,
    p_workers_needed: form.workersNeeded,
  };
}

export interface RpcApplyArgs {
  p_job_id: string;
  p_message?: string;
  p_committed_window?: string;
}

export function buildApplyArgs(
  jobId: string,
  message: string,
  committedWindow: string,
): RpcApplyArgs {
  const orOmit = (s: string): string | undefined => {
    const v = s.trim();
    return v === '' ? undefined : v;
  };
  return {
    p_job_id: jobId,
    p_message: orOmit(message),
    p_committed_window: orOmit(committedWindow),
  };
}

export interface ApplyFormErrors {
  message?: MessageKey;
  committedWindow?: MessageKey;
}

export function validateApplyForm(
  message: string,
  committedWindow: string,
): ApplyFormErrors {
  const errors: ApplyFormErrors = {};
  if (message.trim().length > APPLY_MESSAGE_MAX) {
    errors.message = 'jobs.errorMessageTooLong';
  }
  if (committedWindow.trim().length > TIME_WINDOW_MAX) {
    errors.committedWindow = 'jobs.errorWindowTooLong';
  }
  return errors;
}

export interface RpcAcceptArgs {
  p_application_id: string;
  p_agreed_price_cents?: number;
}

export function buildAcceptArgs(
  applicationId: string,
  agreedPriceCents: number | null,
): RpcAcceptArgs {
  return {
    p_application_id: applicationId,
    // omitted -> the RPC falls back to the job's budget (audited default)
    p_agreed_price_cents: agreedPriceCents ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Server error -> i18n key. RPCs RAISE 'TAKEIT_<CODE>: detail'; anything
// unrecognized falls back to a generic, localized failure message.
// ---------------------------------------------------------------------------
const RPC_ERROR_KEYS: Record<string, MessageKey> = {
  TAKEIT_AUTH_REQUIRED: 'jobs.errorAuthRequired',
  TAKEIT_PROFILE_MISSING: 'jobs.errorAuthRequired',
  TAKEIT_CATEGORY_UNKNOWN: 'jobs.errorCategoryRequired',
  TAKEIT_TITLE_LENGTH: 'jobs.errorTitleLength',
  TAKEIT_DESCRIPTION_TOO_LONG: 'jobs.errorDescriptionTooLong',
  TAKEIT_ADDRESS_TOO_LONG: 'jobs.errorAddressTooLong',
  TAKEIT_BUDGET_NEGATIVE: 'jobs.errorBudgetInvalid',
  TAKEIT_WORKERS_NEEDED_RANGE: 'jobs.errorWorkersRange',
  TAKEIT_GEO_INCOMPLETE: 'jobs.errorGeneric',
  TAKEIT_GEO_RANGE: 'jobs.errorGeneric',
  TAKEIT_DIASPORA_NEEDS_LOCAL_CONTACT: 'jobs.errorLocalContactNameRequired',
  TAKEIT_JOB_NOT_FOUND: 'jobs.errorJobNotFound',
  TAKEIT_JOB_NOT_OPEN: 'jobs.errorJobNotOpen',
  TAKEIT_CANNOT_APPLY_OWN_JOB: 'jobs.errorCannotApplyOwnJob',
  TAKEIT_WORKER_PROFILE_REQUIRED: 'jobs.errorWorkerProfileRequired',
  TAKEIT_CATEGORY_MISMATCH: 'jobs.errorCategoryMismatch',
  TAKEIT_VERIFICATION_LEVEL_TOO_LOW: 'jobs.errorVerificationTooLow',
  TAKEIT_MESSAGE_TOO_LONG: 'jobs.errorMessageTooLong',
  TAKEIT_WINDOW_TOO_LONG: 'jobs.errorWindowTooLong',
  TAKEIT_ALREADY_APPLIED: 'jobs.errorAlreadyApplied',
  TAKEIT_APPLICATION_NOT_FOUND: 'jobs.errorGeneric',
  TAKEIT_NOT_JOB_OWNER: 'jobs.errorNotJobOwner',
  TAKEIT_APPLICATION_NOT_PENDING: 'jobs.errorApplicationNotPending',
  TAKEIT_JOB_FULL: 'jobs.errorJobFull',
  TAKEIT_BOOKING_EXISTS: 'jobs.errorApplicationNotPending',
  TAKEIT_PRICE_REQUIRED: 'jobs.errorPriceRequired',
};

export function rpcErrorKey(message: string | null | undefined): MessageKey {
  if (typeof message === 'string') {
    const match = message.match(/TAKEIT_[A-Z_]+/);
    if (match) {
      const key = RPC_ERROR_KEYS[match[0]];
      if (key) return key;
    }
  }
  return 'jobs.errorGeneric';
}

/** Message text out of whatever a supabase call threw (PostgrestError or Error). */
export function getErrorMessage(e: unknown): string | undefined {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Result-shape mappers (PostgREST embeds), kept pure so they are testable
// ---------------------------------------------------------------------------

/** `applications(count)` embeds arrive as `[{count: n}]`; degrade to 0. */
export function extractApplicationsCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const first = Array.isArray(value) ? value[0] : value;
  if (first && typeof first === 'object' && 'count' in first) {
    const n = (first as { count: unknown }).count;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  return 0;
}

/** To-one embeds can arrive as object OR single-element array; normalize. */
export function extractEmbedded<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null;
  return value;
}

// ---------------------------------------------------------------------------
// Presentation tables (i18n keys only — no hardcoded strings, C5)
// ---------------------------------------------------------------------------
export const TIME_WINDOW_PRESETS = [
  { id: 'morning', labelKey: 'jobs.windowMorning' },
  { id: 'afternoon', labelKey: 'jobs.windowAfternoon' },
  { id: 'evening', labelKey: 'jobs.windowEvening' },
  { id: 'flexible', labelKey: 'jobs.windowFlexible' },
] as const satisfies readonly { id: string; labelKey: MessageKey }[];

export type ApplicationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'withdrawn';

export const APPLICATION_STATUS_DEF: Record<
  ApplicationStatus,
  { key: MessageKey; cls: string }
> = {
  pending: {
    key: 'jobs.applicationStatusPending',
    cls: 'bg-status-open/10 text-status-open',
  },
  accepted: {
    key: 'jobs.applicationStatusAccepted',
    cls: 'bg-status-done/10 text-status-done',
  },
  rejected: {
    key: 'jobs.applicationStatusRejected',
    cls: 'bg-status-cancelled/10 text-status-cancelled',
  },
  withdrawn: {
    key: 'jobs.applicationStatusWithdrawn',
    cls: 'bg-status-cancelled/10 text-status-cancelled',
  },
};

// ---------------------------------------------------------------------------
// Timing chip (shared JobCard) — DERIVED from jobs.date_needed. The jobs
// table has no urgency column and none is added (v1-adoption plan T3):
// this is presentation only.
// ---------------------------------------------------------------------------
export type TimingChip = 'today' | 'this_week' | 'flexible';

export const TIMING_CHIP_KEY: Record<TimingChip, MessageKey> = {
  today: 'jobs.timingToday',
  this_week: 'jobs.timingThisWeek',
  flexible: 'jobs.timingFlexible',
};

/** `iso` (YYYY-MM-DD) plus `days`, as local YYYY-MM-DD. Anchored at midday so
 *  a DST shift can never move the result across a date boundary. */
export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localTodayIso(date);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Derive the JobCard timing chip from date_needed:
 *   null/'' → 'flexible', today → 'today', tomorrow…today+7 → 'this_week'.
 * Past dates, dates beyond a week, and malformed values get NO chip (null) —
 * the page's formatted date says it better than a wrong label would.
 * YYYY-MM-DD strings compare correctly as text (same trick as validateSchedule).
 */
export function deriveTiming(
  dateNeeded: string | null | undefined,
  todayIso: string,
): TimingChip | null {
  if (dateNeeded == null || dateNeeded === '') return 'flexible';
  if (!ISO_DATE_RE.test(dateNeeded)) return null;
  if (dateNeeded < todayIso) return null;
  if (dateNeeded === todayIso) return 'today';
  return dateNeeded <= addDaysIso(todayIso, 7) ? 'this_week' : null;
}

// ---------------------------------------------------------------------------
// T7 — urgency chips on the wizard's date step. A chip press PRESETS the
// existing dateNeeded field (the jobs table has no urgency column and none is
// added): today → today's date, this_week → the last day of the 7-day window
// (a starting point the picker can refine), flexible → '' (the payload then
// omits p_date_needed and the SQL default null applies). The ACTIVE chip is
// derived back from the field via deriveTiming, so the wizard chip and the
// JobCard timing chip can never disagree.
// ---------------------------------------------------------------------------
export const URGENCY_PRESETS: readonly TimingChip[] = [
  'today',
  'this_week',
  'flexible',
];

export function urgencyPresetDate(
  preset: TimingChip,
  todayIso: string,
): string {
  switch (preset) {
    case 'today':
      return todayIso;
    case 'this_week':
      return addDaysIso(todayIso, 7);
    case 'flexible':
      return '';
  }
}

/**
 * T8 — `?category=<slug>` deep link into the wizard. Seed only when the slug
 * names one of the LOADED ACTIVE categories (fetchActiveCategories filters
 * active=true); anything else — unknown, inactive, empty — starts the wizard
 * normally at step 1. Exact match only: slugs are lowercase identifiers.
 */
export function resolveCategoryPrefill(
  slugParam: string | null,
  categories: readonly { slug: string }[],
): string | null {
  if (!slugParam) return null;
  return categories.some((c) => c.slug === slugParam) ? slugParam : null;
}

/** date_needed (YYYY-MM-DD) for display; locale-aware, safe fallback to raw. */
export function formatDateNeeded(
  iso: string | null,
  locale: 'am' | 'en',
): string {
  if (!iso) return '';
  try {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(locale === 'am' ? 'am-ET' : 'en-GB', {
      dateStyle: 'medium',
    }).format(date);
  } catch {
    return iso;
  }
}
