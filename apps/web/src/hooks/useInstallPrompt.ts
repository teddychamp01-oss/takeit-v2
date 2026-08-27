// N16 — PWA install prompt (pwa-F5): capture `beforeinstallprompt`
// (preventDefault + stash), then fire the browser prompt at OUR moment —
// from a card the user taps — never on page load. Chromium-on-Android is
// exactly the target; on browsers that never fire the event `canInstall`
// simply stays false and no install UI appears.
//
// The install-card dismissal flag is UI convenience state ONLY (the SPEC's
// "no localStorage business logic" rule allows preference/convenience
// flags — same pattern as the persisted locale). Storage being unavailable
// degrades to "not dismissed"; nothing depends on it.

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The non-standard Chromium event. Not in TS DOM lib — typed by shape.
 * `prompt()` may be called at most ONCE per event.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

/** Shape guard — anything without a callable prompt() is not usable. */
export function isBeforeInstallPromptEvent(
  event: Event,
): event is BeforeInstallPromptEvent {
  return typeof (event as BeforeInstallPromptEvent).prompt === 'function';
}

const DISMISS_KEY = 'takeit.installCardDismissed';

/** True when the user dismissed the install card on this device. */
export function readInstallCardDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false; // private mode / blocked storage — show the card again
  }
}

/** Persist the dismissal (best-effort; failure is silent by design). */
export function writeInstallCardDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // The card will reappear next session — a nuisance, never an error.
  }
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export function useInstallPrompt(): {
  /** True once the browser offered installability and we stashed the event. */
  canInstall: boolean;
  /** Fire the native prompt. Resolves with the user's choice. */
  promptInstall: () => Promise<InstallOutcome>;
} {
  const stashed = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      if (!isBeforeInstallPromptEvent(event)) return;
      // Stop the browser mini-infobar; we re-offer from our own card.
      event.preventDefault();
      stashed.current = event;
      setCanInstall(true);
    };
    const onAppInstalled = () => {
      stashed.current = null;
      setCanInstall(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const event = stashed.current;
    if (!event) return 'unavailable';
    // A stashed event is single-use: clear it before prompting so a second
    // tap can never call prompt() twice on the same event.
    stashed.current = null;
    setCanInstall(false);
    try {
      await event.prompt();
      return (await event.userChoice).outcome;
    } catch {
      return 'unavailable';
    }
  }, []);

  return { canInstall, promptInstall };
}
