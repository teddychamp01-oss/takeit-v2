// Namespace: nav — bottom navigation labels (SPEC: Home, Browse, Post(+), Inbox, Me).

const am = {
  home: 'መነሻ',
  browse: 'አስስ',
  post: 'ለጥፍ',
  inbox: 'መልዕክቶች',
  me: 'እኔ',
} as const;

const en: Record<keyof typeof am, string> = {
  home: 'Home',
  browse: 'Browse',
  post: 'Post',
  inbox: 'Inbox',
  me: 'Me',
};

export const nav = { am, en };
