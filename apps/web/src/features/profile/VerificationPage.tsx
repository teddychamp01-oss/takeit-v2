// Identity verification — manual ID flow (C2) + guarantor capture + Fayda
// eSignet behind FEATURE_FAYDA_ENABLED.
//
// C2 realities this page respects:
//   * uploads go to the PRIVATE 'verifications' bucket under <uid>/…;
//     the OWNER CANNOT READ THE OBJECTS BACK (ops/admin only), so the UI
//     never renders an uploaded document — selection state only
//   * images are compressed client-side (C6) before upload
//   * explicit consent text (Proc. 1321/2024) is shown and must be ticked
//   * the verifications row is born 'pending' — the client cannot set status
//   * guarantor contacts are stored MASKED (C3; DB CHECK enforces it)

import { useState } from 'react';
import { useLocale } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { flags } from '../../lib/flags';
import { formatRelativeTime } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { SpinnerBlock } from '../../components/Spinner';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { TextArea } from '../../components/TextArea';
import { BottomSheet } from '../../components/BottomSheet';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import type { MessageKey } from '../../i18n';
import {
  addGuarantor,
  createManualVerification,
  fetchOwnGuarantors,
  fetchOwnVerifications,
  fetchOwnWorkerProfile,
  uploadVerificationImage,
} from './api';
import { compressIdImage } from './idImage';
import {
  GUARANTOR_TYPES,
  hasPendingVerification,
  latestVerification,
  maskGuarantorContact,
  validateGuarantorName,
  validateGuarantorStatement,
  validateIdImageFile,
  type IdImageKind,
} from './logic';
import { useAsync } from './useAsync';
import {
  ErrorCard,
  GuarantorStatusBadge,
  SectionTitle,
  VerificationStatusBadge,
} from './ui';
import type { GuarantorType, VerificationRow } from './types';

