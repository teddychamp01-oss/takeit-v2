// Me tab — profile summary, role badges, locale switcher, saved workers,
// notifications (read state), links to worker profile / verification / admin,
// sign out. Every query has loading / error / empty states; row caps are
// reported, never silent (repo law 6).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { formatRelativeTime } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { LocaleSwitcher } from '../../components/LocaleSwitcher';
import { EmptyState } from '../../components/EmptyState';
import { SpinnerBlock } from '../../components/Spinner';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { WorkerCard } from '../../components/WorkerCard';
import {
  fetchNotifications,
  fetchOwnProfile,
  fetchOwnRoles,
  fetchOwnWorkerProfile,
  fetchSavedWorkers,
  markAllNotificationsRead,
  markNotificationRead,
  signOutUser,
  unsaveWorker,
} from './api';
import { notificationLabelKey, notificationRoute } from './logic';
import { useAsync } from './useAsync';
import { ErrorCard, RowLink, SectionTitle, WorkerActivationCard } from './ui';
import type { NotificationRow, SavedWorkerRow } from './types';

function savedWorkerCardProps(row: SavedWorkerRow) {
  const wp = row.worker_profiles;
  return {
    id: wp.user_id,
    name: wp.profiles.display_name,
    avatarUrl: wp.profiles.avatar_url,
    verificationLevel: wp.verification_level,
    ratingAvg: wp.review_count > 0 ? wp.rating_avg : null,
    reviewCount: wp.review_count,
    jobsCompleted: wp.jobs_completed,
    priceMinCents: wp.price_min_cents,
    priceMaxCents: wp.price_max_cents,
    availability: wp.availability_status,
  };
}

function NotificationItem({
  row,
  onOpen,
}: {
  row: NotificationRow;
  onOpen: (row: NotificationRow) => void;
}) {
  const { locale, t } = useLocale();
  const unread = row.read_at === null;
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="flex min-h-touch w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm transition-colors active:bg-primary-50"
    >
      <span
        aria-label={unread ? t('profile.unreadLabel') : undefined}
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          unread ? 'bg-primary' : 'bg-transparent'
        }`}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm ${
            unread ? 'font-bold text-ink' : 'font-medium text-ink-light'
          }`}
        >
          {t(notificationLabelKey(row.type))}
        </span>
        <span className="block text-xs text-ink-faint">
          {formatRelativeTime(row.created_at, locale)}
        </span>
      </span>
    </button>
  );
}

