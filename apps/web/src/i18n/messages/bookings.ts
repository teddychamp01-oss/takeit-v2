// Namespace: bookings — inbox + booking detail. Minimal seed; bookings feature agent extends.

const am = {
  inboxTitle: 'መልዕክቶች',
  bookingTitle: 'ማስያዣ',
} as const;

const en: Record<keyof typeof am, string> = {
  inboxTitle: 'Inbox',
  bookingTitle: 'Booking',
};

export const bookings = { am, en };
