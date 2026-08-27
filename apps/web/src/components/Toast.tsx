// Hand-rolled toast/feedback system (v1-adoption plan T5) — no sonner, no
// radix; ~a screen of code keeps the bundle dep-lean (C6).
//
// ToastProvider renders a fixed stack ABOVE the BottomNav (safe-area aware);
// each toast auto-dismisses after TOAST_DURATION_MS and can be pressed to
// dismiss immediately. Presentational only: callers pass already-translated
// strings (e.g. t('feedback.saved')) — no business logic, no persistence.
//
// The queue step functions are exported pure so vitest can pin the behavior
// (cap, ordering, removal) without a DOM.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastVariant = 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

export const TOAST_DURATION_MS = 3500;
/** Oldest toasts drop first past this cap — the stack never buries the UI. */
export const TOAST_MAX = 3;

/** Pure queue step: append, dropping the oldest beyond `max`. */
export function pushToast(
  list: readonly ToastItem[],
  item: ToastItem,
  max: number = TOAST_MAX,
): ToastItem[] {
  const next = [...list, item];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Pure queue step: remove by id (no-op when absent). */
export function removeToast(
  list: readonly ToastItem[],
  id: number,
): ToastItem[] {
  return list.filter((toast) => toast.id !== id);
}

export type ShowToast = (message: string, variant?: ToastVariant) => void;

const ToastContext = createContext<ShowToast | null>(null);

function VariantIcon({ variant }: { variant: ToastVariant }) {
  return variant === 'success' ? (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 text-verified"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.6 6.1l-4.2 4.5a.75.75 0 01-1.1 0L4.4 8.5a.75.75 0 011.1-1l1.35 1.5 3.65-3.9a.75.75 0 111.1 1z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm-.75 3.75a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zM8 12.25a1 1 0 110-2 1 1 0 010 2z" />
    </svg>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((list) => removeToast(list, id));
  }, []);

  const show = useCallback<ShowToast>(
    (message, variant = 'success') => {
      const id = nextId.current++;
      setToasts((list) => pushToast(list, { id, message, variant }));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_DURATION_MS),
      );
    },
    [dismiss],
  );

  // Unmount: clear every pending timer (nothing may fire into a dead tree).
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 mx-auto flex w-full max-w-lg flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismiss(toast.id)}
            className={`animate-pop-in pointer-events-auto flex max-w-full items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-semibold text-white shadow-elevated ${
              toast.variant === 'error' ? 'bg-status-disputed' : 'bg-ink'
            }`}
          >
            <VariantIcon variant={toast.variant} />
            <span className="min-w-0">{toast.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Usage: `const toast = useToast(); toast(t('feedback.saved'));` */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}
