// Home — gradient hero (greeting + search entry), overlapping quick-action
// cards, 8-category grid, 'Available Now' edge-bleed rail, recent open jobs
// teaser (shared JobCard), trust strip.
//
// RLS reality: the catalog (categories) is anon-readable; worker profiles and
// jobs require a signed-in user, so signed-out visitors get the grid + trust
// strip + a sign-in card instead of half-broken queries.
//
// Ordering law: the 'Available Now' rail ranks badge_level, then rating, then
// a STABLE user_id tiebreak (rankAvailableNow) — geography (or anything else)
// is never decided by the alphabet.

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { formatRelativeTime } from '../../lib/format';
import { LocaleSwitcher } from '../../components/LocaleSwitcher';
import { SpinnerBlock } from '../../components/Spinner';
import { WorkerCard } from '../../components/WorkerCard';
import { JobCard } from '../../components/JobCard';
import {
  fetchAvailableNowWorkers,
  fetchCategories,
  fetchOpenJobsTeaser,
} from '../browse/api';
import {
  categoryName,
  neighborhoodLabel,
  workerCardFromListRow,
} from '../browse/logic';
import { useAsync } from '../browse/useAsync';
import {
  CategoryGrid,
  ErrorCard,
  SectionTitle,
  SignInCard,
} from '../browse/ui';
import {
  GREETING_KEY,
  categoryNamesFor,
  greetingSlot,
  rankAvailableNow,
} from './logic';
import type { MessageKey } from '../../i18n';

/** Deep link into the post-job wizard with a seeded category (Track B reads
 *  the `?category=` param — this page only emits the link). */
const ERRANDS_POST_LINK = '/post?category=errands-city-help';

const TRUST_ITEMS: readonly {
  titleKey: MessageKey;
  bodyKey: MessageKey;
}[] = [
  { titleKey: 'home.trustVerifiedTitle', bodyKey: 'home.trustVerifiedBody' },
  { titleKey: 'home.trustGuarantorTitle', bodyKey: 'home.trustGuarantorBody' },
  { titleKey: 'home.trustReviewsTitle', bodyKey: 'home.trustReviewsBody' },
];

