// =============================================================================
// Duplication guard. flows.ts, texts.ts and telegramAuth.ts are deliberately
// duplicated between this npm package (Node/vitest world) and
// supabase/functions/_shared (Deno edge world), because the edge runtime
// cannot import the npm workspace without a build step. These tests FAIL the
// moment the copies drift, so "keep in sync" is enforced, not hoped for.
//
// Gate 2 note: this guard was demonstrated firing during development by
// appending a character to one mirror copy (test failed) and restoring it.
// =============================================================================
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const sharedDir = resolve(here, '../../../supabase/functions/_shared');

const DUPLICATED = ['texts.ts', 'flows.ts', 'telegramAuth.ts'] as const;

describe('duplicated bot modules stay byte-identical with the edge mirrors', () => {
  for (const name of DUPLICATED) {
    it(`${name} matches supabase/functions/_shared/${name}`, () => {
      const local = readFileSync(resolve(here, name), 'utf8');
      const mirror = readFileSync(resolve(sharedDir, name), 'utf8');
      expect(mirror).toBe(local);
    });
  }
});
