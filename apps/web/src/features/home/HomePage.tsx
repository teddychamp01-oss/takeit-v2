// Home — greeting, 8-category grid, 'Available Now' (green dot) section,
// recent open jobs teaser, trust strip.
//
// RLS reality: the catalog (categories) is anon-readable; worker profiles and
// jobs require a signed-in user, so signed-out visitors get the grid + trust
// strip + a sign-in card instead of half-broken queries.
//
// Ordering law: 'Available Now' is most-verified first with a STABLE user_id
// tiebreak — geography (or anything else) is never decided by the alphabet.

import { Link, useNavigate } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { formatETB, formatRelativeTime } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { LocaleSwitcher } from '../../components/LocaleSwitcher';
import { SpinnerBlock } from '../../components/Spinner';
import { WorkerCard } from '../../components/WorkerCard';
import { StatusBadge } from '../../components/StatusBadge';
import {
  fetchAvailableNowWorkers,
  fetchCategories,
  fetchOpenJobsTeaser,
} from '../browse/api';
import { neighborhoodLabel, workerCardFromListRow } from '../browse/logic';
import { useAsync } from '../browse/useAsync';
import {
  CategoryGrid,
  ErrorCard,
  SectionTitle,
  SignInCard,
} from '../browse/ui';
import { GREETING_KEY, greetingSlot } from './logic';
import type { MessageKey } from '../../i18n';

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

  return (
    <div>
      <PageHeader title={t('common.appName')} action={<LocaleSwitcher />} />
      <div className="space-y-5 p-4">
        <div>
          <h2 className="text-xl font-bold text-ink">
            {t(GREETING_KEY[greetingSlot(new Date().getHours())])}
          </h2>
          <p className="text-sm text-ink-light">{t('common.tagline')}</p>
        </div>

        {/* Search entry — navigates to Browse where the real search lives */}
        <button
          type="button"
          onClick={() => navigate('/browse')}
          className="flex w-full min-h-touch items-center gap-2 rounded-xl border border-ink/15 bg-white px-4 text-left text-base text-ink-faint"
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

        <section aria-label={t('home.categoriesSection')}>
          <SectionTitle>{t('home.categoriesSection')}</SectionTitle>
          {categories.loading ? (
            <SpinnerBlock />
          ) : categories.failed ? (
            <ErrorCard onRetry={categories.reload} />
          ) : (
            <CategoryGrid categories={categories.data ?? []} />
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
              ) : (availableNow.data ?? []).length === 0 ? (
                <p className="text-sm text-ink-faint">
                  {t('home.noAvailableNow')}
                </p>
              ) : (
                <ul className="space-y-2">
                  {(availableNow.data ?? []).map((row) => (
                    <li key={row.user_id}>
                      <WorkerCard {...workerCardFromListRow(row)} />
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
                  {(openJobs.data ?? []).map((job) => (
                    <li key={job.id}>
                      <Link
                        to={`/jobs/${job.id}`}
                        className="block rounded-2xl bg-white p-4 shadow-sm transition-colors active:bg-primary-50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                            {job.title}
                          </span>
                          <StatusBadge kind="job" status={job.status} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-faint">
                          {job.service_neighborhood && (
                            <span>
                              {neighborhoodLabel(
                                job.service_neighborhood,
                                locale,
                              )}
                            </span>
                          )}
                          {job.budget_cents != null && (
                            <span className="font-medium text-ink-light">
                              {formatETB(job.budget_cents)}
                            </span>
                          )}
                          <span>
                            {formatRelativeTime(job.created_at, locale)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
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
