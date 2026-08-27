// OnboardingPage — first-sign-in setup (SPEC): display name, dual-role choice
// (customer/worker/both — C4), default neighborhood (launch list), locale
// (C5, applied live via the switcher), avatar with client-side canvas
// compression <=512px (C6 — images only, never video).
//
// Writes: profiles upsert + worker_profiles SKELETON when worker/both was
// chosen (see profileApi.ts — column names audited against the migrations).
// Primary action on screen: one — Continue. (Avatar pick is secondary.)

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import type { MessageKey } from '../../i18n';
import { useSession } from '../../hooks/useSession';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { LocaleSwitcher } from '../../components/LocaleSwitcher';
import { SpinnerBlock } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import {
  NEIGHBORHOODS,
  flagsToRole,
  isNeighborhood,
  validateAvatarFile,
  validateDisplayName,
  validateNeighborhood,
  type RoleChoice,
} from './validation';
import { compressAvatar } from './avatar';
import { fetchOwnProfile, saveOnboarding, uploadAvatar } from './profileApi';

const ROLE_OPTIONS: readonly {
  value: RoleChoice;
  labelKey: MessageKey;
  bodyKey: MessageKey;
}[] = [
  {
    value: 'customer',
    labelKey: 'auth.roleCustomer',
    bodyKey: 'auth.roleCustomerBody',
  },
  {
    value: 'worker',
    labelKey: 'auth.roleWorker',
    bodyKey: 'auth.roleWorkerBody',
  },
  { value: 'both', labelKey: 'auth.roleBoth', bodyKey: 'auth.roleBothBody' },
];

function AvatarPlaceholder() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="h-full w-full text-ink/20"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="24" cy="18" r="8" />
      <path d="M8 42c0-8.8 7.2-14 16-14s16 5.2 16 14v2H8v-2z" />
    </svg>
  );
}

type LoadPhase = 'loading' | 'error' | 'ready';

