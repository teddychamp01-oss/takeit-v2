// Take It v2 — find-or-create a Supabase user keyed on telegram_id.
// Used by telegram-auth (login) and telegram-webhook (/postjob inserts).
//
// Identity model: Telegram-primary auth (SPEC). Each Telegram account maps to
// one auth.users row via the deterministic email alias tg<id>@telegram.takeit.example
// (never a deliverable address — it only keys the account) and to one
// profiles row via profiles.telegram_id (UNIQUE in the schema).

import { logEvent } from './log.ts';
import type { AnyClient } from './supabaseAdmin.ts';

export const TELEGRAM_EMAIL_DOMAIN = 'telegram.takeit.example';

export function telegramAliasEmail(telegramId: string): string {
  return `tg${telegramId}@${TELEGRAM_EMAIL_DOMAIN}`;
}

export interface TelegramUserRef {
  userId: string;
  email: string;
  created: boolean;
}

/**
 * Find the profile with this telegram_id, or create the auth user (the DB
 * signup trigger creates the profiles row) and stamp telegram_id onto it.
 * Race-safe: if the alias email already exists (concurrent webhook + login),
 * the existing user is recovered via admin.generateLink, which returns the
 * user for an existing email without sending anything.
 */
export async function findOrCreateTelegramUser(
  admin: AnyClient,
  telegramId: string,
  displayName: string,
): Promise<TelegramUserRef> {
  const email = telegramAliasEmail(telegramId);

  const { data: existing, error: findErr } = await admin
    .from('profiles')
    .select('id')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  if (findErr) throw new Error(`profiles lookup failed: ${findErr.message}`);
  if (existing) {
    return { userId: existing.id as string, email, created: false };
  }

  let userId: string | null = null;
  let created = false;

  const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      locale: 'am', // C5: Amharic default
      telegram_id: telegramId,
    },
  });

  if (createErr) {
    // Alias already exists (partial earlier run / concurrent request):
    // generateLink returns the existing user without creating anything.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr || !linkData?.user) {
      throw new Error(
        `createUser failed (${createErr.message}) and recovery lookup failed` +
          (linkErr ? ` (${linkErr.message})` : ''),
      );
    }
    userId = linkData.user.id;
  } else {
    userId = createdUser.user.id;
    created = true;
  }

  // Stamp telegram_id on the trigger-created profile (upsert covers the rare
  // case where the trigger has not produced a row, e.g. older accounts).
  const { error: upsertErr } = await admin
    .from('profiles')
    .upsert({ id: userId, telegram_id: telegramId }, { onConflict: 'id' });
  if (upsertErr) throw new Error(`profiles upsert failed: ${upsertErr.message}`);

  // Fill display_name only when empty — never overwrite what the user set.
  if (displayName) {
    await admin
      .from('profiles')
      .update({ display_name: displayName.slice(0, 80) })
      .eq('id', userId)
      .eq('display_name', '');
  }

  logEvent('tgAccount', 'info', created ? 'telegram_user_created' : 'telegram_user_linked', {
    user_id: userId,
    telegram_id_len: telegramId.length, // id itself is quasi-PII; log length only
  });

  return { userId, email, created };
}
