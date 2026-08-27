// Worker profile editor — bio, categories, skills, neighborhood + travel
// radius, availability status + weekly availability (jsonb), ETB price range
// (integer cents, C7) + price type, verification level display.
//
// Writes stay inside the RLS column grants: trust columns (rating_avg,
// verification_level, badge_level, …) are shown read-only and never sent.
// Dual-role (C4): saving from a customer-only account creates the worker
// profile and flips profiles.is_worker on.

import { useEffect, useState } from 'react';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { formatETB } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { SpinnerBlock } from '../../components/Spinner';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { TextArea } from '../../components/TextArea';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { RatingStars } from '../../components/RatingStars';
import type { AvailabilityStatus } from '../../components/WorkerCard';
import type { MessageKey } from '../../i18n';
import {
  fetchActiveCategories,
  fetchOwnProfile,
  fetchOwnWorkerProfile,
  saveWorkerProfile,
} from './api';
import {
  DAY_LABEL_KEYS,
  NEIGHBORHOODS,
  PRICE_TYPES,
  WEEK_DAYS,
  isPriceType,
  centsToEtbInput,
  parseAvailability,
  parseRadius,
  parseSkills,
  serializeAvailability,
  skillsToInput,
  toggleValue,
  validateBio,
  validateCategories,
  validateHours,
  validatePrices,
  type DayKey,
} from './logic';
import { useAsync } from './useAsync';
import { ChoiceChip, ErrorCard, RowLink, SectionTitle } from './ui';
import type { WorkerProfileInput, WorkerProfileRow } from './types';

const AVAILABILITY_OPTIONS: readonly {
  value: AvailabilityStatus;
  labelKey: MessageKey;
}[] = [
  { value: 'available_now', labelKey: 'common.availableNow' },
  { value: 'available_today', labelKey: 'common.availableToday' },
  { value: 'busy', labelKey: 'common.busy' },
  { value: 'off', labelKey: 'common.off' },
];

interface FormState {
  bio: string;
  categories: string[];
  skillsRaw: string;
  neighborhood: string; // '' = none selected
  radiusRaw: string;
  availabilityStatus: AvailabilityStatus;
  days: DayKey[];
  start: string;
  end: string;
  priceMinRaw: string;
  priceMaxRaw: string;
  priceType: string; // '' = none
}

interface FormErrors {
  bio: MessageKey | null;
  categories: MessageKey | null;
  skills: MessageKey | null;
  radius: MessageKey | null;
  hours: MessageKey | null;
  priceMin: MessageKey | null;
  priceMax: MessageKey | null;
}

const NO_ERRORS: FormErrors = {
  bio: null,
  categories: null,
  skills: null,
  radius: null,
  hours: null,
  priceMin: null,
  priceMax: null,
};

function formFromRow(row: WorkerProfileRow | null): FormState {
  const availability = parseAvailability(row?.availability ?? null);
  return {
    bio: row?.bio ?? '',
    categories: row?.categories ?? [],
    skillsRaw: skillsToInput(row?.skills ?? []),
    neighborhood: row?.neighborhood ?? '',
    radiusRaw: String(row?.travel_radius_km ?? 10),
    availabilityStatus: row?.availability_status ?? 'off',
    days: availability.days,
    start: availability.start,
    end: availability.end,
    priceMinRaw: centsToEtbInput(row?.price_min_cents ?? null),
    priceMaxRaw: centsToEtbInput(row?.price_max_cents ?? null),
    priceType: row?.price_type ?? '',
  };
}

