// Post-a-job — guided multi-step wizard (SPEC frontend rules):
//   1 category → 2 details → 3 TWO-LOCATION service address (+ diaspora
//   toggle) → 4 date/budget/workers → 5 review & post via rpc_post_job.
// The typed service address is the truth; device GPS is an OPTIONAL
// convenience that only attaches a map point for matching (service_geo).
// ≤3 primary actions per screen; every string through i18n (C5); money is
// integer cents (C7); the diaspora contact phone is masked server-side (C3).

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { containsPhoneNumber, maskPhone } from '../../lib/phone';
import { formatETB } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { TextArea } from '../../components/TextArea';
import { Spinner, SpinnerBlock } from '../../components/Spinner';
import { NEIGHBORHOODS, isNeighborhood } from '../auth/validation';
import type { MessageKey } from '../../i18n';
import {
  ADDRESS_MAX,
  BUDGET_MAX_BIRR,
  DESCRIPTION_MAX,
  EMPTY_POST_JOB_FORM,
  LANDMARK_MAX,
  LOCAL_CONTACT_NAME_MAX,
  POST_JOB_STEPS,
  TIME_WINDOW_MAX,
  TIME_WINDOW_PRESETS,
  TITLE_MAX,
  WORKERS_MAX,
  WORKERS_MIN,
  buildPostJobArgs,
  formatDateNeeded,
  getErrorMessage,
  localTodayIso,
  parseEtbToCents,
  rpcErrorKey,
  validatePostJobStep,
  type FieldErrors,
  type PostJobForm,
} from './logic';
import {
  fetchActiveCategories,
  fetchOwnFlags,
  postJob,
  type CategoryRow,
} from './api';

const STEP_TITLE_KEYS: Record<(typeof POST_JOB_STEPS)[number], MessageKey> = {
  category: 'jobs.stepCategory',
  details: 'jobs.stepDetails',
  location: 'jobs.stepLocation',
  schedule: 'jobs.stepSchedule',
  review: 'jobs.stepReview',
};

type GeoState = 'idle' | 'getting' | 'error';

