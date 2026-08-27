// N4 matcher tests. Two layers:
//  1. behavior — the allowlist admits ONLY the named public reads and rejects
//     every per-user surface (the shared-phone failure mode);
//  2. serialization — workbox stringifies the matchers into the service
//     worker, so each function is REVIVED from its own toString() and the
//     whole suite re-runs on the revived copy. A matcher that closes over
//     module scope passes layer 1 and FAILS layer 2 — this is the Gate 2
//     demonstration that the guard can actually fire (verified during
//     development: importing a module-scope HOST constant into the function
//     body fails the revived run with "HOST is not defined").

import { describe, expect, it } from 'vitest';
import {
  isPublicAvatarRead,
  isPublicCatalogRead,
  type SwMatchInput,
} from '../swCache';

// Deliberately NOT named HOST or any single-word identifier a matcher body
// might plausibly reference: the revive layer runs via `new Function`, whose
// body sees ONLY globals — never this module's scope — so a matcher closing
// over any module-scope name fails the revived run no matter what this test
// file names its own constants.
const TEST_ORIGIN_FOR_INPUTS = 'https://snfkefcluzkdeztdtdnk.supabase.co';

function input(
  path: string,
  method = 'GET',
  base = TEST_ORIGIN_FOR_INPUTS,
): SwMatchInput {
  return { url: new URL(path, base), request: { method } };
}

/**
 * Revive a function from its serialized source — what workbox ships.
 * `new Function` (not eval) so the revived body executes with NO access to
 * this module's lexical scope: only true globals resolve, exactly like the
 * generated service worker.
 */
function revive<T>(fn: T & ((arg: SwMatchInput) => boolean)) {
  return new Function(`return (${fn.toString()});`)() as (
    arg: SwMatchInput,
  ) => boolean;
}

function runCatalogSuite(match: (arg: SwMatchInput) => boolean) {
  // Allowed: the two public catalog tables, GET, with any query string.
  expect(match(input('/rest/v1/service_categories?select=*'))).toBe(true);
  expect(match(input('/rest/v1/service_packages?category_slug=eq.x'))).toBe(
    true,
  );

  // worker_profiles was REMOVED from the allowlist (adversarial review:
  // booked-worker reads left cache-key residue; count:'exact' 206s were
  // uncacheable anyway). It must now be rejected like any per-user surface.
  expect(
    match(input('/rest/v1/worker_profiles?select=*,profiles(*)&limit=20')),
  ).toBe(false);
  expect(match(input('/rest/v1/worker_profiles?user_id=eq.abc'))).toBe(false);

  // NEVER cached: RPCs (all state changes ride here).
  expect(match(input('/rest/v1/rpc/rpc_send_message', 'POST'))).toBe(false);
  expect(match(input('/rest/v1/rpc/rpc_accept_application'))).toBe(false);
  // NEVER cached: auth traffic.
  expect(match(input('/auth/v1/token?grant_type=password', 'POST'))).toBe(
    false,
  );
  expect(match(input('/auth/v1/user'))).toBe(false);
  // NEVER cached: per-user tables — a cached response outliving a session on
  // a shared phone is the exact failure mode this allowlist exists to stop.
  expect(match(input('/rest/v1/messages?booking_id=eq.x'))).toBe(false);
  expect(match(input('/rest/v1/bookings?id=eq.x'))).toBe(false);
  expect(match(input('/rest/v1/notifications?user_id=eq.x'))).toBe(false);
  expect(match(input('/rest/v1/profiles?id=eq.x'))).toBe(false);
  expect(match(input('/rest/v1/saved_workers?user_id=eq.x'))).toBe(false);
  expect(match(input('/rest/v1/verifications'))).toBe(false);
  expect(match(input('/rest/v1/guarantors'))).toBe(false);
  expect(match(input('/rest/v1/jobs'))).toBe(false);
  expect(match(input('/rest/v1/applications'))).toBe(false);

  // Anchoring: prefixes/suffixes of allowed names must not sneak through.
  expect(match(input('/rest/v1/service_categories_x'))).toBe(false);
  expect(match(input('/rest/v1/worker_profiles/1'))).toBe(false);
  expect(match(input('/other/rest/v1/service_categories'))).toBe(false);

  // Method: writes to an allowed table are never cached.
  expect(match(input('/rest/v1/service_categories', 'POST'))).toBe(false);
  expect(match(input('/rest/v1/service_packages', 'PATCH'))).toBe(false);

  // Host pin: same path on any other origin never matches.
  expect(
    match(input('/rest/v1/service_categories', 'GET', 'https://evil.example')),
  ).toBe(false);
}

function runAvatarSuite(match: (arg: SwMatchInput) => boolean) {
  expect(
    match(input('/storage/v1/object/public/avatars/uid/avatar.jpg?v=1')),
  ).toBe(true);

  // Private / non-avatar storage never matches.
  expect(
    match(input('/storage/v1/object/authenticated/verification-docs/x.jpg')),
  ).toBe(false);
  expect(
    match(input('/storage/v1/object/public/other-bucket/x.jpg')),
  ).toBe(false);
  expect(
    match(input('/storage/v1/object/sign/avatars/uid/avatar.jpg')),
  ).toBe(false);

  expect(
    match(input('/storage/v1/object/public/avatars/uid/a.jpg', 'POST')),
  ).toBe(false);
  expect(
    match(
      input(
        '/storage/v1/object/public/avatars/uid/a.jpg',
        'GET',
        'https://evil.example',
      ),
    ),
  ).toBe(false);
}

describe('isPublicCatalogRead', () => {
  it('allowlists only public catalog GETs (direct)', () => {
    runCatalogSuite(isPublicCatalogRead);
  });

  it('survives workbox serialization (revived from toString)', () => {
    runCatalogSuite(revive(isPublicCatalogRead));
  });
});

describe('isPublicAvatarRead', () => {
  it('allowlists only the public avatars bucket (direct)', () => {
    runAvatarSuite(isPublicAvatarRead);
  });

  it('survives workbox serialization (revived from toString)', () => {
    runAvatarSuite(revive(isPublicAvatarRead));
  });
});
