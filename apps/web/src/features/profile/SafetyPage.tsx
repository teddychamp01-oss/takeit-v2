// N13 — static Safety screen under /me/safety (us-D2 Care.com pattern:
// honest limits + mirror-image tips for both sides; asia-#7: worker safety
// as product). Pure i18n content, no backend reads/writes. The report path
// describes only what exists today (booking page → "Report a problem"
// dispute flow + the Telegram support link); the emergency-numbers row is
// deliberately ABSENT — the numbers are not ops-verified (plan N13 gate).

import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { SupportLink } from '../../components/SupportLink';

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0 text-primary-600"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l8 3v6c0 4.6-3.1 8-8 9-4.9-1-8-4.4-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function CheckDot() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="mt-0.5 h-4 w-4 shrink-0 text-primary-600"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

function TipsCard({ heading, tips }: { heading: string; tips: string[] }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-ink">{heading}</h2>
      <ul className="mt-3 space-y-2.5">
        {tips.map((tip) => (
          <li key={tip} className="flex items-start gap-2">
            <CheckDot />
            <span className="text-sm leading-relaxed text-ink-light">{tip}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function SafetyPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('safety.title')} back />
      <div className="space-y-5 p-4">
        {/* Honest limits FIRST (us-D2): verification ≠ meeting in person. */}
        <div className="flex items-start gap-3 rounded-2xl bg-primary-50 p-4">
          <ShieldIcon />
          <p className="text-sm leading-relaxed text-ink">{t('safety.intro')}</p>
        </div>

        <TipsCard
          heading={t('safety.customerHeading')}
          tips={[
            t('safety.customerTip1'),
            t('safety.customerTip2'),
            t('safety.customerTip3'),
            t('safety.customerTip4'),
            t('safety.customerTip5'),
          ]}
        />

        <TipsCard
          heading={t('safety.workerHeading')}
          tips={[
            t('safety.workerTip1'),
            t('safety.workerTip2'),
            t('safety.workerTip3'),
            t('safety.workerTip4'),
            t('safety.workerTip5'),
          ]}
        />

        {/* The report path — only what actually exists (Gate 3). */}
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-ink">
            {t('safety.reportHeading')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-light">
            {t('safety.reportBody')}
          </p>
        </section>

        {/* A human on Telegram (N12) — renders nothing when unconfigured. */}
        <SupportLink />
      </div>
    </div>
  );
}
