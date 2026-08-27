// Message catalog registry. Every namespace is imported EXPLICITLY here so the
// bundler sees a closed set (no dynamic requires, tree-shakable, typed keys).
//
// Adding a namespace:
//   1. create src/i18n/messages/<ns>.ts exporting `{ am, en }` where `en` is
//      typed `Record<keyof typeof am, string>` (compile error if out of sync)
//   2. import it below and add it to `catalogs`
// Keys are then usable as t('<ns>.<key>').

import { common } from './messages/common';
import { nav } from './messages/nav';
import { auth } from './messages/auth';
import { home } from './messages/home';
import { browse } from './messages/browse';
import { jobs } from './messages/jobs';
import { bookings } from './messages/bookings';
import { chat } from './messages/chat';
import { reviews } from './messages/reviews';
import { profile } from './messages/profile';
import { verification } from './messages/verification';
import { admin } from './messages/admin';

export const catalogs = {
  common,
  nav,
  auth,
  home,
  browse,
  jobs,
  bookings,
  chat,
  reviews,
  profile,
  verification,
  admin,
} as const;

export type Locale = 'am' | 'en';
export const LOCALES: readonly Locale[] = ['am', 'en'];
/** Amharic is the product default (SPEC C5). */
export const DEFAULT_LOCALE: Locale = 'am';

type Catalogs = typeof catalogs;

/** Union of every valid message key, e.g. 'nav.home' | 'common.save' | … */
export type MessageKey = {
  [N in keyof Catalogs]: `${N & string}.${keyof Catalogs[N]['am'] & string}`;
}[keyof Catalogs];

type MessageTable = Record<string, string>;

/**
 * Resolve `key` ("<ns>.<name>") for `locale`, falling back to the default
 * locale, then to `undefined`. Never throws.
 */
export function lookupMessage(locale: Locale, key: string): string | undefined {
  const dot = key.indexOf('.');
  if (dot <= 0) return undefined;
  const ns = key.slice(0, dot);
  const name = key.slice(dot + 1);
  const catalog = (
    catalogs as Record<string, { am: MessageTable; en: MessageTable }>
  )[ns];
  if (!catalog) return undefined;
  return catalog[locale]?.[name] ?? catalog[DEFAULT_LOCALE]?.[name];
}