function TrustStrip() {
  const { t } = useLocale();
  return (
    <section aria-label={t('home.trustStripTitle')}>
      <SectionTitle>{t('home.trustStripTitle')}</SectionTitle>
      <ul className="grid grid-cols-3 gap-2">
        {TRUST_ITEMS.map((item) => (
          <li
            key={item.titleKey}
            className="rounded-2xl bg-white p-3 text-center shadow-sm"
          >
            <span
              aria-hidden="true"
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-verified-light text-verified"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4"
                fill="currentColor"
              >
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.6 6.1l-4.2 4.5a.75.75 0 01-1.1 0L4.4 8.5a.75.75 0 011.1-1l1.35 1.5 3.65-3.9a.75.75 0 111.1 1z" />
              </svg>
            </span>
            <p className="mt-1.5 text-xs font-bold leading-tight text-ink">
              {t(item.titleKey)}
            </p>
            <p className="mt-0.5 text-[11px] leading-tight text-ink-faint">
              {t(item.bodyKey)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function HomePage() {
  const { locale, t } = useLocale();
  const { user, loading: sessionLoading } = useSession();
  const navigate = useNavigate();

  const categories = useAsync(fetchCategories, 'home:categories');
  const availableNow = useAsync(
    fetchAvailableNowWorkers,
    'home:availableNow',
    !!user,
  );
  const openJobs = useAsync(fetchOpenJobsTeaser, 'home:openJobs', !!user);

  const categoryList = useMemo(() => categories.data ?? [], [categories.data]);
  const categoryBySlug = useMemo(
    () => new Map(categoryList.map((category) => [category.slug, category])),
    [categoryList],
  );
  const railWorkers = useMemo(
    () => rankAvailableNow(availableNow.data ?? []),
    [availableNow.data],
  );

  return (
    <div>
      {/* Gradient hero — wraps the greeting + search entry (v1-adoption T2). */}
      <header className="brand-gradient rounded-b-[2rem] px-5 pb-8 pt-5 text-white">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-extrabold">{t('common.appName')}</h1>
          <div className="rounded-xl bg-white/95 shadow-sm">
            <LocaleSwitcher />
          </div>
        </div>
        <div className="mt-4">
          <h2 className="text-2xl font-extrabold">
            {t(GREETING_KEY[greetingSlot(new Date().getHours())])}
          </h2>
          <p className="mt-0.5 text-sm opacity-90">{t('common.tagline')}</p>
        </div>
        <div className="mt-4">
          <p className="text-sm font-semibold">{t('home.heroSubline')}</p>
          {/* Search entry — navigates to Browse where the real search lives */}
          <button
            type="button"
            onClick={() => navigate('/browse')}
            className="mt-2 flex w-full min-h-touch items-center gap-2 rounded-full bg-white px-4 text-left text-sm text-ink-faint shadow-button"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="M20.5 20.5l-4.9-4.9" />
            </svg>
            {t('home.searchPlaceholder')}
          </button>
        </div>
      </header>

      {/* Quick actions — pulled up over the hero's rounded bottom edge. */}
      <div className="-mt-4 mx-4 grid grid-cols-2 gap-3">
        <Link
          to="/post"
          className="rounded-2xl bg-ink p-4 text-white shadow-elevated transition motion-safe:active:scale-95"
        >
          <span className="flex items-center gap-1.5 font-bold">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t('home.postJobCardTitle')}
          </span>
          <span className="mt-1 block text-[11px] opacity-80">
            {t('home.postJobCardBody')}
          </span>
        </Link>
        <Link
          to={ERRANDS_POST_LINK}
          className="rounded-2xl border border-ink/10 bg-white p-4 shadow-card transition motion-safe:active:scale-95"
        >
          <span className="flex items-center gap-1.5 font-bold text-primary-700">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M13 2L4.5 13.5h5L11 22l8.5-11.5h-5L13 2z" />
            </svg>
            {t('home.errandsCardTitle')}
          </span>
          <span className="mt-1 block text-[11px] text-ink-faint">
            {t('home.errandsCardBody')}
          </span>
        </Link>
      </div>

      <div className="space-y-5 p-4">
        <section aria-label={t('home.categoriesSection')}>
          <SectionTitle>{t('home.categoriesSection')}</SectionTitle>
          {categories.loading ? (
            <SpinnerBlock />
          ) : categories.failed ? (
            <ErrorCard onRetry={categories.reload} />
          ) : (
            <CategoryGrid categories={categoryList} />
          )}
        </section>

        {sessionLoading ? (
          <SpinnerBlock />
        ) : !user ? (
          <SignInCard
            title={t('home.signInTitle')}
            body={t('home.signInBody')}
          />
        ) : (
          <>
            <section aria-label={t('home.availableNowSection')}>
              <SectionTitle
                action={
                  <Link
                    to="/browse"
                    className="text-sm font-semibold text-primary-600"
                  >
                    {t('common.seeAll')}
                  </Link>
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full bg-verified"
                  />
                  {t('home.availableNowSection')}
                </span>
              </SectionTitle>
              {availableNow.loading ? (
                <SpinnerBlock />
              ) : availableNow.failed ? (
                <ErrorCard onRetry={availableNow.reload} />
              ) : railWorkers.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  {t('home.noAvailableNow')}
                </p>
              ) : (
                /* Edge-bleed horizontal rail of compact cards. */
                <ul className="-mx-4 flex gap-3 overflow-x-auto no-scrollbar px-4 pb-1">
                  {railWorkers.map((row) => (
                    <li key={row.user_id} className="shrink-0">
                      <WorkerCard
                        {...workerCardFromListRow(row)}
                        categories={categoryNamesFor(
                          row.categories,
                          categoryList,
                          locale,
                        )}
                        compact
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label={t('home.recentJobsSection')}>
              <SectionTitle>{t('home.recentJobsSection')}</SectionTitle>
              {openJobs.loading ? (
                <SpinnerBlock />
              ) : openJobs.failed ? (
                <ErrorCard onRetry={openJobs.reload} />
              ) : (openJobs.data ?? []).length === 0 ? (
                <p className="text-sm text-ink-faint">{t('home.noRecentJobs')}</p>
              ) : (
                <ul className="space-y-2">
                  {(openJobs.data ?? []).map((job) => {
                    const category = categoryBySlug.get(job.category_slug);
                    return (
                      <li key={job.id}>
                        {/* dateNeeded is OMITTED — the teaser row carries no
                            date info, so no timing chip (never a false one). */}
                        <JobCard
                          id={job.id}
                          title={job.title}
                          status={job.status}
                          categoryIcon={category?.icon}
                          categoryName={
                            category ? categoryName(category, locale) : null
                          }
                          neighborhood={neighborhoodLabel(
                            job.service_neighborhood,
                            locale,
                          )}
                          budgetCents={job.budget_cents}
                        >
                          <div className="mt-2 text-[11px] text-ink-faint">
                            {formatRelativeTime(job.created_at, locale)}
                          </div>
                        </JobCard>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}

        <TrustStrip />
      </div>
    </div>
  );
}
