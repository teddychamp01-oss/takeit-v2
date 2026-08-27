// =============================================================================
// Take It v2 — chapa-webhook edge function.
//
// C1 NON-CUSTODIAL: this handler only MIRRORS Chapa-side money movements into
// payments.status. Take It never holds funds; no balance is computed anywhere.
//
// Behavior:
// * FEATURE_PAYMENTS_ENABLED !== 'true' -> the ENTIRE handler no-ops with
//   200 { ignored: true } (log-only). Phase 1 is off-app payment logging.
// * Signature: hex(HMAC-SHA256(raw_body, CHAPA_WEBHOOK_SECRET)) compared
//   (constant-time) against the Chapa-Signature / x-chapa-signature header.
//   Verified BEFORE the body is parsed or any row is touched.
// * Idempotent by provider_ref: the row is looked up by (provider='chapa',
//   provider_ref=tx_ref); an event whose target status already applied
//   returns 200 { idempotent: true }. NOTE the migration has no UNIQUE index
//   on payments.provider_ref — this handler therefore refuses to act when the
//   lookup is ambiguous (>1 row) instead of guessing; a partial unique index
//   is proposed to the schema owner (fix-forward, R4 — not added here).
// * Status transitions ONLY along initiated->held->released/refunded/failed:
//     initiated -> held | failed
//     held      -> released | refunded | failed
//   Anything else is rejected without touching the row. Rejections return
//   200 { ok:false, ... } (not 4xx/5xx) because Chapa retries non-2xx and an
//   out-of-order or duplicate event must not retry forever; the rejection is
//   preserved in structured logs AND in audit_log.
//   EXCEPTION: amount/currency mismatch returns 400 — a mismatch can mean
//   tampering or a mis-priced charge, and the retries keep it loudly visible
//   until a human looks.
// * Amounts are NEVER trusted from the webhook: the ETB amount in the event
//   is converted to integer cents and compared against the STORED payments
//   row (held: must equal amount_cents; released: must not exceed
//   amount_cents - commission_cents; refunded: must not exceed amount_cents).
// * Every applied transition writes audit_log.
//
// Deploy note: requires verify_jwt = false (Chapa cannot send a Supabase JWT).
// =============================================================================

import { json, preflight } from '../_shared/cors.ts';
import { hmacSha256Hex, timingSafeEqual } from '../_shared/hmac.ts';
import { logEvent } from '../_shared/log.ts';
import { adminClient } from '../_shared/supabaseAdmin.ts';

const FN = 'chapa-webhook';

type PaymentStatus = 'logged' | 'initiated' | 'held' | 'released' | 'refunded' | 'failed';

const VALID_TRANSITIONS: Partial<Record<PaymentStatus, PaymentStatus[]>> = {
  initiated: ['held', 'failed'],
  held: ['released', 'refunded', 'failed'],
};

interface ChapaEvent {
  event: string;
  status: string;
  txRef: string | null;
  amountEtb: number | null;
  currency: string | null;
}

function parseChapaEvent(body: Record<string, unknown>): ChapaEvent {
  // Chapa payload shapes vary by event type; fields may be top-level or
  // nested under `data`. Read defensively, trust nothing.
  const data =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : body;
  const pick = (key: string): unknown => data[key] ?? body[key];
  const amountRaw = pick('amount');
  const amount =
    typeof amountRaw === 'number'
      ? amountRaw
      : typeof amountRaw === 'string' && amountRaw.trim() !== ''
        ? Number(amountRaw)
        : null;
  return {
    event: String(body.event ?? body.type ?? '').toLowerCase(),
    status: String(pick('status') ?? '').toLowerCase(),
    txRef: typeof pick('tx_ref') === 'string' ? (pick('tx_ref') as string) : null,
    amountEtb: amount !== null && Number.isFinite(amount) ? amount : null,
    currency: typeof pick('currency') === 'string' ? (pick('currency') as string) : null,
  };
}

