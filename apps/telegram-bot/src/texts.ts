// =============================================================================
// Take It v2 — Telegram bot strings (C5: Amharic default, English second).
// Every user-facing bot string lives here; no hardcoded strings in handlers.
//
// ARCHITECTURE / DUPLICATED FILE — keep these two copies BYTE-IDENTICAL:
//   apps/telegram-bot/src/texts.ts        (canonical; unit-tested with vitest)
//   supabase/functions/_shared/texts.ts   (mirror imported by the Deno edge fn)
// The npm workspace cannot be imported from the Supabase Edge Runtime without
// a build step, so the edge function carries a mirror. The vitest guard
// apps/telegram-bot/src/sync.test.ts FAILS if the copies drift.
// =============================================================================

export type Locale = 'am' | 'en';
export const DEFAULT_LOCALE: Locale = 'am';

export function isLocale(value: unknown): value is Locale {
  return value === 'am' || value === 'en';
}

const am = {
  start_welcome:
    'ሰላም! ወደ Take It እንኳን በደህና መጡ። 🧡\n' +
    'የተረጋገጡ ባለሙያዎችን ያግኙ ወይም ስራ ይለጥፉ።\n' +
    'ትእዛዞች: /postjob — ስራ ይለጥፉ, /categories — ምድቦች, /myjobs — ስራዎቼ, /help — እገዛ',
  login_hint: 'የመግቢያ አዝራሩ ለ5 ደቂቃ ብቻ ይሰራል፤ ጊዜው ካለፈ /start እንደገና ይላኩ።',
  btn_open_app: 'መተግበሪያውን ክፈት · Open app',
  btn_login: 'በቴሌግራም ግባ · Log in with Telegram',
  help:
    'ትእዛዞች:\n' +
    '/start — መጀመሪያ እና የመግቢያ አገናኞች\n' +
    '/postjob — ስራ ደረጃ በደረጃ ይለጥፉ\n' +
    '/categories — የአገልግሎት ምድቦች\n' +
    '/myjobs — የለጠፏቸው ስራዎች\n' +
    '/cancel — በሂደት ላይ ያለውን መሰረዝ\n' +
    '/help — ይህ መልእክት\n' +
    '(Commands: /postjob, /categories, /myjobs, /cancel, /help)',
  categories_header: 'የአገልግሎት ምድቦች:',
  postjob_ask_category:
    'እንጀምር! የስራው ምድብ የትኛው ነው? ቁጥር ይላኩ:\n{list}\n(ለመሰረዝ /cancel)',
  postjob_invalid_category: 'ያልታወቀ ምድብ ነው። እባክዎ ከ1 እስከ 8 ያለ ቁጥር ይላኩ።',
  postjob_ask_description: 'ጥሩ! አሁን ስራውን በአጭሩ ይግለጹ (ቢያንስ 5 ፊደላት):',
  postjob_invalid_description: 'መግለጫው በጣም አጭር ወይም በጣም ረጅም ነው። ከ5 እስከ 3000 ፊደላት ይጻፉ።',
  postjob_ask_neighborhood:
    'ሰፈሩ የት ነው? (ለምሳሌ: ቦሌ፣ ካዛንቺስ፣ ሲኤምሲ፣ ሳርቤት፣ ፒያሳ፣ ቂርቆስ፣ የካ)',
  postjob_invalid_neighborhood: 'እባክዎ የሰፈሩን ስም ይጻፉ (እስከ 80 ፊደላት)።',
  postjob_ask_landmark: 'የአካባቢ ምልክት ይጻፉ (ለምሳሌ "ከኤድና ሞል ጀርባ")። ለመዝለል - ይላኩ:',
  postjob_invalid_landmark: 'ምልክቱ በጣም ረጅም ነው (እስከ 200 ፊደላት)። ለመዝለል - ይላኩ።',
  postjob_ask_budget: 'በጀትዎ ስንት ብር ነው? ቁጥር ብቻ ይላኩ (ለምሳሌ 1500)። ለመዝለል - ይላኩ:',
  postjob_invalid_budget: 'በጀቱ አልገባም። ቁጥር ብቻ ይላኩ (ለምሳሌ 1500)፣ ወይም ለመዝለል -።',
  postjob_ask_date:
    'ስራው መቼ ያስፈልጋል? ቀን በ YYYY-MM-DD ይላኩ፣ ወይም "ዛሬ" / "ነገ"። ለመዝለል - ይላኩ:',
  postjob_invalid_date: 'ቀኑ አልገባም። YYYY-MM-DD (ለምሳሌ 2026-09-01)፣ "ዛሬ" ወይም "ነገ" ይላኩ።',
  postjob_date_past: 'ያለፈ ቀን መምረጥ አይቻልም። የዛሬ ወይም የወደፊት ቀን ይላኩ።',
  postjob_voice_ack:
    '🎙 የድምፅ ማስታወሻዎ ደርሷል። ወደ ጽሁፍ መቀየር በቅርቡ ይመጣል — ለአሁን እባክዎ በጽሁፍም ይጻፉ።',
  postjob_summary:
    'ማጠቃለያ:\n' +
    '📂 ምድብ: {category}\n' +
    '📝 መግለጫ: {description}\n' +
    '📍 ሰፈር: {neighborhood}\n' +
    '🗺 ምልክት: {landmark}\n' +
    '💰 በጀት: {budget}\n' +
    '📅 ቀን: {date}\n' +
    'ስራዎ እየተለጠፈ ነው…',
  postjob_posted: '✅ ስራዎ ተለጥፏል: "{title}"። ባለሙያዎች ሲያመለክቱ እናሳውቅዎታለን።',
  postjob_post_failed: 'ይቅርታ፣ ስራውን መለጠፍ አልተቻለም። እባክዎ ቆየት ብለው እንደገና ይሞክሩ።',
  postjob_cancelled: 'ተሰርዟል። በ /postjob እንደገና መጀመር ይችላሉ።',
  postjob_expired: 'ይቅርታ፣ ውይይቱ ጊዜው አልፎበታል። እባክዎ በ /postjob እንደገና ይጀምሩ።',
  myjobs_header: 'የእርስዎ ስራዎች:',
  myjobs_empty: 'እስካሁን ምንም ስራ አልለጠፉም። በ /postjob ይጀምሩ።',
  status_open: 'ክፍት',
  status_matched: 'ተዛምዷል',
  status_in_progress: 'በሂደት ላይ',
  status_completed: 'ተጠናቋል',
  status_cancelled: 'ተሰርዟል',
  status_disputed: 'አከራካሪ',
  none_value: '—',
  currency_word: 'ብር',
  unknown_input: 'አልገባኝም። ስራ ለመለጠፍ /postjob ይላኩ፣ ወይም /help ይመልከቱ።',
  err_generic: 'ይቅርታ፣ ችግር ተፈጥሯል። እባክዎ ቆየት ብለው እንደገና ይሞክሩ።',
  not_configured: 'ይህ አገልግሎት ገና አልተዋቀረም። እባክዎ በኋላ ይሞክሩ።',
} as const;

