import { useEffect, type ReactNode } from 'react';
import { useT } from '../lib/i18n';

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-ink/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/10" aria-hidden="true" />
        {title && <h2 className="mb-3 text-lg font-bold text-ink">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
