// =============================================================================
// Take It v2 — /postjob guided-conversation state machine.
//
// PURE functions only: given (state, message, context) return (reply, next
// state). No I/O, no Date.now(), no framework imports — the caller passes
// today's date in, so every transition is unit-testable and deterministic.
//
// ARCHITECTURE / DUPLICATED FILE — keep these two copies BYTE-IDENTICAL:
//   apps/telegram-bot/src/flows.ts        (canonical; unit-tested with vitest)
//   supabase/functions/_shared/flows.ts   (mirror imported by the Deno edge fn)
// The vitest guard apps/telegram-bot/src/sync.test.ts FAILS if they drift.
//
// Money: budget is captured in ETB and stored as INTEGER CENTS (C7). Dates are
// ISO YYYY-MM-DD strings. All user-facing strings come from texts.ts (C5).
// =============================================================================

import {
  DEFAULT_LOCALE,
  formatEtbFromCents,
  t,
  VOICE_NOTE_MARKER,
  type Locale,
  type TextKey,
} from './texts.ts';

// -----------------------------------------------------------------------------
// Categories — MUST match supabase/seed/seed.sql (service_categories). The bot
// prefers the live DB list; this constant is the offline/prompt fallback and
// the validation set for the guided flow.
// -----------------------------------------------------------------------------
export const CATEGORIES = [
  { slug: 'home-cleaning', nameAm: 'የቤት ጽዳት', nameEn: 'Home Cleaning', icon: '🧹' },
  { slug: 'babysitting-care', nameAm: 'የሕፃናት እንክብካቤ', nameEn: 'Babysitting & Care', icon: '🧸' },
  { slug: 'tutors', nameAm: 'የቤት አስጠኚ', nameEn: 'Tutors', icon: '📚' },
  { slug: 'repairs-handyman', nameAm: 'የቤት ጥገና', nameEn: 'Repairs & Handyman', icon: '🔧' },
  { slug: 'event-staffing', nameAm: 'የዝግጅት ሠራተኞች', nameEn: 'Event Staffing', icon: '🎉' },
  { slug: 'errands-city-help', nameAm: 'መልእክት እና የከተማ እገዛ', nameEn: 'Errands & City Help', icon: '🛵' },
  { slug: 'photography', nameAm: 'ፎቶግራፍ', nameEn: 'Photography', icon: '📷' },
  { slug: 'diaspora-property', nameAm: 'የዲያስፖራ ንብረት እንክብካቤ', nameEn: 'Diaspora Property', icon: '🏠' },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

export function categoryListLines(): string {
  return CATEGORIES.map(
    (c, i) => `${i + 1}. ${c.icon} ${c.nameAm} (${c.nameEn})`,
  ).join('\n');
}

// -----------------------------------------------------------------------------
// State machine types
// -----------------------------------------------------------------------------
export const POSTJOB_STEPS = [
  'category',
  'description',
  'neighborhood',
  'landmark',
  'budget',
  'date',
] as const;
export type PostJobStep = (typeof POSTJOB_STEPS)[number];

export interface PostJobDraft {
  categorySlug?: CategorySlug;
  description?: string;
  voiceNotePending?: boolean;
  neighborhood?: string;
  landmark?: string | null;
  /** Integer ETB cents (C7), or null when the poster skipped the question. */
  budgetCents?: number | null;
  /** ISO YYYY-MM-DD, or null when skipped. */
  dateNeeded?: string | null;
}

export interface PostJobState {
  step: PostJobStep;
  locale: Locale;
  draft: PostJobDraft;
}

export interface FlowMessage {
  text?: string;
  isVoiceNote?: boolean;
}

/** Everything the caller needs to insert the job (source 'telegram'). */
export interface CompletedPostJob {
  categorySlug: CategorySlug;
  /** Derived from the description (jobs.title is NOT NULL, 5-120 chars). */
  title: string;
  description: string;
  neighborhood: string;
  landmark: string | null;
  budgetCents: number | null;
  currency: 'ETB';
  dateNeeded: string | null;
  voiceNotePending: boolean;
  source: 'telegram';
}

export interface FlowResult {
  /** Next state, or null when the flow is finished. */
  state: PostJobState | null;
  /** i18n key of the reply (for tests/logs). */
  replyKey: TextKey;
  /** Reply already rendered in the state's locale. */
  reply: string;
  /** Present exactly once, when the final step completes. */
  done?: CompletedPostJob;
}

export interface FlowContext {
  /** Today's date as ISO YYYY-MM-DD in the user's timezone (Africa/Addis_Ababa). */
  todayISO: string;
}

// -----------------------------------------------------------------------------
// Parsers (exported for direct unit-testing)
// -----------------------------------------------------------------------------
const SKIP_TOKENS = new Set(['-', '–', '—', 'skip', 'ዝለል', 'የለም']);

export function isSkip(text: string): boolean {
  return SKIP_TOKENS.has(text.trim().toLowerCase());
}

/** "1"-"8", a slug, an Amharic name or an English name -> category, else null. */
export function parseCategory(text: string): (typeof CATEGORIES)[number] | null {
  const raw = text.trim();
  if (/^[1-9]\d*$/.test(raw)) {
    const idx = Number(raw) - 1;
    return idx >= 0 && idx < CATEGORIES.length ? CATEGORIES[idx] : null;
  }
  const lower = raw.toLowerCase();
  return (
    CATEGORIES.find(
      (c) =>
        c.slug === lower ||
        c.nameEn.toLowerCase() === lower ||
        c.nameAm === raw,
    ) ?? null
  );
}

/**
 * Budget in ETB -> integer cents. Accepts "1500", "1,500", "1500.50",
 * "1500 ብር", "1500 ETB". Rejects non-numbers, <1 ETB and >5,000,000 ETB
 * (repo law: bound fuzzy input). Returns null when unparseable.
 */
export function parseBudgetEtbToCents(text: string): number | null {
  const cleaned = text
    .replace(/(etb|birr|ብር)/gi, '')
    .replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const etb = Number(cleaned);
  if (!Number.isFinite(etb) || etb < 1 || etb > 5_000_000) return null;
  return Math.round(etb * 100);
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export type ParsedDate =
  | { ok: true; value: string }
  | { ok: false; reason: 'invalid' | 'past' };

/** "ዛሬ"/"today", "ነገ"/"tomorrow" or YYYY-MM-DD (not in the past). */
export function parseDateNeeded(text: string, todayISO: string): ParsedDate {
  const raw = text.trim().toLowerCase();
  if (raw === 'ዛሬ' || raw === 'today') return { ok: true, value: todayISO };
  if (raw === 'ነገ' || raw === 'tomorrow') {
    return { ok: true, value: addDaysISO(todayISO, 1) };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, reason: 'invalid' };
  const [y, m, d] = raw.split('-').map(Number);
  const roundTrip = new Date(Date.UTC(y, m - 1, d));
  if (
    roundTrip.getUTCFullYear() !== y ||
    roundTrip.getUTCMonth() !== m - 1 ||
    roundTrip.getUTCDate() !== d
  ) {
    return { ok: false, reason: 'invalid' };
  }
  // ISO strings compare correctly as plain strings.
  if (raw < todayISO) return { ok: false, reason: 'past' };
  return { ok: true, value: raw };
}

/** jobs.title is NOT NULL 5-120 chars; derive it from the description. */
export function deriveTitle(description: string): string {
  const flat = description.replace(/\s+/g, ' ').trim();
  return flat.length <= 80 ? flat : flat.slice(0, 80).trimEnd();
}

// -----------------------------------------------------------------------------
// The state machine
// -----------------------------------------------------------------------------
function prompt(
  locale: Locale,
  key: TextKey,
  params?: Record<string, string | number>,
): { replyKey: TextKey; reply: string } {
  return { replyKey: key, reply: t(locale, key, params) };
}

/** Begin the /postjob flow. */
export function startPostJob(locale: Locale = DEFAULT_LOCALE): FlowResult {
  const state: PostJobState = { step: 'category', locale, draft: {} };
  return {
    state,
    ...prompt(locale, 'postjob_ask_category', { list: categoryListLines() }),
  };
}

function finish(state: PostJobState): FlowResult {
  const { locale, draft } = state;
  const description = draft.voiceNotePending
    ? `${draft.description ?? ''}\n\n${VOICE_NOTE_MARKER}`.trim()
    : (draft.description ?? '');
  const category = CATEGORIES.find((c) => c.slug === draft.categorySlug);
  const done: CompletedPostJob = {
    categorySlug: draft.categorySlug as CategorySlug,
    title: deriveTitle(draft.description ?? ''),
    description,
    neighborhood: draft.neighborhood ?? '',
    landmark: draft.landmark ?? null,
    budgetCents: draft.budgetCents ?? null,
    currency: 'ETB',
    dateNeeded: draft.dateNeeded ?? null,
    voiceNotePending: draft.voiceNotePending === true,
    source: 'telegram',
  };
  const none = t(locale, 'none_value');
  return {
    state: null,
    done,
    ...prompt(locale, 'postjob_summary', {
      category: category ? `${category.icon} ${category.nameAm} (${category.nameEn})` : none,
      description: done.title,
      neighborhood: done.neighborhood || none,
      landmark: done.landmark ?? none,
      budget:
        done.budgetCents === null ? none : formatEtbFromCents(done.budgetCents, locale),
      date: done.dateNeeded ?? none,
    }),
  };
}

/**
 * Advance the flow one message. Voice notes are acknowledged, flagged on the
 * draft (transcription TODO — SPEC) and the current question is re-asked.
 */
export function advancePostJob(
  state: PostJobState,
  message: FlowMessage,
  ctx: FlowContext,
): FlowResult {
  const { locale } = state;

  if (message.isVoiceNote) {
    const next: PostJobState = {
      ...state,
      draft: { ...state.draft, voiceNotePending: true },
    };
    return { state: next, ...prompt(locale, 'postjob_voice_ack') };
  }

  const text = (message.text ?? '').trim();

  switch (state.step) {
    case 'category': {
      const category = text ? parseCategory(text) : null;
      if (!category) {
        return { state, ...prompt(locale, 'postjob_invalid_category') };
      }
      const next: PostJobState = {
        ...state,
        step: 'description',
        draft: { ...state.draft, categorySlug: category.slug },
      };
      return { state: next, ...prompt(locale, 'postjob_ask_description') };
    }

    case 'description': {
      // Validate on the whitespace-collapsed length: the derived title uses it
      // and jobs.title carries a CHECK (5-120) — "a    b" must not sneak past.
      const collapsed = text.replace(/\s+/g, ' ').trim();
      if (collapsed.length < 5 || text.length > 3000) {
        return { state, ...prompt(locale, 'postjob_invalid_description') };
      }
      const next: PostJobState = {
        ...state,
        step: 'neighborhood',
        draft: { ...state.draft, description: text },
      };
      return { state: next, ...prompt(locale, 'postjob_ask_neighborhood') };
    }

    case 'neighborhood': {
      if (text.length < 2 || text.length > 80 || isSkip(text)) {
        return { state, ...prompt(locale, 'postjob_invalid_neighborhood') };
      }
      const next: PostJobState = {
        ...state,
        step: 'landmark',
        draft: { ...state.draft, neighborhood: text },
      };
      return { state: next, ...prompt(locale, 'postjob_ask_landmark') };
    }

    case 'landmark': {
      if (!isSkip(text) && (text.length === 0 || text.length > 200)) {
        return { state, ...prompt(locale, 'postjob_invalid_landmark') };
      }
      const next: PostJobState = {
        ...state,
        step: 'budget',
        draft: { ...state.draft, landmark: isSkip(text) ? null : text },
      };
      return { state: next, ...prompt(locale, 'postjob_ask_budget') };
    }

    case 'budget': {
      let budgetCents: number | null;
      if (isSkip(text)) {
        budgetCents = null;
      } else {
        const parsed = text ? parseBudgetEtbToCents(text) : null;
        if (parsed === null) {
          return { state, ...prompt(locale, 'postjob_invalid_budget') };
        }
        budgetCents = parsed;
      }
      const next: PostJobState = {
        ...state,
        step: 'date',
        draft: { ...state.draft, budgetCents },
      };
      return { state: next, ...prompt(locale, 'postjob_ask_date') };
    }

    case 'date': {
      if (isSkip(text)) {
        return finish({ ...state, draft: { ...state.draft, dateNeeded: null } });
      }
      const parsed = text
        ? parseDateNeeded(text, ctx.todayISO)
        : ({ ok: false, reason: 'invalid' } as const);
      if (!parsed.ok) {
        return {
          state,
          ...prompt(
            locale,
            parsed.reason === 'past' ? 'postjob_date_past' : 'postjob_invalid_date',
          ),
        };
      }
      return finish({ ...state, draft: { ...state.draft, dateNeeded: parsed.value } });
    }
  }
}
