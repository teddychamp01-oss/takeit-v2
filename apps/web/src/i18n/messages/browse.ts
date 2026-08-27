// Namespace: browse — worker discovery. Minimal seed; browse feature agent extends.

const am = {
  title: 'አስስ',
  searchPlaceholder: 'ባለሙያ ይፈልጉ…',
  noResults: 'ምንም አልተገኘም',
  workerTitle: 'የባለሙያ መገለጫ',
} as const;

const en: Record<keyof typeof am, string> = {
  title: 'Browse',
  searchPlaceholder: 'Search for a worker…',
  noResults: 'No results found',
  workerTitle: 'Worker profile',
};

export const browse = { am, en };