/** Map a Chapa event to the payments.status it implies, or null if unhandled. */
function targetStatusFor(ev: ChapaEvent): PaymentStatus | null {
  const success = ev.status === 'success';
  if (ev.event.includes('refund')) return success ? 'refunded' : null;
  if (ev.event.includes('transfer') || ev.event.includes('payout')) {
    // Provider paid the worker out of the provider-held funds -> released.
    return success ? 'released' : null;
  }
  // Charge events: customer's money reached Chapa -> provider-held escrow.
  if (success) return 'held';
  if (ev.status === 'failed' || ev.status === 'error' || ev.event.includes('fail')) {
    return 'failed';
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  // Feature flag first: Phase 1 is log-only, the whole handler no-ops.
  if (Deno.env.get('FEATURE_PAYMENTS_ENABLED') !== 'true') {
    logEvent(FN, 'info', 'ignored_flag_off', {
      body_bytes: Number(req.headers.get('content-length') ?? 0),
    });
    return json(200, { ignored: true });
  }

  const secret = Deno.env.get('CHAPA_WEBHOOK_SECRET');
  if (!secret) {
    logEvent(FN, 'error', 'not_configured', { missing: 'CHAPA_WEBHOOK_SECRET' });
    return json(503, { error: 'chapa_webhook_not_configured' });
  }

  // Signature over the RAW body, before parsing anything.
  const rawBody = await req.text();
  const signatureHeader =
    req.headers.get('chapa-signature') ?? req.headers.get('x-chapa-signature') ?? '';
  const expected = await hmacSha256Hex(secret, rawBody);
  if (!timingSafeEqual(signatureHeader.toLowerCase(), expected)) {
    logEvent(FN, 'warn', 'bad_signature', { had_header: signatureHeader.length > 0 });
    return json(401, { error: 'invalid_signature' });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
    if (body === null || typeof body !== 'object') throw new Error('not an object');
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const ev = parseChapaEvent(body);
  logEvent(FN, 'info', 'event_received', {
    event: ev.event,
    status: ev.status,
    tx_ref: ev.txRef,
  });

  if (!ev.txRef) {
    return json(400, { error: 'missing_tx_ref' });
  }

  const target = targetStatusFor(ev);
  if (!target) {
    logEvent(FN, 'info', 'event_unhandled', { event: ev.event, status: ev.status });
    return json(200, { ok: true, unhandled: true });
  }

  const admin = adminClient();
  if (!admin) {
    logEvent(FN, 'error', 'supabase_env_missing', {});
    return json(503, { error: 'supabase_not_configured' });
  }

  try {
    // --- locate the payment row by provider_ref -------------------------
    const { data: rows, error: findErr } = await admin
      .from('payments')
      .select('id, booking_id, status, amount_cents, commission_cents, currency')
      .eq('provider', 'chapa')
      .eq('provider_ref', ev.txRef)
      .limit(2);
    if (findErr) throw new Error(`payments lookup failed: ${findErr.message}`);

    if (!rows || rows.length === 0) {
      // Unknown ref: acknowledge (200) so Chapa stops retrying, but log it —
      // silence is not safety.
      logEvent(FN, 'warn', 'unknown_provider_ref', { tx_ref: ev.txRef });
      return json(200, { ignored: true, reason: 'unknown_provider_ref' });
    }
    if (rows.length > 1) {
      // Missing unique index hazard surfaced loudly instead of guessing.
      logEvent(FN, 'error', 'ambiguous_provider_ref', { tx_ref: ev.txRef });
      return json(200, { ok: false, error: 'ambiguous_provider_ref' });
    }

    const row = rows[0];
    const from = row.status as PaymentStatus;

    // --- idempotency ----------------------------------------------------
    if (from === target) {
      logEvent(FN, 'info', 'idempotent_replay', { payment_id: row.id, status: target });
      return json(200, { ok: true, idempotent: true, status: target });
    }

    // --- amount check (never trust the webhook's numbers) ---------------
    const storedCents = Number(row.amount_cents);
    const commissionCents = Number(row.commission_cents ?? 0);
    const storedCurrency = String(row.currency ?? 'ETB').trim();
    if (ev.currency !== null && ev.currency.trim().toUpperCase() !== storedCurrency.toUpperCase()) {
      logEvent(FN, 'error', 'currency_mismatch', {
        payment_id: row.id,
        got: ev.currency,
        stored: storedCurrency,
      });
      await admin.from('audit_log').insert({
        actor_id: null,
        action: 'payment.webhook_rejected',
        entity: 'payments',
        entity_id: row.id,
        diff: { reason: 'currency_mismatch', got: ev.currency, stored: storedCurrency },
      });
      return json(400, { error: 'currency_mismatch' });
    }
    if (ev.amountEtb !== null) {
      const gotCents = Math.round(ev.amountEtb * 100);
      const ok =
        target === 'held'
          ? gotCents === storedCents
          : target === 'released'
            ? gotCents <= storedCents - commissionCents
            : target === 'refunded'
              ? gotCents <= storedCents
              : true; // 'failed' carries no money movement
      if (!ok) {
        logEvent(FN, 'error', 'amount_mismatch', {
          payment_id: row.id,
          target,
          got_cents: gotCents,
          stored_cents: storedCents,
          commission_cents: commissionCents,
        });
        await admin.from('audit_log').insert({
          actor_id: null,
          action: 'payment.webhook_rejected',
          entity: 'payments',
          entity_id: row.id,
          diff: {
            reason: 'amount_mismatch',
            target,
            got_cents: gotCents,
            stored_cents: storedCents,
          },
        });
        return json(400, { error: 'amount_mismatch' });
      }
    } else {
      logEvent(FN, 'warn', 'amount_missing_in_event', { payment_id: row.id, target });
    }

    // --- transition validity --------------------------------------------
    if (!(VALID_TRANSITIONS[from] ?? []).includes(target)) {
      logEvent(FN, 'warn', 'invalid_transition', {
        payment_id: row.id,
        from,
        to: target,
      });
      await admin.from('audit_log').insert({
        actor_id: null,
        action: 'payment.webhook_rejected',
        entity: 'payments',
        entity_id: row.id,
        diff: { reason: 'invalid_transition', from, to: target, event: ev.event },
      });
      return json(200, { ok: false, error: 'invalid_transition', from, to: target });
    }

    // --- apply (optimistic: only if the row is still in `from`) ---------
    const { data: updated, error: updErr } = await admin
      .from('payments')
      .update({ status: target })
      .eq('id', row.id)
      .eq('status', from)
      .select('id');
    if (updErr) throw new Error(`payments update failed: ${updErr.message}`);
    if (!updated || updated.length === 0) {
      // Concurrent writer moved the row between our read and write.
      logEvent(FN, 'warn', 'concurrent_status_change', { payment_id: row.id });
      return json(200, { ok: false, error: 'concurrent_status_change' });
    }

    await admin.from('audit_log').insert({
      actor_id: null,
      action: 'payment.webhook',
      entity: 'payments',
      entity_id: row.id,
      diff: {
        from,
        to: target,
        event: ev.event,
        provider_ref: ev.txRef,
        booking_id: row.booking_id,
      },
    });

    logEvent(FN, 'info', 'transition_applied', {
      payment_id: row.id,
      from,
      to: target,
    });
    return json(200, { ok: true, payment_id: row.id, status: target });
  } catch (err) {
    logEvent(FN, 'error', 'unhandled', {
      message: err instanceof Error ? err.message : String(err),
    });
    // 500 → Chapa retries; correct for transient DB errors.
    return json(500, { error: 'internal' });
  }
});
