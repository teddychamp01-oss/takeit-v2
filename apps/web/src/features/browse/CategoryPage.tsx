// Category — service packages + workers in the category.
//
// Location rules (repo laws): proximity is a BIAS, never a filter. The page
// works fully without GPS (verified-first list + optional user-chosen
// neighborhood filter). When the user opts into "Near me", nearby workers are
// shown first WITH the remaining workers still listed below — a worker
// outside the radius or without a stored location is never hidden. The
// nearby_workers RPC reports when its 100-row cap dropped rows and that is
// surfaced, never silent.

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { PageHeader } from '../../components/PageHeader';
import { Select } from '../../components/Select';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { SpinnerBlock } from '../../components/Spinner';
import {
  SkeletonPackageList,
  SkeletonWorkerList,
} from '../../components/Skeleton';
import { WorkerCard } from '../../components/WorkerCard';
import { Badge } from '../../components/Badge';
import {
  fetchCategory,
  fetchNearbyWorkers,
  fetchPackagesByCategory,
  fetchWorkersByCategory,
} from './api';
import {
  NEIGHBORHOODS,
  categoryName,
  splitByNearby,
  workerCardFromListRow,
  workerCardFromNearbyRow,
} from './logic';
import { useAsync } from './useAsync';
import { ErrorCard, PackageCard, SectionTitle, SignInCard } from './ui';
import type { NearbyWorkerRow } from './types';

type GeoState = 'idle' | 'asking' | 'granted' | 'denied';