export default function OnboardingPage() {
  const { locale, t } = useLocale();
  const { user } = useSession(); // page is wrapped in <RequireAuth>
  const navigate = useNavigate();

  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<RoleChoice>('customer');
  const [neighborhood, setNeighborhood] = useState('');

  // Avatar: existing URL (from a previous run) or a freshly compressed blob.
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarError, setAvatarError] = useState<MessageKey | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  const [nameError, setNameError] = useState<MessageKey | null>(null);
  const [hoodError, setHoodError] = useState<MessageKey | null>(null);
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setPhase('loading');
    try {
      const profile = await fetchOwnProfile(user.id);
      if (profile) {
        setDisplayName(profile.display_name);
        setRole(flagsToRole(profile.is_customer, profile.is_worker));
        if (isNeighborhood(profile.default_neighborhood)) {
          setNeighborhood(profile.default_neighborhood);
        }
        setAvatarPreview((prev) => prev ?? profile.avatar_url);
      }
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Revoke the last blob: preview URL on unmount.
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  async function onPickAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-picking the same file
    if (!file) return;
    const err = validateAvatarFile(file);
    if (err) {
      setAvatarError(err);
      return;
    }
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const blob = await compressAvatar(file);
      const url = URL.createObjectURL(blob);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;
      setAvatarBlob(blob);
      setAvatarPreview(url);
    } catch {
      setAvatarError('auth.errorAvatarProcess');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user || saving) return;
    const nErr = validateDisplayName(displayName);
    const hErr = validateNeighborhood(neighborhood);
    setNameError(nErr);
    setHoodError(hErr);
    if (nErr || hErr) return;

    setSaving(true);
    setFormError(null);
    try {
      let avatarUrl: string | undefined;
      if (avatarBlob) {
        avatarUrl = await uploadAvatar(user.id, avatarBlob);
      }
      await saveOnboarding(user.id, {
        display_name: displayName.trim(),
        locale,
        role,
        default_neighborhood: neighborhood,
        avatar_url: avatarUrl,
      });
      navigate('/', { replace: true });
    } catch {
      setFormError('auth.errorSaveFailed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-cream">
      <header className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-ink">
          {t('auth.onboardingTitle')}
        </h1>
        <p className="mt-1 text-sm text-ink-light">{t('auth.onboardingBody')}</p>
      </header>

      {phase === 'loading' && <SpinnerBlock />}

      {phase === 'error' && (
        <EmptyState
          title={t('common.errorTitle')}
          body={t('auth.profileLoadError')}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          }
        />
      )}

      {phase === 'ready' && (
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-1 flex-col gap-6 px-4 py-6"
        >
          {/* --- language (applied live; persisted on save — C5) --- */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">
              {t('auth.localeTitle')}
            </h2>
            <LocaleSwitcher />
          </section>

          {/* --- display name --- */}
          <section>
            <Input
              label={t('auth.displayNameLabel')}
              placeholder={t('auth.displayNamePlaceholder')}
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              error={nameError ? t(nameError) : undefined}
            />
          </section>

          {/* --- dual-role choice (C4) --- */}
          <section role="radiogroup" aria-label={t('auth.roleTitle')}>
            <h2 className="mb-2 text-sm font-semibold text-ink">
              {t('auth.roleTitle')}
            </h2>
            <div className="flex flex-col gap-2">
              {ROLE_OPTIONS.map((option) => {
                const selected = role === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRole(option.value)}
                    className={`min-h-touch rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                      selected
                        ? 'border-primary bg-primary-50'
                        : 'border-ink/10 bg-white'
                    }`}
                  >
                    <span className="block font-semibold text-ink">
                      {t(option.labelKey)}
                    </span>
                    <span className="block text-sm text-ink-light">
                      {t(option.bodyKey)}
                    </span>
                    {/* N6b — never charge workers to apply; say so where
                        they choose to become one (us-B1, uc-D10). */}
                    {option.value === 'worker' && (
                      <span className="mt-1 block text-sm font-semibold leading-relaxed text-primary-700">
                        {t('auth.applyFree')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Dual-role reassurance (C4): the choice is not a commitment. */}
            <p className="mt-2 text-sm text-ink-faint">
              {t('auth.roleSwitchHint')}
            </p>
            {role !== 'customer' && (
              <p className="mt-2 text-sm text-ink-faint">
                {t('auth.workerHint')}
              </p>
            )}
          </section>

          {/* --- default neighborhood (launch list) --- */}
          <section>
            <Select
              label={t('auth.neighborhoodTitle')}
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              error={hoodError ? t(hoodError) : undefined}
            >
              <option value="" disabled>
                {t('auth.errorNeighborhoodRequired')}
              </option>
              {NEIGHBORHOODS.map((n) => (
                <option key={n.value} value={n.value}>
                  {t(n.labelKey)}
                </option>
              ))}
            </Select>
          </section>

          {/* --- avatar (optional; images only, compressed client-side, C6) --- */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">
              {t('auth.avatarTitle')}{' '}
              <span className="font-normal text-ink-faint">
                ({t('common.optional')})
              </span>
            </h2>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-ink/5">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt={t('auth.avatarPreviewAlt')}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <AvatarPlaceholder />
                )}
              </div>
              <div className="flex flex-col items-start gap-1">
                <label className="inline-flex min-h-touch cursor-pointer items-center justify-center rounded-xl border border-primary bg-white px-5 text-base font-semibold text-primary-600 active:bg-primary-50">
                  {avatarBusy
                    ? t('common.loading')
                    : avatarPreview
                      ? t('auth.avatarChange')
                      : t('auth.avatarPick')}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={avatarBusy}
                    onChange={(e) => void onPickAvatar(e)}
                  />
                </label>
                <p className="text-xs text-ink-faint">{t('auth.avatarHint')}</p>
              </div>
            </div>
            {avatarError && (
              <p className="mt-2 text-sm text-status-disputed" role="alert">
                {t(avatarError)}
              </p>
            )}
          </section>

          {formError && (
            <p className="text-sm text-status-disputed" role="alert">
              {t(formError)}
            </p>
          )}

          {/* Thumb zone: the ONE primary action, pinned to the bottom. */}
          <div className="sticky bottom-0 mt-auto -mx-4 border-t border-ink/5 bg-cream/95 px-4 py-3 backdrop-blur">
            <Button type="submit" full disabled={saving || avatarBusy}>
              {saving ? t('auth.saving') : t('auth.continue')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