export type TextKey = keyof typeof am;

const en: Record<TextKey, string> = {
  start_welcome:
    'Welcome to Take It! 🧡\n' +
    'Find verified workers or post a job in Addis Ababa.\n' +
    'Commands: /postjob — post a job, /categories — categories, /myjobs — my jobs, /help — help',
  login_hint: 'The login button is valid for 5 minutes; send /start again if it expires.',
  btn_open_app: 'መተግበሪያውን ክፈት · Open app',
  btn_login: 'በቴሌግራም ግባ · Log in with Telegram',
  help:
    'Commands:\n' +
    '/start — welcome and login links\n' +
    '/postjob — post a job step by step\n' +
    '/categories — service categories\n' +
    '/myjobs — jobs you posted\n' +
    '/cancel — cancel the current flow\n' +
    '/help — this message',
  categories_header: 'Service categories:',
  postjob_ask_category:
    "Let's start! Which category is the job? Send a number:\n{list}\n(/cancel to stop)",
  postjob_invalid_category: 'Unknown category. Please send a number from 1 to 8.',
  postjob_ask_description: 'Great! Now describe the job briefly (at least 5 characters):',
  postjob_invalid_description: 'Description too short or too long. Use 5 to 3000 characters.',
  postjob_ask_neighborhood:
    'Which neighborhood? (e.g. Bole, Kazanchis, CMC, Sarbet, Piazza, Kirkos, Yeka)',
  postjob_invalid_neighborhood: 'Please send the neighborhood name (up to 80 characters).',
  postjob_ask_landmark: 'Add a landmark (e.g. "behind Edna Mall"). Send - to skip:',
  postjob_invalid_landmark: 'Landmark too long (up to 200 characters). Send - to skip.',
  postjob_ask_budget: 'What is your budget in ETB? Numbers only (e.g. 1500). Send - to skip:',
  postjob_invalid_budget: 'Could not read the budget. Send a number (e.g. 1500), or - to skip.',
  postjob_ask_date:
    'When is the job needed? Send a date as YYYY-MM-DD, or "today" / "tomorrow". Send - to skip:',
  postjob_invalid_date: 'Could not read the date. Send YYYY-MM-DD (e.g. 2026-09-01), "today" or "tomorrow".',
  postjob_date_past: 'The date cannot be in the past. Send today or a future date.',
  postjob_voice_ack:
    '🎙 Voice note received. Transcription is coming soon — for now, please also type the details.',
  postjob_summary:
    'Summary:\n' +
    '📂 Category: {category}\n' +
    '📝 Description: {description}\n' +
    '📍 Neighborhood: {neighborhood}\n' +
    '🗺 Landmark: {landmark}\n' +
    '💰 Budget: {budget}\n' +
    '📅 Date: {date}\n' +
    'Posting your job…',
  postjob_posted: '✅ Your job "{title}" is posted. We will notify you when workers apply.',
  postjob_post_failed: 'Sorry, posting the job failed. Please try again shortly.',
  postjob_cancelled: 'Cancelled. You can start again with /postjob.',
  postjob_expired: 'Sorry, that conversation expired. Please start again with /postjob.',
  myjobs_header: 'Your jobs:',
  myjobs_empty: 'You have not posted any jobs yet. Start with /postjob.',
  status_open: 'Open',
  status_matched: 'Matched',
  status_in_progress: 'In progress',
  status_completed: 'Completed',
  status_cancelled: 'Cancelled',
  status_disputed: 'Disputed',
  none_value: '—',
  currency_word: 'ETB',
  unknown_input: "I didn't get that. Send /postjob to post a job, or /help for help.",
  err_generic: 'Sorry, something went wrong. Please try again shortly.',
  not_configured: 'This service is not configured yet. Please try again later.',
};

