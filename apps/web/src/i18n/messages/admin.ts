// Namespace: admin — ops/admin console. Minimal seed; admin feature agent extends.

const am = {
  title: 'አስተዳደር',
  accessDenied: 'ይህን ገጽ ለማየት ፈቃድ የለዎትም',
} as const;

const en: Record<keyof typeof am, string> = {
  title: 'Admin',
  accessDenied: 'You do not have permission to view this page',
};

export const admin = { am, en };
