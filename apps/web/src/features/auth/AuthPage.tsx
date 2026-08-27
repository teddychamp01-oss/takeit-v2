// AuthPage — Telegram-primary sign-in (flag-gated, graceful "coming soon")
// plus the email/password DEV path (interim until founder provides the bot
// token — SPEC Stack/Auth). Locale switcher is prominent (C5: Amharic-first).
//
// Primary actions on screen: Telegram button + one form submit (≤3 rule).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useLocale } from '../../lib/i18n';
import type { MessageKey } from '../../i18n';
import { useSession } from '../../hooks/useSession';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { LocaleSwitcher } from '../../components/LocaleSwitcher';
import {
  needsOnboarding,
  signInErrorKey,
  signUpErrorKey,
  validateEmail,
  validatePassword,
} from './validation';
import {
  readTelegramBotUsername,
  TELEGRAM_ONAUTH_GLOBAL,
  TELEGRAM_WIDGET_SRC,
  type TelegramWidgetUser,
} from './telegram';
import { signInWithTelegram } from './telegramSignIn';
import { fetchOwnProfile } from './profileApi';

type Mode = 'signin' | 'signup';

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M21.9 4.6c.3-1.2-.9-2.2-2-1.7L2.7 9.7c-1.2.5-1.1 2.2.1 2.6l4.4 1.4 1.7 5.3c.3 1 1.6 1.3 2.4.5l2.4-2.4 4.5 3.3c.9.7 2.2.2 2.4-.9l3.3-14.9zM8.5 13.2l8.5-5.4c.4-.2.7.3.4.6l-6.7 6.2-.3 3-1.9-4.4z" />
    </svg>
  );
}

