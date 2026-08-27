// Namespace: home — home screen. Minimal seed; home feature agent extends.

const am = {
  greeting: 'እንኳን ደህና መጡ',
  availableNowSection: 'አሁን ዝግጁ ባለሙያዎች',
  categoriesSection: 'ምድቦች',
  searchPlaceholder: 'ምን አገልግሎት ይፈልጋሉ?',
} as const;

const en: Record<keyof typeof am, string> = {
  greeting: 'Welcome',
  availableNowSection: 'Available now',
  categoriesSection: 'Categories',
  searchPlaceholder: 'What service do you need?',
};

export const home = { am, en };
