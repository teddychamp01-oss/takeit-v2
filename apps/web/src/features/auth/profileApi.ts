// Data access for auth/onboarding. Table/column names match
// supabase/migrations/20260827000300_tables.sql exactly (R1: audited first).
//
// Writes stay inside what RLS grants `authenticated` on profiles /
// worker_profiles (both are owner-scoped column-grant writes; no status or
// trust columns are touched — those are server-set).

import { supabase } from '../../lib/supabase';
import type { Locale } from '../../i18n';
import { buildAvatarPath, roleToFlags, type RoleChoice } from './validation';

export interface OwnProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  locale: string;
  is_customer: boolean;
  is_worker: boolean;
  default_neighborhood: string | null;
}

/** Own profile row (created by the signup trigger); null if somehow absent. */
export async function fetchOwnProfile(userId: string): Promise<OwnProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, display_name, avatar_url, locale, is_customer, is_worker, default_neighborhood',
    )
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Upload the compressed avatar into the public 'avatars' bucket at
 * <uid>/avatar.jpg (the only path the storage policy accepts) and return a
 * cache-busted public URL for profiles.avatar_url.
 */
export async function uploadAvatar(userId: string, blob: Blob): Promise<string> {
  const path = buildAvatarPath(userId);
  const { error } = await supabase.storage.from('avatars').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '3600',
  });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export interface OnboardingInput {
  display_name: string;
  locale: Locale;
  role: RoleChoice;
  default_neighborhood: string;
  avatar_url?: string;
}

/**
 * Persist onboarding: profiles upsert (trigger normally created the row —
 * upsert also heals a missing one) + a worker_profiles SKELETON when the
 * user chose worker/both. ignoreDuplicates keeps an existing worker profile
 * untouched on re-runs.
 */
export async function saveOnboarding(
  userId: string,
  input: OnboardingInput,
): Promise<void> {
  const flags = roleToFlags(input.role);

  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      display_name: input.display_name,
      locale: input.locale,
      is_customer: flags.is_customer,
      is_worker: flags.is_worker,
      default_neighborhood: input.default_neighborhood,
      ...(input.avatar_url ? { avatar_url: input.avatar_url } : {}),
    },
    { onConflict: 'id' },
  );
  if (error) throw error;

  if (flags.is_worker) {
    const { error: workerError } = await supabase.from('worker_profiles').upsert(
      {
        user_id: userId,
        neighborhood: input.default_neighborhood,
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
    if (workerError) throw workerError;
  }
}
