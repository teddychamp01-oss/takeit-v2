// Placeholder stub — the browse feature agent replaces this file.
import { useParams } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

export default function CategoryPage() {
  const t = useT();
  const { slug } = useParams<{ slug: string }>();
  return (
    <div>
      <PageHeader title={slug ?? t('browse.title')} back />
      <EmptyState title={t('browse.title')} body={t('common.comingSoon')} />
    </div>
  );
}
