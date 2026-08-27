// N17 — network-quality detection (pwa-F12 / asia-#20). Data is a household
// cost in Addis: optional niceties (route prefetch, avatar loads) must bail
// when the user asked to save data or sits on a 2G-class link.
//
// navigator.connection is Chromium-only (exactly the target fleet, C6);
// everywhere else the SAFE DEFAULT is "unconstrained" — missing signal never
// disables core UX, it only means we skip the extra caution.

export type EffectiveType = 'slow-2g' | '2g' | '3g' | '4g';

/** Structural subset of the (non-standard) NetworkInformation API. */
export interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

export interface NetQuality {
  /** User explicitly opted into data saving (Chrome Lite mode etc.). */
  saveData: boolean;
  /** Chromium's effective connection class, null when unavailable. */
  effectiveType: EffectiveType | null;
  /** True when optional/speculative traffic (prefetch, avatars) should bail. */
  constrained: boolean;
}

const EFFECTIVE_TYPES: readonly EffectiveType[] = [
  'slow-2g',
  '2g',
  '3g',
  '4g',
];

/** Pure classifier — unit-tested; getNetQuality is the thin runtime reader. */
export function classifyConnection(
  connection: ConnectionLike | undefined | null,
): NetQuality {
  const saveData = connection?.saveData === true;
  const raw = connection?.effectiveType;
  const effectiveType = EFFECTIVE_TYPES.includes(raw as EffectiveType)
    ? (raw as EffectiveType)
    : null;
  const constrained =
    saveData || effectiveType === 'slow-2g' || effectiveType === '2g';
  return { saveData, effectiveType, constrained };
}

/** Read the live connection state. Never throws; missing API → unconstrained. */
export function getNetQuality(): NetQuality {
  try {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    const connection = (
      nav as undefined | { connection?: ConnectionLike }
    )?.connection;
    return classifyConnection(connection);
  } catch {
    return classifyConnection(undefined);
  }
}
