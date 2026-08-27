// Namespace: chat — booking-scoped realtime messaging.
// phoneWarning backs the anti-disintermediation soft-warn (SPEC C3): shown
// client-side while a draft looks like it contains a phone number and the
// booking is not yet customer_confirmed. maskedNotice is shown AFTER the
// server actually masked a sent message (rpc_send_message phone_masked=true).

const am = {
  title: 'ውይይት',
  inputPlaceholder: 'መልዕክት ይጻፉ…',
  phoneWarning: 'ማስያዣ ከመረጋገጡ በፊት ስልክ ቁጥር ማጋራት አይመከርም።',
  emptyTitle: 'እስካሁን መልዕክት የለም',
  emptyBody: 'ሰላም ይበሉ 👋',
  closed: 'ማስያዣው ስለተሰረዘ ውይይቱ ተዘግቷል።',
  maskedNotice: 'መልዕክትዎ ስልክ ቁጥር ስለያዘ ቁጥሩ በስርዓቱ ተሸፍኗል።',
  sendFailed: 'መልዕክቱ አልተላከም። እባክዎ እንደገና ይሞክሩ።',
  loadFailed: 'መልዕክቶችን መጫን አልተሳካም።',
  showingRecent: 'የቅርብ ጊዜዎቹ {count} መልዕክቶች ብቻ እየታዩ ነው።',
  errorMessageLength: 'መልዕክት ከ1 እስከ 2000 ፊደላት መሆን አለበት።',
  errorClosed: 'ይህ ውይይት ተዘግቷል።',
} as const;

const en: Record<keyof typeof am, string> = {
  title: 'Chat',
  inputPlaceholder: 'Write a message…',
  phoneWarning:
    'Sharing phone numbers before a booking is confirmed is not recommended.',
  emptyTitle: 'No messages yet',
  emptyBody: 'Say hi 👋',
  closed: 'This chat is closed because the booking was cancelled.',
  maskedNotice:
    'Your message contained a phone number, so the number was masked.',
  sendFailed: 'The message was not sent. Please try again.',
  loadFailed: 'Could not load messages.',
  showingRecent: 'Showing only the {count} most recent messages.',
  errorMessageLength: 'A message must be 1–2000 characters.',
  errorClosed: 'This chat is closed.',
};

export const chat = { am, en };
