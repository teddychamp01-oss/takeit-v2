// Pure auth/onboarding logic — no supabase import, no DOM. Everything here is
// unit-tested (validation, role mapping, neighborhoods, avatar sizing rules,
// supabase-error → i18n-key mapping).

import { containsPhoneNumber } from '../../lib/phone';
import type { MessageKey } from '../../i18n';

// ---------------------------------------------------------------------------
// Neighborhoods (SPEC frontend rules — exact launch list). The VALUE stored in
// profiles.default_neighborhood is the canonical Latin name (matches the SPEC
// list and the seed data); the label shown to the user is localized.
// ---------------------------------------------------------------------------
export const NEIGHBORHOODS = [
  { value: 'Bole', labelKey: 'auth.neighborhoodBole' },
  { value: 'Kazanchis', labelKey: 'auth.neighborhoodKazanchis' },
  { value: 'CMC', labelKey: 'auth.neighborhoodCmc' },
  { value: 'Sarbet', labelKey: 'auth.neighborhoodSarbet' },
  { value: 'Piazza', labelKey: 'auth.neighborhoodPiazza' },
  { value: 'Kirkos', labelKey: 'auth.neighborhoodKirkos' },
  { value: 'Yeka', labelKey: 'auth.neighborhoodYeka' },
] as const satisfies readonly { value: string; labelKey: MessageKey }[];

export type Neighborhood = (typeof NEIGHBORHOODS)[number]['value'];

export function isNeighborhood(value: unknown): value is Neighborhood {
  return NEIGHBORHOODS.some((n) => n.value === value);
}

// ---------------------------------------------------------------------------
// Dual-role selection (SPEC C4: one account can be BOTH customer and worker)
// ---------------------------------------------------------------------------
export type RoleChoice = 'customer' | 'worker' | 'both';

export function roleToFlags(role: RoleChoice): {
  is_customer: boolean;
  is_worker: boolean;
} {
  return {
    is_customer: role === 'customer' || role === 'both',
    is_worker: role === 'worker' || role === 'both',
  };
}

/** Inverse mapping for prefill. A row with neither flag defaults to customer. */
export function flagsToRole(isCustomer: boolean, isWorker: boolean): RoleChoice {
  if (isWorker && isCustomer) return 'both';
  if (isWorker) return 'worker';
  return 'customer';
}

// ---------------------------------------------------------------------------
// Field validation. Errors are returned as i18n keys so the UI never carries
// hardcoded strings (SPEC C5).
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 8;
/** DB check constraint: char_length(display_name) <= 80. */
export const DISPLAY_NAME_MAX_LENGTH = 80;

export function validateEmail(email: string): MessageKey | null {
  return EMAIL_RE.test(email.trim()) ? null : 'auth.errorEmailInvalid';
}

export function validatePassword(password: string): MessageKey | null {
  if (password.length === 0) return 'auth.errorPasswordRequired';
  if (password.length < PASSWORD_MIN_LENGTH) return 'auth.errorPasswordTooShort';
  return null;
}

/**
 * Display names: required, DB-bounded, and — C3 anti-disintermediation —
 * may not smuggle a phone number (a display name renders on every surface,
 * pre-booking included).
 */
export function validateDisplayName(name: string): MessageKey | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'auth.errorNameRequired';
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) return 'auth.errorNameTooLong';
  if (containsPhoneNumber(trimmed)) return 'auth.errorNamePhone';
  return null;
}

export function validateNeighborhood(value: unknown): MessageKey | null {
  return isNeighborhood(value) ? null : 'auth.errorNeighborhoodRequired';
}

// ---------------------------------------------------------------------------
// Onboarding gate: the signup trigger prefills display_name (email prefix or
// Telegram name), so the reliable "has onboarded" signal is the neighborhood
// the user must actively pick.
// ---------------------------------------------------------------------------
export function needsOnboarding(
  profile: { default_neighborhood: string | null } | null | undefined,
): boolean {
  return !profile || !profile.default_neighborhood;
}

// ---------------------------------------------------------------------------
// Avatar rules (SPEC C6: no video ever, client-side compression <=512px)
// ---------------------------------------------------------------------------
export const AVATAR_MAX_INPUT_BYTES = 10 * 1024 * 1024; // pre-compression cap
export const AVATAR_MAX_DIMENSION = 512;

export function validateAvatarFile(file: {
  type: string;
  size: number;
}): MessageKey | null {
  // Only images — anything else (video/*, application/*, empty type) is out.
  if (!file.type.startsWith('image/')) return 'auth.errorAvatarType';
  if (file.size > AVATAR_MAX_INPUT_BYTES) return 'auth.errorAvatarTooLarge';
  return null;
}

/**
 * Scale (w, h) to fit within `max` on the longest side, preserving aspect
 * ratio, never upscaling, never returning a dimension below 1.
 */
export function computeResizeDims(
  width: number,
  height: number,
  max: number = AVATAR_MAX_DIMENSION,
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

/**
 * Storage object path for a user's avatar. The storage RLS policy requires
 * the FIRST folder segment to equal auth.uid() — this is the only shape that
 * can pass it. Fixed filename + upsert keeps the bucket free of orphans; the
 * caller busts caches via a ?v= query on the public URL.
 */
export function buildAvatarPath(userId: string): string {
  return `${userId}/avatar.jpg`;
}

// ---------------------------------------------------------------------------
// Supabase auth error → i18n key (tested; messages come from GoTrue verbatim)
// ---------------------------------------------------------------------------
export function signInErrorKey(message: string | undefined): MessageKey {
  if (message && /invalid login credentials/i.test(message)) {
    return 'auth.errorCredentials';
  }
  return 'auth.errorSignInFailed';
}

export function signUpErrorKey(message: string | undefined): MessageKey {
  if (message && /already registered/i.test(message)) {
    return 'auth.errorEmailInUse';
  }
  return 'auth.errorSignUpFailed';
}