// ---------------------------------------------------------------------------
// Photo picker field (no preview by design — see header comment)
// ---------------------------------------------------------------------------
function PhotoField({
  label,
  capture,
  file,
  error,
  onSelect,
}: {
  label: string;
  capture?: 'user' | 'environment';
  file: File | null;
  error: MessageKey | null;
  onSelect: (file: File | null) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-ink-faint">
          {file ? `✓ ${t('verification.photoSelected')}` : '—'}
        </span>
        <label className="inline-flex min-h-touch cursor-pointer items-center rounded-xl border border-primary px-4 text-sm font-semibold text-primary-600 active:bg-primary-50">
          {file ? t('verification.changePhoto') : t('verification.choosePhoto')}
          <input
            type="file"
            accept="image/*"
            capture={capture}
            className="hidden"
            onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      {error && <p className="mt-1 text-sm text-status-disputed">{t(error)}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline entry
// ---------------------------------------------------------------------------
function TimelineEntry({ row }: { row: VerificationRow }) {
  const { locale, t } = useLocale();
  return (
    <li className="rounded-2xl bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">
          {row.method === 'manual_id'
            ? t('verification.methodManual')
            : t('verification.methodFayda')}
        </span>
        <VerificationStatusBadge status={row.status} />
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        {t('verification.submittedLabel')}:{' '}
        {formatRelativeTime(row.created_at, locale)}
        {row.decided_at && (
          <>
            {' · '}
            {t('verification.decidedLabel')}:{' '}
            {formatRelativeTime(row.decided_at, locale)}
          </>
        )}
      </p>
      {row.status === 'rejected' && row.notes && (
        <p className="mt-1 text-xs text-ink-light">
          {t('verification.rejectionNotesLabel')}: {row.notes}
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
type PhotoKindKey = 'front' | 'back' | 'selfie';
const PHOTO_TO_STORAGE_KIND: Record<PhotoKindKey, IdImageKind> = {
  front: 'id-front',
  back: 'id-back',
  selfie: 'selfie',
};

export default function VerificationPage() {
  const { t } = useLocale();
  const { user } = useSession();
  const userId = user?.id ?? '';

  const verifications = useAsync(
    () => fetchOwnVerifications(userId),
    `verif:list:${userId}`,
    !!userId,
  );
  const worker = useAsync(
    () => fetchOwnWorkerProfile(userId),
    `verif:worker:${userId}`,
    !!userId,
  );
  const guarantors = useAsync(
    () => fetchOwnGuarantors(userId),
    `verif:guarantors:${userId}`,
    !!userId,
  );

  // ---- manual-ID form state ----
  const [photos, setPhotos] = useState<Record<PhotoKindKey, File | null>>({
    front: null,
    back: null,
    selfie: null,
  });
  const [photoErrors, setPhotoErrors] = useState<
    Record<PhotoKindKey, MessageKey | null>
  >({ front: null, back: null, selfie: null });
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<{
    key: MessageKey;
    kind: 'error' | 'success';
  } | null>(null);

  const onSelectPhoto = (kind: PhotoKindKey) => (file: File | null) => {
    const error = file ? validateIdImageFile(file) : null;
    setPhotos((prev) => ({ ...prev, [kind]: error ? null : file }));
    setPhotoErrors((prev) => ({ ...prev, [kind]: error }));
    setFormMessage(null);
  };

  const onSubmitManual = async () => {
    if (!userId) return;
    if (!photos.front || !photos.back || !photos.selfie) {
      setFormMessage({ key: 'verification.allPhotosRequired', kind: 'error' });
      return;
    }
    if (!consent) {
      setFormMessage({ key: 'verification.consentRequired', kind: 'error' });
      return;
    }
    setSubmitting(true);
    setFormMessage(null);
    try {
      const compressed: Partial<Record<PhotoKindKey, Blob>> = {};
      for (const kind of ['front', 'back', 'selfie'] as const) {
        try {
          compressed[kind] = await compressIdImage(photos[kind] as File);
        } catch {
          setPhotoErrors((prev) => ({
            ...prev,
            [kind]: 'verification.processError',
          }));
          setSubmitting(false);
          return;
        }
      }
      const paths = {} as Record<PhotoKindKey, string>;
      for (const kind of ['front', 'back', 'selfie'] as const) {
        paths[kind] = await uploadVerificationImage(
          userId,
          PHOTO_TO_STORAGE_KIND[kind],
          compressed[kind] as Blob,
        );
      }
      await createManualVerification(userId, paths);
      setPhotos({ front: null, back: null, selfie: null });
      setConsent(false);
      setFormMessage({ key: 'verification.submitSuccess', kind: 'success' });
      verifications.reload();
    } catch {
      setFormMessage({ key: 'verification.submitError', kind: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Fayda ----
  const [faydaNote, setFaydaNote] = useState(false);

  // ---- guarantor form state ----
  const [sheetOpen, setSheetOpen] = useState(false);
  const [gType, setGType] = useState<GuarantorType>('idir');
  const [gName, setGName] = useState('');
  const [gContact, setGContact] = useState('');
  const [gStatement, setGStatement] = useState('');
  const [gErrors, setGErrors] = useState<{
    name: MessageKey | null;
    contact: MessageKey | null;
    statement: MessageKey | null;
    save: MessageKey | null;
  }>({ name: null, contact: null, statement: null, save: null });
  const [gSaving, setGSaving] = useState(false);

  const onSaveGuarantor = async () => {
    if (!userId) return;
    const contact = maskGuarantorContact(gContact);
    const nextErrors = {
      name: validateGuarantorName(gName),
      contact: contact.error,
      statement: validateGuarantorStatement(gStatement),
      save: null as MessageKey | null,
    };
    setGErrors(nextErrors);
    if (nextErrors.name || nextErrors.contact || nextErrors.statement) return;
    setGSaving(true);
    try {
      await addGuarantor(userId, {
        guarantor_type: gType,
        guarantor_name: gName.trim(),
        guarantor_contact_masked: contact.error === null ? contact.masked : null,
        statement: gStatement.trim() === '' ? null : gStatement.trim(),
      });
      setSheetOpen(false);
      setGName('');
      setGContact('');
      setGStatement('');
      setGType('idir');
      guarantors.reload();
    } catch {
      setGErrors((prev) => ({ ...prev, save: 'verification.guarantorSaveError' }));
    } finally {
      setGSaving(false);
    }
  };

  const rows = verifications.data ?? [];
  const pending = hasPendingVerification(rows);
  const latest = latestVerification(rows);

  return (
    <div>
      <PageHeader title={t('verification.title')} back />
      <div className="space-y-5 p-4">
        {/* ---- Current level ---- */}
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink">
              {t('verification.currentLevel')}
            </span>
            {worker.loading ? (
              <span className="text-sm text-ink-faint">{t('common.loading')}</span>
            ) : worker.failed ? (
              // Unknown ≠ unverified: on a failed query, claim nothing.
              <span className="text-sm text-ink-faint">—</span>
            ) : worker.data && worker.data.verification_level !== 'none' ? (
              <VerifiedBadge level={worker.data.verification_level} />
            ) : (
              <span className="text-sm text-ink-faint">
                {t('common.verificationNone')}
              </span>
            )}
          </div>
        </section>

        {/* ---- Status timeline ---- */}
        <section aria-label={t('verification.timelineTitle')}>
          <SectionTitle>{t('verification.timelineTitle')}</SectionTitle>
          {verifications.loading ? (
            <SpinnerBlock />
          ) : verifications.failed ? (
            <ErrorCard onRetry={verifications.reload} />
          ) : rows.length === 0 ? (
            <p className="text-sm text-ink-faint">
              {t('verification.timelineEmpty')}
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <TimelineEntry key={row.id} row={row} />
              ))}
            </ul>
          )}
        </section>

        {/* ---- Manual ID flow ---- */}
        {!verifications.loading && !verifications.failed && (
          <section aria-label={t('verification.manualTitle')}>
            <SectionTitle>{t('verification.manualTitle')}</SectionTitle>
            {pending ? (
              <p className="rounded-2xl bg-white p-4 text-sm text-ink-light shadow-sm">
                {t('verification.pendingExists')}
              </p>
            ) : (
              <div className="space-y-3">
                {latest?.status === 'rejected' && (
                  <p className="text-sm text-ink-light">
                    {t('verification.rejectedInfo')}
                  </p>
                )}
                <p className="text-sm text-ink-light">
                  {t('verification.manualIntro')}
                </p>
                <PhotoField
                  label={t('verification.idFrontLabel')}
                  capture="environment"
                  file={photos.front}
                  error={photoErrors.front}
                  onSelect={onSelectPhoto('front')}
                />
                <PhotoField
                  label={t('verification.idBackLabel')}
                  capture="environment"
                  file={photos.back}
                  error={photoErrors.back}
                  onSelect={onSelectPhoto('back')}
                />
                <PhotoField
                  label={t('verification.selfieLabel')}
                  capture="user"
                  file={photos.selfie}
                  error={photoErrors.selfie}
                  onSelect={onSelectPhoto('selfie')}
                />

                {/* Consent — Proc. 1321/2024 */}
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-ink">
                    {t('verification.consentTitle')}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-ink-light">
                    {t('verification.consentText')}
                  </p>
                  <label className="mt-3 flex min-h-touch cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => {
                        setConsent(e.target.checked);
                        setFormMessage(null);
                      }}
                      className="h-5 w-5 accent-primary"
                    />
                    <span className="text-sm font-medium text-ink">
                      {t('verification.consentCheckbox')}
                    </span>
                  </label>
                </div>

                {formMessage && (
                  <p
                    className={`text-center text-sm ${
                      formMessage.kind === 'success'
                        ? 'font-semibold text-verified'
                        : 'text-status-disputed'
                    }`}
                  >
                    {t(formMessage.key)}
                  </p>
                )}
                <Button full onClick={onSubmitManual} disabled={submitting}>
                  {submitting
                    ? t('verification.uploading')
                    : t('verification.submitVerification')}
                </Button>
              </div>
            )}
          </section>
        )}

        {/* ---- Fayda eSignet (feature-flagged) ---- */}
        <section
          aria-label={t('verification.faydaTitle')}
          className="rounded-2xl bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-ink">
              {t('verification.faydaTitle')}
            </h3>
            {!flags.faydaEnabled && (
              <Badge tone="neutral">{t('common.comingSoon')}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-light">
            {t('verification.faydaBody')}
          </p>
          {flags.faydaEnabled ? (
            <>
              <Button
                variant="secondary"
                full
                className="mt-3"
                onClick={() => setFaydaNote(true)}
              >
                {t('verification.faydaCta')}
              </Button>
              {faydaNote && (
                <p className="mt-2 text-center text-xs text-ink-faint">
                  {t('verification.faydaUnavailable')}
                </p>
              )}
            </>
          ) : (
            <Button variant="secondary" full className="mt-3" disabled>
              {t('verification.faydaCta')}
            </Button>
          )}
        </section>

        {/* ---- Guarantors ---- */}
        <section aria-label={t('verification.guarantorsTitle')}>
          <SectionTitle
            action={
              // guarantors.worker_id → worker_profiles(user_id) FK: adding is
              // only possible once a worker profile exists.
              worker.data ? (
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="min-h-touch text-sm font-semibold text-primary-600"
                >
                  {t('verification.guarantorAdd')}
                </button>
              ) : undefined
            }
          >
            {t('verification.guarantorsTitle')}
          </SectionTitle>
          <p className="mb-2 text-xs text-ink-faint">
            {t('verification.guarantorsIntro')}
            {!worker.loading && !worker.data && (
              <> {t('verification.guarantorNeedsWorker')}</>
            )}
          </p>
          {guarantors.loading ? (
            <SpinnerBlock />
          ) : guarantors.failed ? (
            <ErrorCard onRetry={guarantors.reload} />
          ) : (guarantors.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-faint">
              {t('verification.guarantorsEmpty')}
            </p>
          ) : (
            <ul className="space-y-2">
              {(guarantors.data ?? []).map((g) => {
                const typeDef = GUARANTOR_TYPES.find(
                  (item) => item.value === g.guarantor_type,
                );
                return (
                  <li key={g.id} className="rounded-2xl bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold text-ink">
                        {g.guarantor_name}
                      </span>
                      <GuarantorStatusBadge status={g.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {typeDef ? t(typeDef.labelKey) : g.guarantor_type}
                      {g.guarantor_contact_masked && (
                        <> · {g.guarantor_contact_masked}</>
                      )}
                    </p>
                    {g.statement && (
                      <p className="mt-1 text-sm text-ink-light">{g.statement}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ---- Add-guarantor sheet ---- */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('verification.guarantorAdd')}
      >
        <div className="space-y-3">
          <Select
            label={t('verification.guarantorTypeLabel')}
            value={gType}
            onChange={(e) => setGType(e.target.value as GuarantorType)}
          >
            {GUARANTOR_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {t(type.labelKey)}
              </option>
            ))}
          </Select>
          <Input
            label={t('verification.guarantorNameLabel')}
            error={gErrors.name ? t(gErrors.name) : undefined}
            value={gName}
            onChange={(e) => setGName(e.target.value)}
          />
          <Input
            label={t('verification.guarantorContactLabel')}
            hint={t('verification.contactHint')}
            error={gErrors.contact ? t(gErrors.contact) : undefined}
            inputMode="tel"
            value={gContact}
            onChange={(e) => setGContact(e.target.value)}
          />
          <TextArea
            label={t('verification.guarantorStatementLabel')}
            hint={t('verification.statementHint')}
            error={gErrors.statement ? t(gErrors.statement) : undefined}
            rows={3}
            value={gStatement}
            onChange={(e) => setGStatement(e.target.value)}
          />
          {gErrors.save && (
            <p className="text-center text-sm text-status-disputed">
              {t(gErrors.save)}
            </p>
          )}
          <Button full onClick={onSaveGuarantor} disabled={gSaving}>
            {gSaving ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
