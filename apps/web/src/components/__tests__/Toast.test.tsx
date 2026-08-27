// Toast system (v1-adoption plan T5): pure queue steps + provider behavior
// under fake timers (auto-dismiss, press-to-dismiss, stack cap, a11y role).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  pushToast,
  removeToast,
  ToastProvider,
  TOAST_DURATION_MS,
  TOAST_MAX,
  useToast,
  type ToastItem,
  type ToastVariant,
} from '../Toast';

const item = (id: number): ToastItem => ({
  id,
  message: `m${id}`,
  variant: 'success',
});

describe('toast queue (pure)', () => {
  it('appends in order', () => {
    const list = pushToast(pushToast([], item(1)), item(2));
    expect(list.map((t) => t.id)).toEqual([1, 2]);
  });

  it('drops the OLDEST past the cap', () => {
    let list: ToastItem[] = [];
    for (let i = 1; i <= TOAST_MAX + 2; i++) list = pushToast(list, item(i));
    expect(list).toHaveLength(TOAST_MAX);
    expect(list[0].id).toBe(3); // 1 and 2 dropped
  });

  it('removes by id and no-ops on a missing id', () => {
    const list = [item(1), item(2)];
    expect(removeToast(list, 1).map((t) => t.id)).toEqual([2]);
    expect(removeToast(list, 99)).toHaveLength(2);
  });
});

function Demo({ variant = 'success' as ToastVariant }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast(`hello-${variant}`, variant)}>
      fire
    </button>
  );
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast, then auto-dismisses at TOAST_DURATION_MS (not before)', () => {
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByText('hello-success')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    });
    expect(screen.getByText('hello-success')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('hello-success')).not.toBeInTheDocument();
  });

  it('press dismisses immediately', () => {
    render(
      <ToastProvider>
        <Demo variant="error" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire'));
    fireEvent.click(screen.getByText('hello-error'));
    expect(screen.queryByText('hello-error')).not.toBeInTheDocument();
  });

  it('caps the visible stack at TOAST_MAX (oldest gone first)', () => {
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    for (let i = 0; i < TOAST_MAX + 1; i++) {
      fireEvent.click(screen.getByText('fire'));
    }
    expect(screen.getAllByText('hello-success')).toHaveLength(TOAST_MAX);
  });

  it('announces politely (role=status + aria-live)', () => {
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('useToast outside the provider throws loudly (never a silent no-op)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Demo />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
