// Admin console — /admin, wrapped in RequireRole(['admin','ops']) by
// routes.tsx. Real authority is server-side RLS + has_role() (SPEC C8): every
// query/mutation below succeeds or fails on the server's policies, this UI
// only decides what to render.
//
// Tabs: verification queue, jobs oversight, users search, reports & disputes,
// measured metrics, audit log (admin role only — RLS).

import { useState } from 'react';
import { useT } from '../../lib/i18n';
import { useSession } from '../../hooks/useSession';
import { PageHeader } from '../../components/PageHeader';
import { SpinnerBlock } from '../../components/Spinner';
import { useAsync } from './useAsync';
import { fetchOwnRoles } from './api';
import { Chip } from './ui';
import { VerificationQueueTab } from './VerificationQueueTab';
import { JobsTab } from './JobsTab';
import { UsersTab } from './UsersTab';
import { ReportsTab } from './ReportsTab';
import { MetricsTab } from './MetricsTab';
import { AuditTab } from './AuditTab';
import type { MessageKey } from '../../i18n';

type TabId =
  | 'verifications'
  | 'jobs'
  | 'users'
  | 'reports'
  | 'metrics'
  | 'audit';

const TABS: readonly { id: TabId; label: MessageKey }[] = [
  { id: 'verifications', label: 'admin.tabVerifications' },
  { id: 'jobs', label: 'admin.tabJobs' },
  { id: 'users', label: 'admin.tabUsers' },
  { id: 'reports', label: 'admin.tabReports' },
  { id: 'metrics', label: 'admin.tabMetrics' },
  { id: 'audit', label: 'admin.tabAudit' },
];

export default function AdminPage() {
  const t = useT();
  const { user, loading: sessionLoading } = useSession();
  const uid = user?.id ?? null;
  const [tab, setTab] = useState<TabId>('verifications');

  // For gating the audit tab's explanation only — the audit_log RLS policy is
  // the actual gate. An ops user legitimately sees no user_roles rows (the
  // SELECT policy is admin-gated), which correctly yields isAdmin=false.
  const rolesQ = useAsync(
    () => fetchOwnRoles(uid ?? ''),
    `admin-roles:${uid ?? ''}`,
    !!uid,
  );
  const isAdmin = (rolesQ.data ?? []).includes('admin');

  if (sessionLoading || !uid) {
    return (
      <div>
        <PageHeader title={t('admin.title')} />
        <SpinnerBlock />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('admin.title')} />
      <div className="space-y-3 p-4 pb-8">
        <nav
          aria-label={t('admin.title')}
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {TABS.map(({ id, label }) => (
            <Chip
              key={id}
              active={tab === id}
              label={t(label)}
              onClick={() => setTab(id)}
            />
          ))}
        </nav>

        {tab === 'verifications' && <VerificationQueueTab reviewerId={uid} />}
        {tab === 'jobs' && <JobsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'reports' && <ReportsTab resolverId={uid} />}
        {tab === 'metrics' && <MetricsTab />}
        {tab === 'audit' && <AuditTab isAdmin={isAdmin} />}
      </div>
    </div>
  );
}
