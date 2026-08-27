// Phone masking + detection (SPEC C3 — anti-disintermediation).
// Masking here is defense-in-depth for DISPLAY: the server must already send
// masked values pre-booking (RLS). Detection backs the pre-booking soft-warn
// when someone types a number into chat/job text.

const SEPARATOR_CHARS = /[\s\-.()/]/g;

/**
 * Mask a phone number for display: '+251911234567' -> '+2519****567'.
 * The middle digits are never echoed; unknown shapes degrade to heavier
 * masking, never lighter.
 */
export function maskPhone(phone: string): string {
  const cleaned = phone.trim().replace(SEPARATOR_CHARS, '');
  const hasPlus = cleaned.startsWith('+');
  const digits = hasPlus ? cleaned.slice(1) : cleaned;

  if (!/^\d+$/.test(digits) || digits.length < 7) return '****';

  // International Ethiopian: 251 + 9 subscriber digits (2519…/2517…)
  if (digits.length === 12 && digits.startsWith('251')) {
    return `${hasPlus ? '+' : ''}${digits.slice(0, 4)}****${digits.slice(-3)}`;
  }
  // Local Ethiopian: 09… / 07… (10 digits)
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
  }
  // Anything else: keep only 2+2 digits.
  return `${hasPlus ? '+' : ''}${digits.slice(0, 2)}****${digits.slice(-2)}`;
}

// Ethiopian mobile shapes, tolerant of separators BETWEEN digits:
//   +2519…/+2517… , 2519…/2517… (12 digits), 09…/07… (10 digits).
// No lookbehind (crashes regex parsing on older WebKit): the leading
// boundary is "start of string or a non-digit character".
const SEP = '[\\s\\-.()/]*';
const MORE_DIGITS_8 = `(?:${SEP}\\d){8}`;
const INTL_FORM = `\\+?${SEP}2${SEP}5${SEP}1${SEP}[79]${MORE_DIGITS_8}`;
const LOCAL_FORM = `0${SEP}[79]${MORE_DIGITS_8}`;
const PHONE_PATTERN = new RegExp(
  `(?:^|[^\\d])(?:${INTL_FORM}|${LOCAL_FORM})(?!\\d)`,
);

/**
 * True when `text` appears to contain an Ethiopian phone number
 * (09/07/+2519/+2517/2519… with optional spaces, dashes, dots, slashes,
 * parentheses between digits). Used for the pre-booking soft-warn — a false
 * positive shows a harmless warning, a false negative just misses one.
 */
export function containsPhoneNumber(text: string): boolean {
  if (!text) return false;
  return PHONE_PATTERN.test(text);
}