export default function CategoryPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { locale, t } = useLocale();
  const { user, loading: sessionLoading } = useSession();

  const [neighborhood, setNeighborhood] = useState('');
  const [geoState, setGeoState] = useState<GeoState>('idle');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);

  const category = useAsync(() => fetchCategory(slug), `category:${slug}`, !!slug);
  const packages = useAsync(
    () => fetchPackagesByCategory(slug),
    `packages:${slug}`,
    !!slug,
  );
  const workers = useAsync(
    () => fetchWorkersByCategory(slug, neighborhood || null),
    `workers:${slug}:${neighborhood}`,
    !!slug && !!user,
  );
  const nearbyEnabled = !!slug && !!user && geoState === 'granted' && geo != null;
  const nearby = useAsync(
    () =>
      geo
        ? fetchNearbyWorkers(geo.lat, geo.lng, slug)
        : Promise.resolve<NearbyWorkerRow[]>([]),
    `nearby:${slug}:${geo?.lat}:${geo?.lng}`,
    nearbyEnabled,
  );

  const requestLocation = () => {
    if (!('geolocation' in navigator)) {
      setGeoState('denied');
      return;
    }
    setGeoState('asking');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeo({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGeoState('granted');
      },
      () => setGeoState('denied'),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const split = useMemo(
    () =>
      nearby.data && workers.data
        ? splitByNearby(nearby.data, workers.data.rows)
        : null,
    [nearby.data, workers.data],
  );

  const title = category.data
    ? categoryName(category.data, locale)
    : t('browse.title');

  if (!category.loading && !category.failed && category.data === null) {
    return (
      <div>
        <PageHeader title={t('browse.title')} back />
        <EmptyState title={t('browse.categoryNotFound')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={title} back />
      <div className="space-y-5 p-4">
        {category.failed && <ErrorCard onRetry={category.reload} />}

        {category.data && category.data.min_verification_level !== 'none' && (
          <Badge tone="success">{t('browse.requiresVerification')}</Badge>
        )}

        {/* T8 deep link: seeds PostJobPage via ?category= and skips its
            category step. Only for an ACTIVE category — the wizard's prefill
            guard (resolveCategoryPrefill) ignores inactive slugs anyway. */}
        {category.data && category.data.active && (
          <Link
            to={`/post?category=${encodeURIComponent(category.data.slug)}`}
            className="block rounded-2xl bg-primary p-4 text-white shadow-button transition-transform motion-safe:active:scale-95"
          >
            <span className="block font-bold">{t('jobs.postLikeThis')}</span>
            <span className="mt-0.5 block text-xs opacity-90">
              {t('jobs.postLikeThisBody')}
            </span>
          </Link>
        )}

        {/* Service packages — anon-readable catalog, visible to everyone */}
        <section aria-label={t('browse.packagesSection')}>
          <SectionTitle>{t('browse.packagesSection')}</SectionTitle>
          {packages.loading ? (
            /* N9: content-shaped load → package-card-shaped skeletons. */
            <SkeletonPackageList count={2} />
          ) : packages.failed ? (
            <ErrorCard onRetry={packages.reload} />
          ) : (packages.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-faint">{t('browse.noResults')}</p>
          ) : (
            <ul className="space-y-2">
              {(packages.data ?? []).map((pkg) => (
                <li key={pkg.id}>
                  <PackageCard pkg={pkg} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Workers */}
        <section aria-label={t('browse.workersSection')}>
          <SectionTitle>{t('browse.workersSection')}</SectionTitle>

          {sessionLoading ? (
            <SpinnerBlock />
          ) : !user ? (
            <SignInCard
              title={t('home.signInTitle')}
              body={t('home.signInBody')}
            />
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex-1">
                  <Select
                    aria-label={t('browse.neighborhoodLabel')}
                    value={neighborhood}
                    onChange={(event) => setNeighborhood(event.target.value)}
                  >
                    <option value="">{t('browse.neighborhoodAll')}</option>
                    {NEIGHBORHOODS.map((n) => (
                      <option key={n.value} value={n.value}>
                        {locale === 'am' ? n.am : n.en}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  variant="secondary"
                  onClick={requestLocation}
                  disabled={geoState === 'asking'}
                >
                  {geoState === 'asking'
                    ? t('browse.locationAsking')
                    : t('browse.nearMe')}
                </Button>
              </div>

              {geoState === 'denied' && (
                <p className="mb-2 text-xs text-ink-faint">
                  {t('browse.locationDenied')}
                </p>
              )}

              {workers.loading ? (
                /* N9: list load → worker-card-shaped skeletons. */
                <SkeletonWorkerList count={3} />
              ) : workers.failed ? (
                <ErrorCard onRetry={workers.reload} />
              ) : !workers.data || workers.data.rows.length === 0 ? (
                <EmptyState
                  title={
                    neighborhood
                      ? t('browse.noWorkersInNeighborhood')
                      : t('browse.noWorkersInCategory')
                  }
                  action={
                    neighborhood ? (
                      <Button
                        variant="secondary"
                        onClick={() => setNeighborhood('')}
                      >
                        {t('browse.clearFilter')}
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  {workers.data.total != null &&
                    workers.data.total > workers.data.rows.length && (
                      <p className="mb-2 text-xs text-ink-faint">
                        {t('browse.showingWorkers', {
                          shown: workers.data.rows.length,
                          total: workers.data.total,
                        })}
                      </p>
                    )}

                  {/* N9: the nearby overlay is a list load too. */}
                  {nearbyEnabled && nearby.loading && (
                    <div className="mb-2">
                      <SkeletonWorkerList count={2} />
                    </div>
                  )}
                  {nearbyEnabled && nearby.failed && (
                    <div className="mb-2">
                      <ErrorCard onRetry={nearby.reload} />
                    </div>
                  )}

                  {split && !nearby.loading ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="mb-2 text-sm font-bold text-ink">
                          {t('browse.nearYouSection')}
                        </h3>
                        {split.near.length === 0 ? (
                          <p className="text-sm text-ink-faint">
                            {t('browse.nearbyEmpty')}
                          </p>
                        ) : (
                          <>
                            {split.near.some((row) => row.truncated) && (
                              <p className="mb-2 text-xs text-ink-faint">
                                {t('browse.nearbyTruncated')}
                              </p>
                            )}
                            <ul className="space-y-2">
                              {split.near.map((row) => (
                                <li key={row.worker_id}>
                                  <WorkerCard
                                    {...workerCardFromNearbyRow(row)}
                                  />
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                      {split.rest.length > 0 && (
                        <div>
                          <h3 className="mb-2 text-sm font-bold text-ink">
                            {t('browse.fartherSection')}
                          </h3>
                          <ul className="space-y-2">
                            {split.rest.map((row) => (
                              <li key={row.user_id}>
                                <WorkerCard {...workerCardFromListRow(row)} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {workers.data.rows.map((row) => (
                        <li key={row.user_id}>
                          <WorkerCard {...workerCardFromListRow(row)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
