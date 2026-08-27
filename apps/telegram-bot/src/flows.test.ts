import { describe, expect, it } from 'vitest';
import {
  advancePostJob,
  CATEGORIES,
  deriveTitle,
  parseBudgetEtbToCents,
  parseCategory,
  parseDateNeeded,
  startPostJob,
  type FlowResult,
  type PostJobState,
} from './flows.ts';
import { VOICE_NOTE_MARKER } from './texts.ts';

const CTX = { todayISO: '2026-08-26' };

function drive(steps: Array<{ text?: string; isVoiceNote?: boolean }>): FlowResult {
  let result = startPostJob('am');
  for (const msg of steps) {
    expect(result.state, 'flow ended before all inputs were consumed').not.toBeNull();
    result = advancePostJob(result.state as PostJobState, msg, CTX);
  }
  return result;
}

describe('startPostJob', () => {
  it('starts at category with the numbered category list, Amharic default', () => {
    const r = startPostJob();
    expect(r.state?.step).toBe('category');
    expect(r.state?.locale).toBe('am');
    expect(r.replyKey).toBe('postjob_ask_category');
    expect(r.reply).toContain('1. 🧹 የቤት ጽዳት (Home Cleaning)');
    expect(r.reply).toContain('8. 🏠 የዲያስፖራ ንብረት እንክብካቤ (Diaspora Property)');
  });
});

describe('advancePostJob — happy path', () => {
  it('walks category→description→neighborhood→landmark→budget→date and completes', () => {
    const r = drive([
      { text: '1' },
      { text: 'ባለ 3 መኝታ ቤት ጽዳት፣ ሙሉ ቀን' },
      { text: 'ቦሌ' },
      { text: 'ከኤድና ሞል ጀርባ' },
      { text: '1,500 ብር' },
      { text: '2026-09-01' },
    ]);
    expect(r.state).toBeNull();
    expect(r.replyKey).toBe('postjob_summary');
    expect(r.done).toBeDefined();
    expect(r.done).toMatchObject({
      categorySlug: 'home-cleaning',
      description: 'ባለ 3 መኝታ ቤት ጽዳት፣ ሙሉ ቀን',
      neighborhood: 'ቦሌ',
      landmark: 'ከኤድና ሞል ጀርባ',
      budgetCents: 150000,
      currency: 'ETB',
      dateNeeded: '2026-09-01',
      voiceNotePending: false,
      source: 'telegram',
    });
    // C7: money is integer cents
    expect(Number.isInteger(r.done?.budgetCents)).toBe(true);
    // jobs.title is NOT NULL 5-120: derived from the description
    expect((r.done?.title ?? '').length).toBeGreaterThanOrEqual(5);
    expect((r.done?.title ?? '').length).toBeLessThanOrEqual(120);
  });

  it('supports skipping landmark, budget and date with "-"', () => {
    const r = drive([
      { text: 'photography' },
      { text: 'Wedding photos, half day' },
      { text: 'Kazanchis' },
      { text: '-' },
      { text: '-' },
      { text: '-' },
    ]);
    expect(r.state).toBeNull();
    expect(r.done).toMatchObject({
      categorySlug: 'photography',
      landmark: null,
      budgetCents: null,
      dateNeeded: null,
    });
  });
});

describe('advancePostJob — invalid inputs re-prompt without losing state', () => {
  it('rejects an unknown category and stays on category', () => {
    const start = startPostJob('am');
    const r = advancePostJob(start.state as PostJobState, { text: '99' }, CTX);
    expect(r.state?.step).toBe('category');
    expect(r.replyKey).toBe('postjob_invalid_category');
  });

  it('rejects a too-short description', () => {
    const r = drive([{ text: '2' }, { text: 'abc' }]);
    expect(r.state?.step).toBe('description');
    expect(r.replyKey).toBe('postjob_invalid_description');
  });

  it('rejects a description that collapses below 5 chars (jobs.title CHECK is 5-120)', () => {
    const r = drive([{ text: '2' }, { text: 'a    b' }]);
    expect(r.state?.step).toBe('description');
    expect(r.replyKey).toBe('postjob_invalid_description');
  });

  it('rejects a non-numeric budget', () => {
    const r = drive([
      { text: '3' },
      { text: 'Math tutoring twice a week' },
      { text: 'CMC' },
      { text: '-' },
      { text: 'a lot' },
    ]);
    expect(r.state?.step).toBe('budget');
    expect(r.replyKey).toBe('postjob_invalid_budget');
  });

  it('rejects a past date with a dedicated message', () => {
    const r = drive([
      { text: '4' },
      { text: 'Fix leaking kitchen sink' },
      { text: 'Sarbet' },
      { text: '-' },
      { text: '800' },
      { text: '2026-08-25' },
    ]);
    expect(r.state?.step).toBe('date');
    expect(r.replyKey).toBe('postjob_date_past');
  });

  it('rejects an empty text message on the current step', () => {
    const start = startPostJob('am');
    const r = advancePostJob(start.state as PostJobState, {}, CTX);
    expect(r.state?.step).toBe('category');
    expect(r.replyKey).toBe('postjob_invalid_category');
  });
});

