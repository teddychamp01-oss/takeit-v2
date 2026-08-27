// Namespace: profile — Me tab + worker profile editing. Minimal seed; profile feature agent extends.

const am = {
  meTitle: 'እኔ',
  workerProfileTitle: 'የባለሙያ መገለጫዬ',
  signOut: 'ውጣ',
} as const;

const en: Record<keyof typeof am, string> = {
  meTitle: 'Me',
  workerProfileTitle: 'My worker profile',
  signOut: 'Sign out',
};

export const profile = { am, en };
