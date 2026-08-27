// useInstallPrompt (N16) — tested against the exact call shape Chromium
// sends: a cancelable 'beforeinstallprompt' Event carrying prompt() +
// userChoice (Gate 4: the payload the real client sends, not an idealized
// one). Gate 2: the shape guard is demonstrated REJECTING a plain event,
// and the storage helpers are demonstrated degrading when storage throws.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  isBeforeInstallPromptEvent,
  readInstallCardDismissed,
  useInstallPrompt,
  writeInstallCardDismissed,
  type BeforeInstallPromptEvent,
} from '../useInstallPrompt';

function makeBeforeInstallPromptEvent(
  outcome: 'accepted' | 'dismissed',
): BeforeInstallPromptEvent & { prompt: ReturnType<typeof vi.fn> } {
  // Chromium fires a cancelable event named 'beforeinstallprompt' with
  // prompt() and userChoice attached — this mirrors that shape exactly.
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as unknown as BeforeInstallPromptEvent & {
    prompt: ReturnType<typeof vi.fn>;
  };
  Object.assign(event, {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });
  return event;
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('isBeforeInstallPromptEvent', () => {
  it('rejects a plain Event without prompt() — the guard can fail', () => {
    expect(isBeforeInstallPromptEvent(new Event('beforeinstallprompt'))).toBe(
      false,
    );
  });

  it('accepts the Chromium shape', () => {
    expect(
      isBeforeInstallPromptEvent(makeBeforeInstallPromptEvent('accepted')),
    ).toBe(true);
  });
});

describe('useInstallPrompt', () => {
  it('starts unable to install; prompting then is "unavailable"', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(outcome).toBe('unavailable');
  });

  it('stashes the event (preventDefault) and reports canInstall', () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = makeBeforeInstallPromptEvent('accepted');
    act(() => {
      window.dispatchEvent(event);
    });
    // preventDefault suppressed the browser mini-infobar…
    expect(event.defaultPrevented).toBe(true);
    // …and prompt() was NOT fired on load — only stashed for our moment.
    expect(event.prompt).not.toHaveBeenCalled();
    expect(result.current.canInstall).toBe(true);
  });

  it('ignores a junk event without prompt() — canInstall stays false', () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });
    expect(result.current.canInstall).toBe(false);
  });

  it('promptInstall fires the stashed prompt once and returns the choice', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = makeBeforeInstallPromptEvent('accepted');
    act(() => {
      window.dispatchEvent(event);
    });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('accepted');
    // The event is single-use: a second tap must not call prompt() again.
    expect(result.current.canInstall).toBe(false);
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('unavailable');
  });

  it('relays a dismissed choice', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(makeBeforeInstallPromptEvent('dismissed'));
    });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(outcome).toBe('dismissed');
  });

  it('clears installability on appinstalled', () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(makeBeforeInstallPromptEvent('accepted'));
    });
    expect(result.current.canInstall).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.canInstall).toBe(false);
  });
});

describe('install-card dismissal flag (UI convenience only)', () => {
  it('defaults to not-dismissed and round-trips a dismissal', () => {
    expect(readInstallCardDismissed()).toBe(false);
    writeInstallCardDismissed();
    expect(readInstallCardDismissed()).toBe(true);
  });

  it('degrades to not-dismissed when storage throws (private mode)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readInstallCardDismissed()).toBe(false);
  });

  it('write failure is silent — never an error for the user', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => writeInstallCardDismissed()).not.toThrow();
  });
});
