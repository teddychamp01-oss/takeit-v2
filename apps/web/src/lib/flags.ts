// Client-side feature flags. Every flag defaults to FALSE — absent env,
// empty string, or anything other than 'true'/'1' means OFF (SPEC: payments
// and Fayda ship dark).

function readFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export const flags = {
  paymentsEnabled: readFlag(import.meta.env.VITE_FEATURE_PAYMENTS_ENABLED),
  faydaEnabled: readFlag(import.meta.env.VITE_FEATURE_FAYDA_ENABLED),
} as const;

export type FeatureFlag = keyof typeof flags;
