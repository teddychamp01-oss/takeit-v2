// N14 / africa-G.4 — Amharic typography convention (see docs/CONVENTIONS.md):
// Ge'ez fidel has NO upper/lower case, and letter-spacing breaks its rhythm.
// Any decorative `uppercase tracking-wide` micro-label styling must therefore
// be gated to the Latin (en) locale. Pure function so call sites stay
// one-liners and the rule is testable.

import type { Locale } from '../i18n';

/**
 * Class fragment for micro-labels (category eyebrow, stat captions, dt
 * labels): `uppercase tracking-wide` for en, nothing for am. The literal
 * class string lives here in source, so Tailwind's scanner still sees it.
 */
export function microCaps(locale: Locale): string {
  return locale === 'en' ? 'uppercase tracking-wide' : '';
}
