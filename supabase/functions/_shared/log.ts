// Take It v2 — structured logging for edge functions.
// One JSON object per line so Supabase `query_logs` / the dashboard can filter
// on fn/level/event. NEVER pass secrets, raw phone numbers, message bodies or
// any C2 PII in `fields` — ids, counts, statuses and reasons only.

export type LogLevel = 'info' | 'warn' | 'error';

export function logEvent(
  fn: string,
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      fn,
      level,
      event,
      ...fields,
    }),
  );
}