describe('advancePostJob — voice notes (SPEC: acknowledge + TODO flag)', () => {
  it('acknowledges, flags the draft, re-asks the same step', () => {
    const start = startPostJob('am');
    const afterCat = advancePostJob(start.state as PostJobState, { text: '1' }, CTX);
    const voiced = advancePostJob(
      afterCat.state as PostJobState,
      { isVoiceNote: true },
      CTX,
    );
    expect(voiced.replyKey).toBe('postjob_voice_ack');
    expect(voiced.state?.step).toBe('description');
    expect(voiced.state?.draft.voiceNotePending).toBe(true);
  });

  it('carries the TODO marker into the completed description', () => {
    const r = drive([
      { text: '1' },
      { isVoiceNote: true },
      { text: 'ጽዳት ለሁለት ክፍሎች' },
      { text: 'Yeka' },
      { text: '-' },
      { text: '500' },
      { text: 'ነገ' },
    ]);
    expect(r.done?.voiceNotePending).toBe(true);
    expect(r.done?.description).toContain(VOICE_NOTE_MARKER);
    expect(r.done?.dateNeeded).toBe('2026-08-27'); // ነገ = tomorrow
  });
});

describe('parsers', () => {
  it('parseCategory accepts index, slug, English and Amharic names', () => {
    expect(parseCategory('1')?.slug).toBe('home-cleaning');
    expect(parseCategory('repairs-handyman')?.slug).toBe('repairs-handyman');
    expect(parseCategory('Tutors')?.slug).toBe('tutors');
    expect(parseCategory('ፎቶግራፍ')?.slug).toBe('photography');
    expect(parseCategory('0')).toBeNull();
    expect(parseCategory('9')).toBeNull();
    expect(parseCategory('plumbing')).toBeNull();
  });

  it('parseBudgetEtbToCents returns integer cents (C7)', () => {
    expect(parseBudgetEtbToCents('1500')).toBe(150000);
    expect(parseBudgetEtbToCents('1,500')).toBe(150000);
    expect(parseBudgetEtbToCents('1500.50')).toBe(150050);
    expect(parseBudgetEtbToCents('1500 ብር')).toBe(150000);
    expect(parseBudgetEtbToCents('1500 ETB')).toBe(150000);
    expect(parseBudgetEtbToCents('0')).toBeNull(); // < 1 ETB
    expect(parseBudgetEtbToCents('5000001')).toBeNull(); // bound (repo law)
    expect(parseBudgetEtbToCents('12.345')).toBeNull(); // sub-cent precision
    expect(parseBudgetEtbToCents('-100')).toBeNull();
    expect(parseBudgetEtbToCents('1e6')).toBeNull();
  });

  it('parseDateNeeded handles today/tomorrow in both languages and validity', () => {
    expect(parseDateNeeded('ዛሬ', CTX.todayISO)).toEqual({ ok: true, value: '2026-08-26' });
    expect(parseDateNeeded('Tomorrow', CTX.todayISO)).toEqual({ ok: true, value: '2026-08-27' });
    expect(parseDateNeeded('2026-12-31', CTX.todayISO)).toEqual({ ok: true, value: '2026-12-31' });
    expect(parseDateNeeded('2026-02-30', CTX.todayISO)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseDateNeeded('31/12/2026', CTX.todayISO)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseDateNeeded('2020-01-01', CTX.todayISO)).toEqual({ ok: false, reason: 'past' });
    // month rollover for tomorrow
    expect(parseDateNeeded('ነገ', '2026-08-31')).toEqual({ ok: true, value: '2026-09-01' });
  });

  it('deriveTitle flattens whitespace and caps at 80 chars', () => {
    expect(deriveTitle('Fix the\nkitchen   sink')).toBe('Fix the kitchen sink');
    const long = 'a'.repeat(200);
    expect(deriveTitle(long).length).toBe(80);
  });
});

describe('categories constant', () => {
  it('lists exactly the 8 launch categories in seed order', () => {
    expect(CATEGORIES.map((c) => c.slug)).toEqual([
      'home-cleaning',
      'babysitting-care',
      'tutors',
      'repairs-handyman',
      'event-staffing',
      'errands-city-help',
      'photography',
      'diaspora-property',
    ]);
  });
});