export default function AuthPage() {
  const { locale, t } = useLocale();
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<MessageKey | null>(null);
  const [passwordError, setPasswordError] = useState<MessageKey | null>(null);
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgError, setTgError] = useState<MessageKey | null>(null);

  const botUsername = readTelegramBotUsername(
    import.meta.env as unknown as Record<string, unknown>,
  );

  // After any successful auth: first-timers go to onboarding, everyone else
  // back where they came from. A failed profile read falls back to onboarding
  // (that page has its own loading/error/retry states).
  const goAfterAuth = useCallback(
    async (userId: string) => {
      let dest = '/onboarding';
      try {
        const profile = await fetchOwnProfile(userId);
        dest = needsOnboarding(profile) ? '/onboarding' : (from ?? '/');
      } catch {
        dest = '/onboarding';
      }
      navigate(dest, { replace: true });
    },
    [from, navigate],
  );

  // --- Telegram Login Widget (only injected when the flag is configured) ---
  const tgContainerRef = useRef<HTMLDivElement>(null);
  const tgHandlerRef = useRef<(user: TelegramWidgetUser) => void>(() => {});
  tgHandlerRef.current = (user) => {
    setTgError(null);
    setTgBusy(true);
    void signInWithTelegram(user)
      .then(async (result) => {
        if (!result.ok) {
          setTgError(
            result.reason === 'not_configured'
              ? 'auth.telegramComingSoon'
              : 'auth.telegramFailed',
          );
          return;
        }
        await goAfterAuth(result.userId);
      })
      .finally(() => setTgBusy(false));
  };

  useEffect(() => {
    const container = tgContainerRef.current;
    if (!botUsername || !container) return;
    window.__takeitTelegramAuth = (user) => tgHandlerRef.current(user);
    const script = document.createElement('script');
    script.src = TELEGRAM_WIDGET_SRC;
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '14');
    script.setAttribute('data-onauth', `${TELEGRAM_ONAUTH_GLOBAL}(user)`);
    container.appendChild(script);
    return () => {
      delete window.__takeitTelegramAuth;
      container.replaceChildren();
    };
  }, [botUsername]);

  // --- Email/password dev path --------------------------------------------
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setCheckEmail(false);
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;

    setBusy(true);
    try {
      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error || !data.user) {
          setFormError(signInErrorKey(error?.message));
          return;
        }
        await goAfterAuth(data.user.id);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          // the signup trigger reads this into profiles.locale
          options: { data: { locale } },
        });
        if (error) {
          setFormError(signUpErrorKey(error.message));
          return;
        }
        if (data.session && data.user) {
          await goAfterAuth(data.user.id);
        } else {
          // email confirmation enabled — no session yet
          setCheckEmail(true);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  // Already signed in and not mid-flow (e.g. deep link to /auth): leave.
  if (!loading && session && !busy && !tgBusy) {
    return <Navigate to={from ?? '/'} replace />;
  }

  const submitLabel =
    mode === 'signin'
      ? busy
        ? t('auth.signingIn')
        : t('auth.signIn')
      : busy
        ? t('auth.signingUp')
        : t('auth.signUp');

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-cream">
      <header className="flex items-center justify-between px-4 pt-4">
        <span className="text-xl font-extrabold text-primary">
          {t('common.appName')}
        </span>
        <LocaleSwitcher />
      </header>

      <main className="flex flex-1 flex-col justify-center gap-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('auth.title')}</h1>
          <p className="mt-1 text-sm text-ink-light">{t('common.tagline')}</p>
        </div>

        {/* --- Telegram (primary) --- */}
        <section aria-label={t('auth.telegramButton')}>
          {botUsername ? (
            <div className="flex flex-col items-start gap-2">
              <div ref={tgContainerRef} className="min-h-touch" />
              {tgBusy && (
                <p className="text-sm text-ink-light" role="status">
                  {t('auth.telegramSigningIn')}
                </p>
              )}
              {tgError && (
                <p className="text-sm text-status-disputed" role="alert">
                  {t(tgError)}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button full disabled className="bg-[#2AABEE] disabled:opacity-60">
                <TelegramIcon />
                {t('auth.telegramButton')}
              </Button>
              <p className="text-sm text-ink-faint">
                {t('auth.telegramComingSoon')}
              </p>
            </div>
          )}
        </section>

        {/* --- divider --- */}
        <div className="flex items-center gap-3" aria-hidden="true">
          <div className="h-px flex-1 bg-ink/10" />
          <span className="text-sm text-ink-faint">{t('auth.or')}</span>
          <div className="h-px flex-1 bg-ink/10" />
        </div>

        {/* --- email/password dev path (visually marked DEV) --- */}
        <section className="rounded-2xl border border-amber-300 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold tracking-wide text-amber-700">
              {t('auth.devBadge')}
            </span>
            <p className="text-xs text-ink-faint">{t('auth.devNote')}</p>
          </div>

          <div
            role="tablist"
            aria-label={t('auth.title')}
            className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1"
          >
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setFormError(null);
                  setCheckEmail(false);
                }}
                className={`min-h-touch rounded-lg text-sm font-semibold transition-colors ${
                  mode === m ? 'bg-white text-ink shadow-sm' : 'text-ink-faint'
                }`}
              >
                {m === 'signin' ? t('auth.signIn') : t('auth.signUp')}
              </button>
            ))}
          </div>

          {checkEmail ? (
            <div role="status" className="rounded-xl bg-verified-light p-3">
              <p className="font-semibold text-ink">
                {t('auth.checkEmailTitle')}
              </p>
              <p className="mt-1 text-sm text-ink-light">
                {t('auth.checkEmailBody')}
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
              <Input
                label={t('auth.emailLabel')}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={emailError ? t(emailError) : undefined}
              />
              <Input
                label={t('auth.passwordLabel')}
                type="password"
                autoComplete={
                  mode === 'signin' ? 'current-password' : 'new-password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={passwordError ? t(passwordError) : undefined}
                hint={mode === 'signup' ? t('auth.passwordHint') : undefined}
              />
              {formError && (
                <p className="text-sm text-status-disputed" role="alert">
                  {t(formError)}
                </p>
              )}
              <Button type="submit" full disabled={busy}>
                {submitLabel}
              </Button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
