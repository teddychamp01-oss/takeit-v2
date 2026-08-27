// Namespace: reviews — double-blind reviews. Minimal seed; reviews feature agent extends.

const am = {
  title: 'ግምገማዎች',
  leaveReview: 'ግምገማ ይስጡ',
} as const;

const en: Record<keyof typeof am, string> = {
  title: 'Reviews',
  leaveReview: 'Leave a review',
};

export const reviews = { am, en };
