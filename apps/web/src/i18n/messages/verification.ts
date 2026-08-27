// Namespace: verification — identity verification. Minimal seed; verification feature agent extends.

const am = {
  title: 'ማንነት ማረጋገጫ',
  getVerified: 'ማንነትዎን ያረጋግጡ',
} as const;

const en: Record<keyof typeof am, string> = {
  title: 'Identity verification',
  getVerified: 'Get verified',
};

export const verification = { am, en };
