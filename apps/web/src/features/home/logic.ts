// Pure logic for the home screen — covered by vitest.

import type { MessageKey } from '../../i18n';

export type GreetingSlot = 'morning' | 'afternoon' | 'evening';

/**
 * Time-of-day greeting slot from a 0–23 hour:
 * 05:00–11:59 morning, 12:00–17:59 afternoon, everything else evening
 * (Amharic greetings are time-of-day specific: እንደምን አደሩ / ዋሉ / አመሹ).
 */
export function greetingSlot(hour: number): GreetingSlot {
  if (!Number.isFinite(hour)) return 'evening';
  const h = Math.floor(hour);
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'evening';
}

export const GREETING_KEY: Record<GreetingSlot, MessageKey> = {
  morning: 'home.greetingMorning',
  afternoon: 'home.greetingAfternoon',
  evening: 'home.greetingEvening',
};
