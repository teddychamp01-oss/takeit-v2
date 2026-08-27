// Gate-2 style proof for the fetch hook: every state (loading, data, failed,
// disabled, reload, stale-key) is DEMONSTRATED, including the failure path —
// a loading/error UI nobody has seen fire is decoration.

import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAsync } from '../useAsync';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAsync', () => {
  it('loading → data', async () => {
    const d = deferred<string>();
    const { result } = renderHook(() => useAsync(() => d.promise, 'k'));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    act(() => d.resolve('hello'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe('hello');
    expect(result.current.failed).toBe(false);
  });

  it('rejection sets failed (the error state actually fires)', async () => {
    const d = deferred<string>();
    const { result } = renderHook(() => useAsync(() => d.promise, 'k'));
    act(() => d.reject(new Error('boom')));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('enabled=false runs nothing and is not loading', () => {
    let calls = 0;
    const { result } = renderHook(() =>
      useAsync(
        () => {
          calls += 1;
          return Promise.resolve('x');
        },
        'k',
        false,
      ),
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(calls).toBe(0);
  });

  it('flipping enabled on reports loading IMMEDIATELY (no stale-empty flash)', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAsync(() => Promise.resolve('signed-in-data'), 'k', enabled),
      { initialProps: { enabled: false } },
    );
    expect(result.current.loading).toBe(false);
    rerender({ enabled: true });
    // The very first render after enabling must already say loading,
    // before any effect has had a chance to run.
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('signed-in-data'));
  });

  it('changing key drops the old result and loads the new one', async () => {
    const { result, rerender } = renderHook(
      ({ k }: { k: string }) => useAsync(() => Promise.resolve(`v:${k}`), k),
      { initialProps: { k: 'a' } },
    );
    await waitFor(() => expect(result.current.data).toBe('v:a'));
    rerender({ k: 'b' });
    expect(result.current.loading).toBe(true); // old data not shown for key b
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).toBe('v:b'));
  });

  it('reload retries after a failure', async () => {
    let attempt = 0;
    const { result } = renderHook(() =>
      useAsync(() => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error('first fails'))
          : Promise.resolve('second works');
      }, 'k'),
    );
    await waitFor(() => expect(result.current.failed).toBe(true));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe('second works'));
    expect(result.current.failed).toBe(false);
  });
});
