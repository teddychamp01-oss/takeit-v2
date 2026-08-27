// Take It v2 — retention job: delete manual-ID images 30 days after decision.
//
// C2 / Proclamation 1321/2024: manual-verification images (id_front/id_back/
// selfie) must be deleted 30 days after the verification decision. SQL cannot
// remove storage-backend objects, so this two-step job:
//   1) finds verifications decided > N days ago that still have image paths,
//   2) removes those objects from the private `verifications` bucket via the
//      storage admin API,
//   3) calls public.purge_expired_verification_metadata() to null the path
//      columns and write an audit_log row.
//
// AUTH: this is NOT a user endpoint. It authenticates with a shared secret
// (PURGE_SECRET) presented as `x-purge-secret`, so it is deployed with
// verify_jwt = false and gates itself. Invoke it from pg_cron via pg_net, or a
// scheduled trigger, once per day. Unconfigured → 503, never a crash.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { preflight, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabaseAdmin.ts';
import { logEvent } from '../_shared/log.ts';

const FN = 'purge-expired-verifications';

const RETENTION_DAYS = 30;
const BUCKET = 'verifications';

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const secret = Deno.env.get('PURGE_SECRET');
  const admin = adminClient();
  if (!secret || !admin) {
    return json(503, { error: 'purge_not_configured' });
  }
  // Constant-ish comparison is unnecessary for a deploy secret, but reject
  // early and loudly on mismatch.
  if (req.headers.get('x-purge-secret') !== secret) {
    return json(401, { error: 'unauthorized' });
  }

  // 1) find expired rows that still hold image paths.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const { data: expired, error: selErr } = await admin
    .from('verifications')
    .select('id, user_id, id_front_path, id_back_path, selfie_path, decided_at, status')
    .in('status', ['approved', 'rejected'])
    .lt('decided_at', cutoff)
    .or('id_front_path.not.is.null,id_back_path.not.is.null,selfie_path.not.is.null');

  if (selErr) {
    logEvent(FN, 'error', 'select_error', { message: selErr.message });
    return json(500, { error: 'select_failed' });
  }

  const rows = expired ?? [];
  const paths: string[] = [];
  for (const r of rows) {
    for (const p of [r.id_front_path, r.id_back_path, r.selfie_path]) {
      if (p) paths.push(p);
    }
  }

  // 2) remove the objects from the private bucket (idempotent — remove() does
  //    not error on already-absent paths).
  let objectsRemoved = 0;
  if (paths.length > 0) {
    const { data: removed, error: rmErr } = await admin.storage.from(BUCKET).remove(paths);
    if (rmErr) {
      logEvent(FN, 'error', 'storage_error', { message: rmErr.message, attempted: paths.length });
      return json(500, { error: 'storage_remove_failed' });
    }
    objectsRemoved = removed?.length ?? 0;
  }

  // 3) null the path columns + record the purge (DB half, guarded RPC).
  const { data: nulled, error: rpcErr } = await admin.rpc(
    'purge_expired_verification_metadata',
    { p_retention_days: RETENTION_DAYS },
  );
  if (rpcErr) {
    logEvent(FN, 'error', 'rpc_error', { message: rpcErr.message });
    return json(500, { error: 'metadata_purge_failed' });
  }

  logEvent(FN, 'info', 'done', { rows: rows.length, objectsRemoved, rowsNulled: nulled });
  return json(200, {
    ok: true,
    retention_days: RETENTION_DAYS,
    expired_rows: rows.length,
    objects_removed: objectsRemoved,
    rows_nulled: nulled,
  });
});