const dictionaries: Record<Locale, Record<TextKey, string>> = { am, en };

/** Render a string in `locale` (falls back to Amharic — C5) with {param} interpolation. */
export function t(
  locale: Locale,
  key: TextKey,
  params?: Record<string, string | number>,
): string {
  const template = dictionaries[locale]?.[key] ?? am[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Stored (not rendered) bilingual marker appended to a job description when the
 * poster sent a voice note. SPEC/task: acknowledge + store a TODO flag; actual
 * transcription is out of MVP scope.
 */
export const VOICE_NOTE_MARKER =
  '[🎙 የድምፅ ማስታወሻ ደርሷል — voice note received; transcription TODO]';

/** Job status → label, e.g. for /myjobs lines. Unknown statuses echo verbatim. */
export function jobStatusLabel(locale: Locale, status: string): string {
  const key = `status_${status}` as TextKey;
  if (key in am) return t(locale, key);
  return status;
}

/**
 * Format integer ETB cents (C7) for display, e.g. 150050 -> "1,500.50 ብር".
 * Manual formatting — no Intl dependence, so tests are environment-stable.
 */
export function formatEtbFromCents(cents: number, locale: Locale): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = abs % 100;
  const fracPart = frac === 0 ? '' : `.${frac.toString().padStart(2, '0')}`;
  return `${sign}${whole}${fracPart} ${t(locale, 'currency_word')}`;
}
