// Placeholder stub — the admin feature agent replaces this file.
// Route is wrapped in RequireRole(['admin','ops']); real authority is
// server-side RLS + has_role() (SPEC C8).
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

export default function AdminPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('admin.title')} />
      <EmptyState title={t('admin.title')} body={t('common.comingSoon')} />
    </div>
  );
}
