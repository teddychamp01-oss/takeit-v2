// Namespace: chat — job-scoped messaging. Minimal seed; chat feature agent extends.
// phoneWarning backs the anti-disintermediation soft-warn (SPEC C3).

const am = {
  title: 'ውይይት',
  inputPlaceholder: 'መልዕክት ይጻፉ…',
  phoneWarning: 'ማስያዣ ከመረጋገጡ በፊት ስልክ ቁጥር ማጋራት አይመከርም።',
} as const;

const en: Record<keyof typeof am, string> = {
  title: 'Chat',
  inputPlaceholder: 'Write a message…',
  phoneWarning:
    'Sharing phone numbers before a booking is confirmed is not recommended.',
};

export const chat = { am, en };
