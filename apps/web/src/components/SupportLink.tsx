// N12 — "Talk to Take It": a human on Telegram, one tap away (uc-E14:
// unreachable support is the incumbent's most damning complaint cluster;
// africa-A.4: every serious Ethiopian platform runs a visible ops channel).
//
// The URL comes from VITE_SUPPORT_TELEGRAM_URL via lib/flags.ts
// (https-only, validated). When it is unset or invalid the component
// renders NOTHING — a support button that goes nowhere is worse than no
// button. Zero-config usage: `<SupportLink />`.

import { useT } from '../lib/i18n';
import { supportTelegramUrl } from '../lib/flags';

/** Paper-plane (Telegram-style) glyph — inline SVG, no icon library. */
function PlaneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22l-4-9-9-4 20-7z" />
    </svg>
  );
}

export function SupportLink({
  /** Override the pre-resolved env URL (tests only). */
  url = supportTelegramUrl,
}: {
  url?: string | null;
}) {
  const t = useT();
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl border border-ink/10 bg-white px-4 py-3 font-semibold text-primary-600 shadow-sm transition-colors active:bg-primary-50"
    >
      <PlaneIcon />
      <span className="truncate">{t('common.supportTalk')}</span>
    </a>
  );
}
