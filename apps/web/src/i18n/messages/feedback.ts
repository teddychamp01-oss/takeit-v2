// Namespace: feedback — generic toast/confirmation strings shared by every
// flow (post-job success, accept, booking transitions, review submit…).
// Amharic (am) is the DEFAULT locale (SPEC C5). `en` is typed against `am`
// so the two catalogs can never drift apart.
//
// Flow-specific toast copy (e.g. "Marked complete. Customer to confirm.")
// belongs in that flow's own namespace; only the generics live here.

const am = {
  saved: 'ተቀምጧል',
  errorGeneric: 'አልተሳካም። እባክዎ እንደገና ይሞክሩ።',
} as const;

const en: Record<keyof typeof am, string> = {
  saved: 'Saved',
  errorGeneric: 'That did not work. Please try again.',
};

export const feedback = { am, en };