export default function WorkerProfileEditPage() {
  const { locale, t } = useLocale();
  const { user } = useSession();
  const userId = user?.id ?? '';

  const profile = useAsync(
    () => fetchOwnProfile(userId),
    `wpe:profile:${userId}`,
    !!userId,
  );
  const worker = useAsync(
    () => fetchOwnWorkerProfile(userId),
    `wpe:worker:${userId}`,
    !!userId,
  );
  const categories = useAsync(fetchActiveCategories, 'wpe:categories');

  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>(
    'idle',
  );

  // Hydrate the form ONCE per successful load (worker.data may be null for a
  // first-time worker — that hydrates the defaults).
  useEffect(() => {
    if (!worker.loading && !worker.failed && form === null) {
      setForm(formFromRow(worker.data));
    }
  }, [worker.loading, worker.failed, worker.data, form]);

  const patch = (partial: Partial<FormState>) => {
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));
    setSaveState('idle');
  };

  const onSave = async () => {
    if (!form || !userId) return;

    const skills = parseSkills(form.skillsRaw);
    const radius = parseRadius(form.radiusRaw);
    const prices = validatePrices(form.priceMinRaw, form.priceMaxRaw);
    const nextErrors: FormErrors = {
      bio: validateBio(form.bio),
      categories: validateCategories(form.categories),
      skills: skills.error,
      radius: radius.error,
      hours: validateHours(form.start, form.end),
      priceMin: prices.minError,
      priceMax: prices.maxError,
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some((e) => e !== null)) return;

    const input: WorkerProfileInput = {
      bio: form.bio.trim() === '' ? null : form.bio.trim(),
      categories: form.categories,
      skills: skills.skills,
      neighborhood: form.neighborhood === '' ? null : form.neighborhood,
      travel_radius_km: radius.km ?? 10,
      availability: serializeAvailability({
        days: form.days,
        start: form.start,
        end: form.end,
      }),
      availability_status: form.availabilityStatus,
      price_min_cents: prices.minCents,
      price_max_cents: prices.maxCents,
      price_type: isPriceType(form.priceType) ? form.priceType : null,
    };

    setSaving(true);
    try {
      await saveWorkerProfile(userId, input, profile.data?.is_worker === false);
      setSaveState('saved');
      profile.reload();
      worker.reload();
    } catch {
      setSaveState('failed');
    } finally {
      setSaving(false);
    }
  };

  const loading =
    profile.loading || worker.loading || categories.loading || form === null;

  return (
    <div>
      <PageHeader title={t('profile.workerProfileTitle')} back />
      <div className="space-y-5 p-4">
        {worker.failed || profile.failed ? (
          <ErrorCard
            onRetry={() => {
              profile.reload();
              worker.reload();
            }}
          />
        ) : loading ? (
          <SpinnerBlock />
        ) : (
          <>
            <p className="text-sm text-ink-light">{t('profile.workerFormIntro')}</p>
            {/* N6b — applying is free; commission only on completed work. */}
            <p className="text-sm font-semibold leading-relaxed text-primary-700">
              {t('profile.applyFreeIntro')}
            </p>

            {/* ---- Verification level (read-only, server-set) ---- */}
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">
                  {t('verification.currentLevel')}
                </span>
                {worker.data && worker.data.verification_level !== 'none' ? (
                  <VerifiedBadge level={worker.data.verification_level} />
                ) : (
                  <span className="text-sm text-ink-faint">
                    {t('common.verificationNone')}
                  </span>
                )}
              </div>
              <div className="mt-3">
                <RowLink
                  to="/me/verification"
                  title={t('verification.getVerified')}
                />
              </div>
            </section>

            {/* ---- Trust stats (server-computed, read-only) ---- */}
            {worker.data && (
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <SectionTitle>{t('profile.trustTitle')}</SectionTitle>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <RatingStars
                    value={
                      worker.data.review_count > 0 ? worker.data.rating_avg : null
                    }
                    count={worker.data.review_count}
                  />
                  <span className="text-sm text-ink-light">
                    {t('common.jobsCountShort', {
                      count: worker.data.jobs_completed,
                    })}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  {t('profile.trustHint')}
                </p>
              </section>
            )}

            {/* ---- Bio ---- */}
            <TextArea
              label={t('profile.bioLabel')}
              hint={t('profile.bioHint')}
              error={errors.bio ? t(errors.bio) : undefined}
              value={form.bio}
              maxLength={2100}
              onChange={(e) => patch({ bio: e.target.value })}
            />

            {/* ---- Categories multi-select ---- */}
            <section>
              <SectionTitle>{t('profile.categoriesLabel')}</SectionTitle>
              {categories.failed ? (
                <ErrorCard onRetry={categories.reload} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(categories.data ?? []).map((cat) => (
                    <ChoiceChip
                      key={cat.slug}
                      selected={form.categories.includes(cat.slug)}
                      onToggle={() =>
                        patch({
                          categories: toggleValue(form.categories, cat.slug),
                        })
                      }
                    >
                      {cat.icon ? `${cat.icon} ` : ''}
                      {locale === 'am' ? cat.name_am : cat.name_en}
                    </ChoiceChip>
                  ))}
                </div>
              )}
              {errors.categories && (
                <p className="mt-1 text-sm text-status-disputed">
                  {t(errors.categories)}
                </p>
              )}
            </section>

            {/* ---- Skills ---- */}
            <Input
              label={t('profile.skillsLabel')}
              hint={t('profile.skillsHint')}
              error={errors.skills ? t(errors.skills) : undefined}
              value={form.skillsRaw}
              onChange={(e) => patch({ skillsRaw: e.target.value })}
            />

            {/* ---- Neighborhood + travel radius ---- */}
            <div className="flex gap-3">
              <div className="flex-1">
                <Select
                  label={t('profile.neighborhoodLabel')}
                  value={form.neighborhood}
                  onChange={(e) => patch({ neighborhood: e.target.value })}
                >
                  <option value="">{t('profile.neighborhoodNone')}</option>
                  {NEIGHBORHOODS.map((n) => (
                    <option key={n.value} value={n.value}>
                      {locale === 'am' ? n.am : n.en}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-32">
                <Input
                  label={t('profile.radiusLabel')}
                  inputMode="numeric"
                  error={errors.radius ? t(errors.radius) : undefined}
                  value={form.radiusRaw}
                  onChange={(e) => patch({ radiusRaw: e.target.value })}
                />
              </div>
            </div>

            {/* ---- Availability status ---- */}
            <Select
              label={t('profile.availabilityStatusLabel')}
              value={form.availabilityStatus}
              onChange={(e) =>
                patch({
                  availabilityStatus: e.target.value as AvailabilityStatus,
                })
              }
            >
              {AVAILABILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </Select>

            {/* ---- Weekly availability (jsonb) ---- */}
            <section>
              <SectionTitle>{t('profile.weeklyLabel')}</SectionTitle>
              <p className="mb-2 text-xs text-ink-faint">
                {t('profile.weeklyHint')}
              </p>
              <div className="flex flex-wrap gap-2">
                {WEEK_DAYS.map((day) => (
                  <ChoiceChip
                    key={day}
                    selected={form.days.includes(day)}
                    onToggle={() => patch({ days: toggleValue(form.days, day) })}
                  >
                    {t(DAY_LABEL_KEYS[day])}
                  </ChoiceChip>
                ))}
              </div>
              <div className="mt-3 flex gap-3">
                <div className="flex-1">
                  <Input
                    label={t('profile.hoursStart')}
                    type="time"
                    value={form.start}
                    onChange={(e) => patch({ start: e.target.value })}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    label={t('profile.hoursEnd')}
                    type="time"
                    value={form.end}
                    onChange={(e) => patch({ end: e.target.value })}
                  />
                </div>
              </div>
              {errors.hours && (
                <p className="mt-1 text-sm text-status-disputed">
                  {t(errors.hours)}
                </p>
              )}
            </section>

            {/* ---- Price range (ETB, integer cents — C7) ---- */}
            <section>
              <SectionTitle>{t('profile.priceHint')}</SectionTitle>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    label={t('profile.priceMinLabel')}
                    inputMode="decimal"
                    error={errors.priceMin ? t(errors.priceMin) : undefined}
                    value={form.priceMinRaw}
                    onChange={(e) => patch({ priceMinRaw: e.target.value })}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    label={t('profile.priceMaxLabel')}
                    inputMode="decimal"
                    error={errors.priceMax ? t(errors.priceMax) : undefined}
                    value={form.priceMaxRaw}
                    onChange={(e) => patch({ priceMaxRaw: e.target.value })}
                  />
                </div>
              </div>
              {/* Live preview through formatETB — the exact renderer customers see */}
              {(() => {
                const prices = validatePrices(form.priceMinRaw, form.priceMaxRaw);
                if (
                  prices.minError ||
                  prices.maxError ||
                  (prices.minCents == null && prices.maxCents == null)
                ) {
                  return null;
                }
                const parts = [
                  prices.minCents != null ? formatETB(prices.minCents) : null,
                  prices.maxCents != null ? formatETB(prices.maxCents) : null,
                ].filter((p): p is string => p !== null);
                return (
                  <p className="mt-1 text-sm font-medium text-primary-700">
                    {parts.join(' – ')}
                  </p>
                );
              })()}
              <div className="mt-3">
                <Select
                  label={t('profile.priceTypeLabel')}
                  value={form.priceType}
                  onChange={(e) => patch({ priceType: e.target.value })}
                >
                  <option value="">{t('common.optional')}</option>
                  {PRICE_TYPES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {t(p.labelKey)}
                    </option>
                  ))}
                </Select>
              </div>
            </section>

            {/* ---- Save ---- */}
            <section className="pt-1">
              {saveState === 'saved' && (
                <p className="mb-2 text-center text-sm font-semibold text-verified">
                  {t('profile.saveSuccess')}
                </p>
              )}
              {saveState === 'failed' && (
                <p className="mb-2 text-center text-sm text-status-disputed">
                  {t('profile.saveError')}
                </p>
              )}
              <Button full onClick={onSave} disabled={saving}>
                {saving ? t('common.loading') : t('common.save')}
              </Button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
