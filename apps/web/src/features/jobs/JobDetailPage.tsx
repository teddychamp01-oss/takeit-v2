// Job detail — one route, two roles:
//   * customer (poster): applications list → accept via rpc_accept_application
//     → navigate to the created booking
//   * worker: apply via rpc_apply_to_job (message + committed window)
// C3 everywhere: the diaspora contact renders through MaskedPhone (the stored
// value is ALREADY masked by rpc_post_job); application text is re-masked
// client-side before display because the server stores it raw pre-booking.
//
// NOTE deliberately absent: "withdraw application". The audited schema has no
// rpc_withdraw_application and RLS grants workers no UPDATE on applications —
// a button here would always fail. Reported upstream instead of faked.

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { formatETB, formatRelativeTime } from '../../lib/format';
import { containsPhoneNumber } from '../../lib/phone';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { EmptyState } from '../../components/EmptyState';
import { Spinner, SpinnerBlock } from '../../components/Spinner';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { TextArea } from '../../components/TextArea';
import { BottomSheet } from '../../components/BottomSheet';
import { MaskedPhone } from '../../components/MaskedPhone';
import { RatingStars } from '../../components/RatingStars';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import type { MessageKey } from '../../i18n';
import {
  APPLICATION_STATUS_DEF,
  APPLY_MESSAGE_MAX,
  TIME_WINDOW_MAX,
  buildAcceptArgs,
  buildApplyArgs,
  centsToBirrInput,
  extractEmbedded,
  formatDateNeeded,
  getErrorMessage,
  maskPhonesInText,
  parseEtbToCents,
  rpcErrorKey,
  validateApplyForm,
  type ApplicationStatus,
  type ApplyFormErrors,
} from './logic';
import {
  acceptApplication,
  applyToJob,
  fetchActiveCategories,
  fetchJob,
  fetchJobApplications,
  fetchMyApplication,
  type ApplicationRow,
  type CategoryRow,
  type JobDetailRow,
  type ListPage,
  type MyApplicationRow,
} from './api';

type JobState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'notfound' }
  | { status: 'ready'; job: JobDetailRow };

type AppsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; page: ListPage<ApplicationRow> };

