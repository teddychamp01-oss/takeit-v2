// Gate-2 proof for the BOOKINGS copy of useAsync.
//
// The load-bearing test here is "reload() keeps the previous data while the
// refetch is in flight" (A7). Before the fix, reload() bumped a nonce that
// changed the settled key, `data` went null, `loading` went true, and
// BookingPage's early-return unmounted the whole page — taking the chat
// composer (and the user's unsent draft) and the realtime WebSocket with it,
// on every state-machine tap. That test FAILS against the pre-fix hook.
//
// The two guards around it matter just as much: a CHANGE OF KEY must still
// drop the old entity's data (never show booking A's rows under booking B),
// and a failed reload must still surface `failed`.

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

describe('useAsync (bookings)', () => {
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
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('signed-in-data'));
  });

  // --- A7: stale-while-revalidate, and the boundary it must NOT cross ----

  it('reload KEEPS the previous data while revalidating (A7)', async () => {
    let attempt = 0;
    const pending = deferred<string>();
    const { result } = renderHook(() =>
      useAsync(() => {
        attempt += 1;
        return attempt === 1 ? Promise.resolve('v1') : pending.promise;
      }, 'booking:1'),
    );
    await waitFor(() => expect(result.current.data).toBe('v1'));

    act(() => result.current.reload());
    // Revalidating: loading is true AND the old row is still on screen, so
    // the page never unmounts and the chat draft survives.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe('v1');
    expect(result.current.failed).toBe(false);

    act(() => pending.resolve('v2'));
    await waitFor(() => expect(result.current.data).toBe('v2'));
    expect(result.current.loading).toBe(false);
  });

  it('changing key drops the old result and loads the new one', async () => {
    const { result, rerender } = renderHook(
      ({ k }: { k: string }) => useAsync(() => Promise.resolve(`v:${k}`), k),
      { initialProps: { k: 'a' } },
    );
    await waitFor(() => expect(result.current.data).toBe('v:a'));
    rerender({ k: 'b' });
    // NOT stale-while-revalidate: a different key is a different entity.
    // Showing booking a's data under booking b would be a correctness bug.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).toBe('v:b'));
  });

  it('disabling clears the data (no stale row for a signed-out view)', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAsync(() => Promise.resolve('secret'), 'k', enabled),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.data).toBe('secret'));
    rerender({ enabled: false });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('a failed reload reports failed and stops showing the stale row', async () => {
    let attempt = 0;
    const { result } = renderHook(() =>
      useAsync(() => {
        attempt += 1;
        return attempt === 1
          ? Promise.resolve('v1')
          : Promise.reject(new Error('gone'));
      }, 'k'),
    );
    await waitFor(() => expect(result.current.data).toBe('v1'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
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
