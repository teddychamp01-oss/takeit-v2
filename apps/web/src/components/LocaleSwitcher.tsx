import { useLocale } from '../lib/i18n';
import type { Locale } from '../i18n';

const OPTIONS: readonly { locale: Locale; labelKey: 'common.amharic' | 'common.english' }[] = [
  { locale: 'am', labelKey: 'common.amharic' },
  { locale: 'en', labelKey: 'common.english' },
];

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className="inline-flex rounded-xl bg-ink/5 p-1"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.locale}
          type="button"
          aria-pressed={locale === option.locale}
          onClick={() => setLocale(option.locale)}
          className={`min-h-touch rounded-lg px-4 text-sm font-semibold transition-colors ${
            locale === option.locale
              ? 'bg-white text-ink shadow-sm'
              : 'text-ink-faint'
          }`}
        >
          {t(option.labelKey)}
        </button>
      ))}
    </div>
  );
}