type MyAppState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; application: MyApplicationRow | null };

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { user } = useSession();
  const navigate = useNavigate();
  const toast = useToast();

  const [jobState, setJobState] = useState<JobState>({ status: 'loading' });
  const [jobReload, setJobReload] = useState(0);
  const [categories, setCategories] = useState<Map<string, CategoryRow>>(
    () => new Map(),
  );

  // Customer side
  const [appsState, setAppsState] = useState<AppsState>({ status: 'idle' });
  const [appsReload, setAppsReload] = useState(0);
  const [acceptTarget, setAcceptTarget] = useState<ApplicationRow | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [priceErrorKey, setPriceErrorKey] = useState<MessageKey | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Worker side
  const [myAppState, setMyAppState] = useState<MyAppState>({ status: 'idle' });
  const [applyMessage, setApplyMessage] = useState('');
  const [applyWindow, setApplyWindow] = useState('');
  const [applyErrors, setApplyErrors] = useState<ApplyFormErrors>({});
  const [applyErrorKey, setApplyErrorKey] = useState<MessageKey | null>(null);
  const [applying, setApplying] = useState(false);

  const job = jobState.status === 'ready' ? jobState.job : null;
  const isCustomer = !!(job && user && job.customer_id === user.id);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setJobState({ status: 'loading' });
    fetchJob(id)
      .then((row) => {
        if (cancelled) return;
        setJobState(row ? { status: 'ready', job: row } : { status: 'notfound' });
      })
      .catch(() => {
        if (!cancelled) setJobState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [id, jobReload]);

  useEffect(() => {
    let cancelled = false;
    fetchActiveCategories()
      .then((rows) => {
        if (!cancelled) setCategories(new Map(rows.map((c) => [c.slug, c])));
      })
      .catch(() => {
        // Non-fatal — the slug renders as fallback.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Customer: load the applications on this job.
  useEffect(() => {
    if (!job || !isCustomer) return;
    let cancelled = false;
    setAppsState({ status: 'loading' });
    fetchJobApplications(job.id)
      .then((page) => {
        if (!cancelled) setAppsState({ status: 'ready', page });
      })
      .catch(() => {
        if (!cancelled) setAppsState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [job, isCustomer, appsReload]);

  // Worker: do I already have an application here?
  useEffect(() => {
    if (!job || isCustomer || !user) return;
    let cancelled = false;
    setMyAppState({ status: 'loading' });
    fetchMyApplication(job.id, user.id)
      .then((application) => {
        if (!cancelled) setMyAppState({ status: 'ready', application });
      })
      .catch(() => {
        if (!cancelled) setMyAppState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [job, isCustomer, user]);

  const openAcceptSheet = (application: ApplicationRow) => {
    setAcceptTarget(application);
    setPriceInput(centsToBirrInput(job?.budget_cents ?? null));
    setPriceErrorKey(null);
  };

  const confirmAccept = async () => {
    if (!acceptTarget) return;
    const parsed = parseEtbToCents(priceInput);
    if (!parsed.ok) {
      setPriceErrorKey(parsed.errorKey);
      return;
    }
    if (parsed.cents == null && job?.budget_cents == null) {
      // rpc_accept_application requires a price when the job has no budget
      setPriceErrorKey('jobs.errorPriceRequired');
      return;
    }
    setAccepting(true);
    setPriceErrorKey(null);
    try {
      const result = await acceptApplication(
        buildAcceptArgs(acceptTarget.id, parsed.cents),
      );
      // The provider lives in AppShell, so the toast survives the navigation.
      toast(t('jobs.acceptedToast'));
      navigate(`/bookings/${result.booking_id}`);
    } catch (e) {
      setPriceErrorKey(rpcErrorKey(getErrorMessage(e)));
      setAccepting(false);
    }
  };

  const submitApplication = async () => {
    if (!job) return;
    const errors = validateApplyForm(applyMessage, applyWindow);
    if (Object.keys(errors).length > 0) {
      setApplyErrors(errors);
      return;
    }
    setApplying(true);
    setApplyErrors({});
    setApplyErrorKey(null);
    try {
      const result = await applyToJob(
        buildApplyArgs(job.id, applyMessage, applyWindow),
      );
      setMyAppState({
        status: 'ready',
        application: {
          id: result.application_id,
          status: 'pending',
          message: applyMessage.trim() || null,
          committed_window: applyWindow.trim() || null,
          created_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      setApplyErrorKey(rpcErrorKey(getErrorMessage(e)));
    } finally {
      setApplying(false);
    }
  };

  const categoryLabel = (slug: string): string => {
    const c = categories.get(slug);
    if (!c) return slug;
    const name = locale === 'am' ? c.name_am : c.name_en;
    return c.icon ? `${c.icon} ${name}` : name;
  };

  if (jobState.status === 'loading') {
    return (
      <div>
        <PageHeader title={t('jobs.detailTitle')} back />
        <SpinnerBlock />
      </div>
    );
  }

  if (jobState.status === 'error') {
    return (
      <div>
        <PageHeader title={t('jobs.detailTitle')} back />
        <EmptyState
          title={t('jobs.loadFailed')}
          action={
            <Button variant="secondary" onClick={() => setJobReload((n) => n + 1)}>
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  if (jobState.status === 'notfound' || !job) {
    return (
      <div>
        <PageHeader title={t('jobs.detailTitle')} back />
        <EmptyState
          title={t('jobs.notFoundTitle')}
          body={t('jobs.notFoundBody')}
        />
      </div>
    );
  }

  const when = [
    job.date_needed ? formatDateNeeded(job.date_needed, locale) : '',
    job.time_window ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
  const where = [
    job.service_address_text,
    job.service_landmark,
    job.service_neighborhood,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <PageHeader title={t('jobs.detailTitle')} back />

      <div className="space-y-4 px-4 py-4">
        {/* Job summary */}
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 flex-1 text-lg font-bold text-ink">
              {job.title}
            </h2>
            <StatusBadge kind="job" status={job.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
            <span>{categoryLabel(job.category_slug)}</span>
            {job.is_diaspora && (
              <span className="rounded-full bg-primary-100 px-2 py-0.5 font-medium text-primary-700">
                {t('jobs.diasporaBadge')}
              </span>
            )}
            <span>
              {t('jobs.postedAgo', {
                ago: formatRelativeTime(job.created_at, locale),
              })}
            </span>
          </div>

          {job.description && (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-ink-light">
              {job.description}
            </p>
          )}

          <dl className="mt-3 space-y-2 text-sm">
            {where && (
              <InfoRow label={t('jobs.jobInfoWhere')}>{where}</InfoRow>
            )}
            {when && <InfoRow label={t('jobs.jobInfoWhen')}>{when}</InfoRow>}
            <InfoRow label={t('jobs.reviewBudget')}>
              {job.budget_cents != null
                ? formatETB(job.budget_cents)
                : t('jobs.reviewNotSet')}
            </InfoRow>
            <InfoRow label={t('jobs.reviewWorkers')}>
              {t('jobs.workersCount', { count: job.workers_needed })}
            </InfoRow>
            {job.is_diaspora && job.local_contact_name && (
              <InfoRow label={t('jobs.localContact')}>
                <span className="block">{job.local_contact_name}</span>
                {job.local_contact_phone_masked && (
                  <MaskedPhone
                    masked={job.local_contact_phone_masked}
                    bookingConfirmed={false}
                  />
                )}
              </InfoRow>
            )}
          </dl>
        </section>

        {isCustomer ? (
          <CustomerApplications
            job={job}
            appsState={appsState}
            onRetry={() => setAppsReload((n) => n + 1)}
            onAccept={openAcceptSheet}
          />
        ) : (
          <WorkerApplyPanel
            job={job}
            myAppState={myAppState}
            applyMessage={applyMessage}
            applyWindow={applyWindow}
            applyErrors={applyErrors}
            applyErrorKey={applyErrorKey}
            applying={applying}
            onMessage={(v) => {
              setApplyMessage(v);
              setApplyErrors((e) => ({ ...e, message: undefined }));
            }}
            onWindow={(v) => {
              setApplyWindow(v);
              setApplyErrors((e) => ({ ...e, committedWindow: undefined }));
            }}
            onSubmit={submitApplication}
          />
        )}
      </div>

      {/* Accept sheet (customer) */}
      <BottomSheet
        open={acceptTarget !== null}
        onClose={() => {
          if (!accepting) setAcceptTarget(null);
        }}
        title={t('jobs.acceptSheetTitle')}
      >
        <div className="space-y-4">
          <Input
            label={t('jobs.agreedPriceLabel')}
            value={priceInput}
            onChange={(e) => {
              setPriceInput(e.target.value);
              setPriceErrorKey(null);
            }}
            inputMode="decimal"
            hint={t('jobs.agreedPriceHint')}
            error={priceErrorKey ? t(priceErrorKey) : undefined}
          />
          <Button full onClick={confirmAccept} disabled={accepting}>
            {accepting ? (
              <>
                <Spinner className="h-4 w-4 text-white" />
                {t('jobs.accepting')}
              </>
            ) : (
              t('jobs.confirmAccept')
            )}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-xs font-medium uppercase text-ink-faint">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-words text-ink">{children}</dd>
    </div>
  );
}

function ApplicationStatusPill({ status }: { status: ApplicationStatus }) {
  const { t } = useLocale();
  const def = APPLICATION_STATUS_DEF[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${def.cls}`}
    >
      {t(def.key)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Customer view: applications list + accept
// ---------------------------------------------------------------------------
function CustomerApplications({
  job,
  appsState,
  onRetry,
  onAccept,
}: {
  job: JobDetailRow;
  appsState: AppsState;
  onRetry: () => void;
  onAccept: (application: ApplicationRow) => void;
}) {
  const { t } = useLocale();
  const canAccept = job.status === 'open' || job.status === 'matched';

  return (
    <section>
      <h3 className="mb-2 text-base font-bold text-ink">
        {t('jobs.applicationsTitle')}
      </h3>
      {appsState.status === 'loading' || appsState.status === 'idle' ? (
        <SpinnerBlock />
      ) : appsState.status === 'error' ? (
        <EmptyState
          title={t('jobs.loadFailed')}
          action={
            <Button variant="secondary" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : appsState.page.rows.length === 0 ? (
        <EmptyState
          title={t('jobs.noApplicationsTitle')}
          body={t('jobs.noApplicationsBody')}
        />
      ) : (
        <ul className="space-y-3">
          {appsState.page.rows.map((application) => (
            <li key={application.id}>
              <ApplicationCard
                application={application}
                canAccept={canAccept && application.status === 'pending'}
                onAccept={() => onAccept(application)}
              />
            </li>
          ))}
          {appsState.page.total > appsState.page.rows.length && (
            <li className="pt-1 text-center text-xs text-ink-faint">
              {t('jobs.truncatedNote', {
                shown: appsState.page.rows.length,
                total: appsState.page.total,
              })}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function ApplicationCard({
  application,
  canAccept,
  onAccept,
}: {
  application: ApplicationRow;
  canAccept: boolean;
  onAccept: () => void;
}) {
  const { t, locale } = useLocale();
  const worker = extractEmbedded(application.worker);
  const workerProfile = worker ? extractEmbedded(worker.worker_profiles) : null;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/workers/${application.worker_id}`}
          className="min-w-0 flex-1"
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold text-ink">
              {worker?.display_name || t('jobs.unknownWorker')}
            </span>
            {workerProfile && (
              <VerifiedBadge
                level={workerProfile.verification_level}
                showLabel={false}
              />
            )}
          </span>
          {workerProfile && (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <RatingStars
                value={
                  workerProfile.review_count > 0
                    ? Number(workerProfile.rating_avg)
                    : null
                }
                count={workerProfile.review_count}
              />
              <span className="text-xs text-ink-faint">
                {t('common.jobsCountShort', {
                  count: workerProfile.jobs_completed,
                })}
              </span>
            </span>
          )}
        </Link>
        <ApplicationStatusPill status={application.status} />
      </div>

      {application.message && (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-light">
          {/* C3: stored raw server-side pre-booking — mask on display */}
          {maskPhonesInText(application.message)}
        </p>
      )}
      {application.committed_window && (
        <p className="mt-1 text-xs text-ink-faint">
          {t('jobs.committedWindowLabel')}:{' '}
          {maskPhonesInText(application.committed_window)}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-ink-faint">
          {formatRelativeTime(application.created_at, locale)}
        </span>
        {canAccept && (
          <Button onClick={onAccept}>{t('jobs.accept')}</Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Worker view: my application / apply form
// ---------------------------------------------------------------------------
function WorkerApplyPanel({
  job,
  myAppState,
  applyMessage,
  applyWindow,
  applyErrors,
  applyErrorKey,
  applying,
  onMessage,
  onWindow,
  onSubmit,
}: {
  job: JobDetailRow;
  myAppState: MyAppState;
  applyMessage: string;
  applyWindow: string;
  applyErrors: ApplyFormErrors;
  applyErrorKey: MessageKey | null;
  applying: boolean;
  onMessage: (value: string) => void;
  onWindow: (value: string) => void;
  onSubmit: () => void;
}) {
  const { t, locale } = useLocale();

  if (myAppState.status === 'loading' || myAppState.status === 'idle') {
    return <SpinnerBlock />;
  }
  if (myAppState.status === 'error') {
    return <EmptyState title={t('jobs.loadFailed')} body={t('common.retry')} />;
  }

  const mine = myAppState.application;
  if (mine) {
    return (
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-ink">
            {t('jobs.myApplication')}
          </h3>
          <ApplicationStatusPill status={mine.status} />
        </div>
        {mine.message && (
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-light">
            {mine.message}
          </p>
        )}
        {mine.committed_window && (
          <p className="mt-1 text-xs text-ink-faint">
            {t('jobs.committedWindowLabel')}: {mine.committed_window}
          </p>
        )}
        <p className="mt-3 text-sm text-verified">
          {mine.status === 'pending'
            ? t('jobs.appliedBody')
            : formatRelativeTime(mine.created_at, locale)}
        </p>
      </section>
    );
  }

  if (job.status !== 'open') {
    return (
      <p className="rounded-2xl bg-white p-4 text-center text-sm text-ink-faint shadow-sm">
        {t('jobs.jobClosedForApplications')}
      </p>
    );
  }

  const phoneWarn =
    containsPhoneNumber(applyMessage) || containsPhoneNumber(applyWindow);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-base font-bold text-ink">
        {t('jobs.applyTitle')}
      </h3>
      <div className="space-y-4">
        <TextArea
          label={t('jobs.applyMessageLabel')}
          value={applyMessage}
          onChange={(e) => onMessage(e.target.value)}
          placeholder={t('jobs.applyMessagePlaceholder')}
          maxLength={APPLY_MESSAGE_MAX}
          error={applyErrors.message ? t(applyErrors.message) : undefined}
        />
        <Input
          label={`${t('jobs.applyWindowLabel')} (${t('common.optional')})`}
          value={applyWindow}
          onChange={(e) => onWindow(e.target.value)}
          placeholder={t('jobs.timeWindowPlaceholder')}
          maxLength={TIME_WINDOW_MAX}
          error={
            applyErrors.committedWindow
              ? t(applyErrors.committedWindow)
              : undefined
          }
        />
        {phoneWarn && (
          <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-700">
            {t('jobs.phoneSoftWarn')}
          </p>
        )}
        {applyErrorKey && (
          <p className="rounded-xl bg-status-disputed/10 p-3 text-sm font-medium text-status-disputed">
            {t(applyErrorKey)}
          </p>
        )}
        <Button full onClick={onSubmit} disabled={applying}>
          {applying ? (
            <>
              <Spinner className="h-4 w-4 text-white" />
              {t('jobs.applying')}
            </>
          ) : (
            t('jobs.applySubmit')
          )}
        </Button>
      </div>
    </section>
  );
}