export default function PostJobPage() {
  const { t, locale } = useLocale();
  const { user } = useSession();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [categoriesError, setCategoriesError] = useState(false);
  const [categoriesReload, setCategoriesReload] = useState(0);

  const [form, setForm] = useState<PostJobForm>(EMPTY_POST_JOB_FORM);
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [geoState, setGeoState] = useState<GeoState>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [submitErrorKey, setSubmitErrorKey] = useState<MessageKey | null>(null);

  const todayIso = useMemo(() => localTodayIso(), []);
  const step = POST_JOB_STEPS[stepIndex];

  useEffect(() => {
    let cancelled = false;
    setCategories(null);
    setCategoriesError(false);
    fetchActiveCategories()
      .then((rows) => {
        if (!cancelled) setCategories(rows);
      })
      .catch(() => {
        if (!cancelled) setCategoriesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [categoriesReload]);

  // Prefill the SERVICE neighborhood from the profile default — a starting
  // point the user can change; never from GPS (two-location model).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchOwnFlags(user.id)
      .then((flags) => {
        if (cancelled || !flags) return;
        if (isNeighborhood(flags.default_neighborhood)) {
          setForm((f) =>
            f.neighborhood === null
              ? { ...f, neighborhood: flags.default_neighborhood }
              : f,
          );
        }
      })
      .catch(() => {
        // Prefill is a convenience only — the form works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update = <K extends keyof PostJobForm>(key: K, value: PostJobForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key as keyof FieldErrors];
      return next;
    });
  };

  const goNext = () => {
    const stepErrors = validatePostJobStep(step, form, todayIso);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setStepIndex((i) => Math.min(i + 1, POST_JOB_STEPS.length - 1));
  };

  const goBack = () => {
    setErrors({});
    setSubmitErrorKey(null);
    if (stepIndex === 0) navigate(-1);
    else setStepIndex((i) => i - 1);
  };

  const captureLocation = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoState('error');
      return;
    }
    setGeoState('getting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }));
        setGeoState('idle');
      },
      () => setGeoState('error'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const clearLocation = () => {
    setForm((f) => ({ ...f, lat: null, lng: null }));
    setGeoState('idle');
  };

  const submit = async () => {
    const allErrors = validatePostJobStep('review', form, todayIso);
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      return;
    }
    setSubmitting(true);
    setSubmitErrorKey(null);
    try {
      const result = await postJob(buildPostJobArgs(form));
      navigate(`/jobs/${result.job_id}`, { replace: true });
    } catch (e) {
      setSubmitErrorKey(rpcErrorKey(getErrorMessage(e)));
      setSubmitting(false);
    }
  };

  const selectedCategory =
    categories?.find((c) => c.slug === form.categorySlug) ?? null;
  const categoryName = (c: CategoryRow) =>
    locale === 'am' ? c.name_am : c.name_en;

  const detailsPhoneWarn =
    containsPhoneNumber(form.title) || containsPhoneNumber(form.description);

  const budgetPreview = (() => {
    const parsed = parseEtbToCents(form.budgetBirr);
    return parsed.ok && parsed.cents != null ? formatETB(parsed.cents) : null;
  })();

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title={t('jobs.postTitle')} back />

      {/* Progress */}
      <div className="px-4 pt-3">
        <p className="text-xs font-medium text-ink-faint">
          {t('jobs.stepOf', {
            current: stepIndex + 1,
            total: POST_JOB_STEPS.length,
          })}
        </p>
        <div className="mt-1.5 flex gap-1" aria-hidden="true">
          {POST_JOB_STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-ink/10'}`}
            />
          ))}
        </div>
        <h2 className="mt-3 text-xl font-bold text-ink">
          {t(STEP_TITLE_KEYS[step])}
        </h2>
      </div>

      <div className="flex-1 space-y-4 px-4 py-4">
        {step === 'category' && (
          <>
            <p className="text-sm text-ink-light">{t('jobs.categoryHint')}</p>
            {categoriesError ? (
              <div className="rounded-2xl bg-white p-4 text-center">
                <p className="text-sm text-ink-light">{t('jobs.loadFailed')}</p>
                <Button
                  variant="secondary"
                  className="mt-3"
                  onClick={() => setCategoriesReload((n) => n + 1)}
                >
                  {t('common.retry')}
                </Button>
              </div>
            ) : categories === null ? (
              <SpinnerBlock />
            ) : (
              <div className="grid grid-cols-2 gap-3" role="radiogroup">
                {categories.map((c) => {
                  const selected = form.categorySlug === c.slug;
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        update('categorySlug', c.slug);
                        setStepIndex(1);
                      }}
                      className={`min-h-touch rounded-2xl border-2 bg-white p-3 text-left transition-colors ${
                        selected
                          ? 'border-primary bg-primary-50'
                          : 'border-transparent shadow-sm active:bg-primary-50'
                      }`}
                    >
                      <span className="text-2xl" aria-hidden="true">
                        {c.icon ?? '🛠️'}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-ink">
                        {categoryName(c)}
                      </span>
                      {c.min_verification_level !== 'none' && (
                        <span className="mt-0.5 block text-xs text-verified">
                          {t('jobs.categoryNeedsVerification')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {errors.categorySlug && (
              <p className="text-sm text-status-disputed">
                {t(errors.categorySlug)}
              </p>
            )}
          </>
        )}

        {step === 'details' && (
          <>
            <Input
              label={t('jobs.titleLabel')}
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder={t('jobs.titlePlaceholder')}
              maxLength={TITLE_MAX}
              hint={t('jobs.titleHint')}
              error={errors.title ? t(errors.title) : undefined}
            />
            <TextArea
              label={t('jobs.descriptionLabel')}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder={t('jobs.descriptionPlaceholder')}
              maxLength={DESCRIPTION_MAX}
              rows={5}
              error={errors.description ? t(errors.description) : undefined}
            />
            {detailsPhoneWarn && (
              <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-700">
                {t('jobs.phoneSoftWarn')}
              </p>
            )}
          </>
        )}

        {step === 'location' && (
          <>
            <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-700">
              {t('jobs.twoLocationHint')}
            </p>
            <Input
              label={t('jobs.addressLabel')}
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder={t('jobs.addressPlaceholder')}
              maxLength={ADDRESS_MAX}
              error={errors.address ? t(errors.address) : undefined}
            />
            <Input
              label={`${t('jobs.landmarkLabel')} (${t('common.optional')})`}
              value={form.landmark}
              onChange={(e) => update('landmark', e.target.value)}
              placeholder={t('jobs.landmarkPlaceholder')}
              maxLength={LANDMARK_MAX}
              error={errors.landmark ? t(errors.landmark) : undefined}
            />
            <Select
              label={t('jobs.neighborhoodLabel')}
              value={form.neighborhood ?? ''}
              onChange={(e) =>
                update('neighborhood', e.target.value === '' ? null : e.target.value)
              }
              error={errors.neighborhood ? t(errors.neighborhood) : undefined}
            >
              <option value="">{t('jobs.neighborhoodPick')}</option>
              {NEIGHBORHOODS.map((n) => (
                <option key={n.value} value={n.value}>
                  {t(n.labelKey)}
                </option>
              ))}
            </Select>

            {/* Optional GPS convenience — matching only, never the address */}
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              {form.lat != null && form.lng != null ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-verified">
                    ✓ {t('jobs.locationCaptured')}
                  </span>
                  <Button variant="ghost" onClick={clearLocation}>
                    {t('jobs.locationClear')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  full
                  onClick={captureLocation}
                  disabled={geoState === 'getting'}
                >
                  {geoState === 'getting' ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      {t('jobs.locationGetting')}
                    </>
                  ) : (
                    t('jobs.useMyLocation')
                  )}
                </Button>
              )}
              <p className="mt-2 text-xs text-ink-faint">
                {t('jobs.useMyLocationHint')}
              </p>
              {geoState === 'error' && (
                <p className="mt-1 text-xs text-status-disputed">
                  {t('jobs.locationError')}
                </p>
              )}
            </div>

            {/* Diaspora flow (SPEC: first-class) */}
            <label className="flex min-h-touch cursor-pointer items-start gap-3 rounded-2xl bg-white p-3 shadow-sm">
              <input
                type="checkbox"
                checked={form.isDiaspora}
                onChange={(e) => update('isDiaspora', e.target.checked)}
                className="mt-1 h-5 w-5 accent-primary"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">
                  {t('jobs.diasporaToggle')}
                </span>
                <span className="block text-xs text-ink-faint">
                  {t('jobs.diasporaHint')}
                </span>
              </span>
            </label>
            {form.isDiaspora && (
              <div className="space-y-4 rounded-2xl border border-primary-200 bg-primary-50/50 p-3">
                <Input
                  label={t('jobs.localContactName')}
                  value={form.localContactName}
                  onChange={(e) => update('localContactName', e.target.value)}
                  maxLength={LOCAL_CONTACT_NAME_MAX}
                  error={
                    errors.localContactName
                      ? t(errors.localContactName)
                      : undefined
                  }
                />
                <Input
                  label={`${t('jobs.localContactPhone')} (${t('common.optional')})`}
                  value={form.localContactPhone}
                  onChange={(e) => update('localContactPhone', e.target.value)}
                  inputMode="tel"
                  placeholder="09…"
                  hint={t('jobs.localContactPhoneHint')}
                  error={
                    errors.localContactPhone
                      ? t(errors.localContactPhone)
                      : undefined
                  }
                />
              </div>
            )}
          </>
        )}

        {step === 'schedule' && (
          <>
            <Input
              label={t('jobs.dateLabel')}
              type="date"
              value={form.dateNeeded}
              min={todayIso}
              onChange={(e) => update('dateNeeded', e.target.value)}
              error={errors.dateNeeded ? t(errors.dateNeeded) : undefined}
            />
            <div>
              <span className="mb-1 block text-sm font-medium text-ink">
                {t('jobs.timeWindowLabel')}
              </span>
              <div className="mb-2 flex flex-wrap gap-2">
                {TIME_WINDOW_PRESETS.map((preset) => {
                  const label = t(preset.labelKey);
                  const active = form.timeWindow === label;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => update('timeWindow', active ? '' : label)}
                      className={`min-h-touch rounded-full border px-4 text-sm font-medium ${
                        active
                          ? 'border-primary bg-primary text-white'
                          : 'border-ink/15 bg-white text-ink-light'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <Input
                value={form.timeWindow}
                onChange={(e) => update('timeWindow', e.target.value)}
                placeholder={t('jobs.timeWindowPlaceholder')}
                maxLength={TIME_WINDOW_MAX}
                error={errors.timeWindow ? t(errors.timeWindow) : undefined}
                aria-label={t('jobs.timeWindowLabel')}
              />
            </div>
            <Input
              label={`${t('jobs.budgetLabel')} (${t('common.optional')})`}
              value={form.budgetBirr}
              onChange={(e) => update('budgetBirr', e.target.value)}
              inputMode="decimal"
              placeholder="1500"
              hint={
                budgetPreview
                  ? budgetPreview
                  : t('jobs.budgetHint')
              }
              error={
                errors.budgetBirr
                  ? t(errors.budgetBirr, {
                      max: BUDGET_MAX_BIRR.toLocaleString(),
                    })
                  : undefined
              }
            />
            <div>
              <span className="mb-1 block text-sm font-medium text-ink">
                {t('jobs.workersLabel')}
              </span>
              <div className="flex items-center gap-4">
                <Button
                  variant="secondary"
                  aria-label={t('jobs.workersFewer')}
                  onClick={() =>
                    update(
                      'workersNeeded',
                      Math.max(WORKERS_MIN, form.workersNeeded - 1),
                    )
                  }
                  disabled={form.workersNeeded <= WORKERS_MIN}
                >
                  −
                </Button>
                <span
                  className="min-w-8 text-center text-xl font-bold text-ink"
                  aria-live="polite"
                >
                  {form.workersNeeded}
                </span>
                <Button
                  variant="secondary"
                  aria-label={t('jobs.workersMore')}
                  onClick={() =>
                    update(
                      'workersNeeded',
                      Math.min(WORKERS_MAX, form.workersNeeded + 1),
                    )
                  }
                  disabled={form.workersNeeded >= WORKERS_MAX}
                >
                  +
                </Button>
              </div>
              {errors.workersNeeded && (
                <p className="mt-1 text-sm text-status-disputed">
                  {t(errors.workersNeeded)}
                </p>
              )}
            </div>
          </>
        )}

        {step === 'review' && (
          <div className="space-y-3">
            <ReviewRow label={t('jobs.reviewCategory')}>
              {selectedCategory
                ? `${selectedCategory.icon ?? ''} ${categoryName(selectedCategory)}`.trim()
                : form.categorySlug}
            </ReviewRow>
            <ReviewRow label={t('jobs.titleLabel')}>
              {form.title.trim()}
            </ReviewRow>
            {form.description.trim() !== '' && (
              <ReviewRow label={t('jobs.descriptionLabel')}>
                {form.description.trim()}
              </ReviewRow>
            )}
            <ReviewRow label={t('jobs.reviewLocation')}>
              {[form.address.trim(), form.landmark.trim(), form.neighborhood]
                .filter(Boolean)
                .join(' · ')}
              {form.lat != null && (
                <span className="mt-0.5 block text-xs text-verified">
                  ✓ {t('jobs.reviewGeoAttached')}
                </span>
              )}
            </ReviewRow>
            {form.isDiaspora && (
              <ReviewRow label={t('jobs.reviewDiaspora')}>
                {form.localContactName.trim()}
                {form.localContactPhone.trim() !== '' && (
                  <span className="mt-0.5 block text-xs text-ink-faint">
                    {/* C3: even the poster's own preview shows the number
                        masked — the raw value is never stored anywhere */}
                    {maskPhone(form.localContactPhone)} ·{' '}
                    {t('jobs.localContactPhoneHint')}
                  </span>
                )}
              </ReviewRow>
            )}
            <ReviewRow label={t('jobs.reviewSchedule')}>
              {[
                form.dateNeeded !== ''
                  ? formatDateNeeded(form.dateNeeded, locale)
                  : '',
                form.timeWindow.trim(),
              ]
                .filter(Boolean)
                .join(' · ') || t('jobs.reviewNotSet')}
            </ReviewRow>
            <ReviewRow label={t('jobs.reviewBudget')}>
              {budgetPreview ?? t('jobs.reviewNotSet')}
            </ReviewRow>
            <ReviewRow label={t('jobs.reviewWorkers')}>
              {t('jobs.workersCount', { count: form.workersNeeded })}
            </ReviewRow>
            {detailsPhoneWarn && (
              <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-700">
                {t('jobs.phoneSoftWarn')}
              </p>
            )}
            {submitErrorKey && (
              <p className="rounded-xl bg-status-disputed/10 p-3 text-sm font-medium text-status-disputed">
                {t(submitErrorKey)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer: ≤2 actions, thumb zone */}
      <div className="sticky bottom-0 flex gap-3 border-t border-ink/5 bg-cream/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <Button variant="ghost" onClick={goBack} disabled={submitting}>
          {t('common.back')}
        </Button>
        {step === 'review' ? (
          <Button full onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Spinner className="h-4 w-4 text-white" />
                {t('jobs.posting')}
              </>
            ) : (
              t('jobs.postSubmit')
            )}
          </Button>
        ) : (
          <Button
            full
            onClick={goNext}
            disabled={step === 'category' && categories === null}
          >
            {t('common.next')}
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="text-xs font-medium text-ink-faint">{label}</p>
      <div className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium text-ink">
        {children}
      </div>
    </div>
  );
}
