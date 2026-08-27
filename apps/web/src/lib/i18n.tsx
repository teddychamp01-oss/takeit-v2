// Tiny hand-rolled i18n (no i18next — every KB counts on low-end Android).
// - Amharic (am) is the DEFAULT locale (SPEC C5)
// - the locale PREFERENCE is persisted in localStorage (preference only —
//   no business logic ever lives in localStorage, SPEC frontend rules)
// - t() with typed keys; a missing key VISIBLY returns the key string and
//   never crashes.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE,
  lookupMessage,
  type Locale,
  type MessageKey,
} from '../i18n';

const STORAGE_KEY = 'takeit.locale';

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'am' || stored === 'en') return stored;
  } catch {
    // Storage unavailable (private mode, blocked) — fall through to default.
  }
  return DEFAULT_LOCALE;
}

export type TVars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: TVars) => string;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  /** Test/SSR override; normal app flow reads the stored preference. */
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initialLocale ?? readStoredLocale(),
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference simply won't persist — never an error for the user.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback<TFunction>(
    (key, vars) => {
      const message = lookupMessage(locale, key);
      if (message === undefined) return key; // visible, greppable, non-fatal
      if (!vars) return message;
      return message.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
      );
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale/useT must be used inside <LocaleProvider>');
  }
  return ctx;
}

/** The translation function. Usage: `const t = useT(); t('nav.home')`. */
export function useT(): TFunction {
  return useLocale().t;
}