export default function MePage() {
  const { t } = useLocale();
  const { user } = useSession();
  const navigate = useNavigate();
  const userId = user?.id ?? '';

  const profile = useAsync(
    () => fetchOwnProfile(userId),
    `me:profile:${userId}`,
    !!userId,
  );
  // Fail-closed by design: non-admins get zero rows from RLS; a transient
  // error also just hides the link (the /admin route re-checks server-side).
  const roles = useAsync(
    () => fetchOwnRoles(userId),
    `me:roles:${userId}`,
    !!userId,
  );
  const saved = useAsync(
    () => fetchSavedWorkers(userId),
    `me:saved:${userId}`,
    !!userId,
  );
  const notifications = useAsync(
    () => fetchNotifications(userId),
    `me:notifications:${userId}`,
    !!userId,
  );
  // Worker activation card (T9) — only fetched once the profile says the
  // user is a worker; customers never pay for this query.
  const isWorker = profile.data?.is_worker === true;
  const workerProfile = useAsync(
    () => fetchOwnWorkerProfile(userId),
    `me:worker:${userId}`,
    !!userId && isWorker,
  );

  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    setSignOutFailed(false);
    try {
      await signOutUser();
      navigate('/auth', { replace: true });
    } catch {
      setSignOutFailed(true);
      setSigningOut(false);
    }
  };

  const onOpenNotification = async (row: NotificationRow) => {
    const route = notificationRoute(row.payload);
    if (row.read_at === null) {
      try {
        await markNotificationRead(row.id);
      } catch {
        // Read-state is best-effort; navigation still proceeds.
      }
    }
    if (route) {
      navigate(route);
    } else {
      notifications.reload();
    }
  };

  const onMarkAllRead = async () => {
    try {
      await markAllNotificationsRead(userId);
    } catch {
      // Errors surface as unchanged unread state after reload.
    }
    notifications.reload();
  };

  const onUnsave = async (workerId: string) => {
    try {
      await unsaveWorker(userId, workerId);
    } catch {
      // Errors surface as the row still being present after reload.
    }
    saved.reload();
  };

  const unreadCount =
    notifications.data?.rows.filter((row) => row.read_at === null).length ?? 0;

  return (
    <div>
      <PageHeader title={t('profile.meTitle')} action={<LocaleSwitcher />} />
      <div className="space-y-5 p-4">
        {/* ---- Profile summary ---- */}
        {profile.loading ? (
          <SpinnerBlock />
        ) : profile.failed ? (
          <ErrorCard onRetry={profile.reload} />
        ) : !profile.data ? (
          <EmptyState title={t('profile.profileMissing')} />
        ) : (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              {profile.data.avatar_url ? (
                <img
                  src={profile.data.avatar_url}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-primary-700"
                >
                  {profile.data.display_name.trim().charAt(0)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-ink">
                  {profile.data.display_name}
                </h2>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {profile.data.is_customer && (
                    <Badge tone="info">{t('profile.roleCustomer')}</Badge>
                  )}
                  {profile.data.is_worker && (
                    <Badge tone="primary">{t('profile.roleWorker')}</Badge>
                  )}
                </div>
              </div>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              {profile.data.default_neighborhood && (
                <div className="flex gap-2">
                  <dt className="text-ink-faint">
                    {t('profile.neighborhoodLabel')}:
                  </dt>
                  <dd className="text-ink-light">
                    {profile.data.default_neighborhood}
                  </dd>
                </div>
              )}
              {profile.data.phone_masked && (
                <div className="flex gap-2">
                  <dt className="text-ink-faint">{t('profile.phoneLabel')}:</dt>
                  {/* Own phone — stored masked (C3); rendered as-is. */}
                  <dd className="font-medium tracking-wide text-ink-light">
                    {profile.data.phone_masked}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* ---- Worker activation (verification + completion nudge) ---- */}
        {profile.data?.is_worker &&
          (workerProfile.loading ? (
            <SpinnerBlock />
          ) : workerProfile.failed ? (
            <ErrorCard onRetry={workerProfile.reload} />
          ) : workerProfile.data ? (
            <WorkerActivationCard
              worker={workerProfile.data}
              avatarUrl={profile.data.avatar_url}
            />
          ) : null)}

        {/* ---- Navigation rows ---- */}
        {profile.data && (
          <section className="space-y-2">
            <RowLink
              to="/me/worker"
              title={
                profile.data.is_worker
                  ? t('profile.editWorkerProfile')
                  : t('profile.becomeWorker')
              }
              hint={
                profile.data.is_worker ? undefined : t('profile.becomeWorkerHint')
              }
            />
            <RowLink to="/me/verification" title={t('verification.getVerified')} />
            {(roles.data?.length ?? 0) > 0 && (
              <RowLink to="/admin" title={t('profile.adminLink')} />
            )}
          </section>
        )}

        {/* ---- Notifications ---- */}
        <section aria-label={t('profile.notificationsTitle')}>
          <SectionTitle
            action={
              unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="min-h-touch text-sm font-semibold text-primary-600"
                >
                  {t('profile.markAllRead')}
                </button>
              ) : undefined
            }
          >
            {t('profile.notificationsTitle')}
          </SectionTitle>
          {notifications.loading ? (
            <SpinnerBlock />
          ) : notifications.failed ? (
            <ErrorCard onRetry={notifications.reload} />
          ) : !notifications.data || notifications.data.rows.length === 0 ? (
            <p className="text-sm text-ink-faint">
              {t('profile.notificationsEmpty')}
            </p>
          ) : (
            <>
              {notifications.data.total != null &&
                notifications.data.total > notifications.data.rows.length && (
                  <p className="mb-2 text-xs text-ink-faint">
                    {t('profile.notificationsShowing', {
                      shown: notifications.data.rows.length,
                      total: notifications.data.total,
                    })}
                  </p>
                )}
              <ul className="space-y-2">
                {notifications.data.rows.map((row) => (
                  <li key={row.id}>
                    <NotificationItem row={row} onOpen={onOpenNotification} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ---- Saved workers ---- */}
        <section aria-label={t('profile.savedWorkersTitle')}>
          <SectionTitle>{t('profile.savedWorkersTitle')}</SectionTitle>
          {saved.loading ? (
            <SpinnerBlock />
          ) : saved.failed ? (
            <ErrorCard onRetry={saved.reload} />
          ) : !saved.data || saved.data.rows.length === 0 ? (
            <p className="text-sm text-ink-faint">
              {t('profile.savedWorkersEmpty')}
            </p>
          ) : (
            <>
              {saved.data.total != null &&
                saved.data.total > saved.data.rows.length && (
                  <p className="mb-2 text-xs text-ink-faint">
                    {t('profile.savedShowing', {
                      shown: saved.data.rows.length,
                      total: saved.data.total,
                    })}
                  </p>
                )}
              <ul className="space-y-2">
                {saved.data.rows.map((row) => (
                  <li key={row.worker_id} className="relative">
                    <WorkerCard {...savedWorkerCardProps(row)} />
                    <div className="mt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onUnsave(row.worker_id)}
                        className="min-h-touch px-2 text-xs font-semibold text-ink-faint underline"
                      >
                        {t('profile.removeSaved')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ---- Sign out ---- */}
        <section className="pt-2">
          {signOutFailed && (
            <p className="mb-2 text-center text-sm text-status-disputed">
              {t('profile.signOutError')}
            </p>
          )}
          <Button
            variant="secondary"
            full
            onClick={onSignOut}
            disabled={signingOut}
          >
            {t('profile.signOut')}
          </Button>
        </section>
      </div>
    </div>
  );
}
