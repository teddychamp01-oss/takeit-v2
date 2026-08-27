#!/usr/bin/env node
// N10 — hand-rolled CI bundle-size gate (no dependencies: node:fs + node:zlib
// only, per the no-new-deps rule). Gzips every JS/CSS asset in the web build
// and fails the run when a budget is exceeded.
//
// ── BUDGETS (gzip bytes) ────────────────────────────────────────────────────
// ESTIMATE targets (pwa-F1): set before sustained field measurement — tune
// after Lighthouse runs on real Bole phones, but only ever tune DOWN without
// a written reason to go up.
//   MAIN: the code that must arrive before Home is interactive — the entry
//         chunk plus the statically-imported vendor chunks that vite.config's
//         manualChunks names ('react', 'supabase') and the entry CSS.
//   ROUTE CHUNK: every other JS asset (lazy route/feature chunks).
const MAIN_BUDGET_GZ = 150 * 1024; // ESTIMATE — main ≤ 150 KB gz
const ROUTE_CHUNK_BUDGET_GZ = 30 * 1024; // ESTIMATE — any route chunk ≤ 30 KB gz
// Chunk basenames counted into MAIN (entry + eager vendor). If manualChunks
// names change in vite.config.ts, change this list in the same commit.
const MAIN_CHUNK_PREFIXES = ['index', 'react', 'supabase'];
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distAssets = join(repoRoot, 'apps', 'web', 'dist', 'assets');

if (!existsSync(distAssets)) {
  console.error(
    `check-bundle-size: ${distAssets} not found — run the build first ` +
      '(npm run build -w apps/web).',
  );
  process.exit(1);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/** Vite emits assets as <name>-<hash>.<ext>; recover <name>. */
function chunkName(file) {
  const m = /^(.*?)-[A-Za-z0-9_-]+\.(js|css)$/.exec(file);
  return m ? m[1] : file.replace(/\.(js|css)$/, '');
}

const files = readdirSync(distAssets)
  .filter((f) => /\.(js|css)$/.test(f))
  .sort();

if (files.length === 0) {
  // Law 6: an empty scan must fail loudly, never report "all budgets met"
  // over nothing (a verifier that cannot fail).
  console.error(`check-bundle-size: no JS/CSS assets found in ${distAssets}.`);
  process.exit(1);
}

let mainTotal = 0;
const mainParts = [];
const routeChunks = [];

for (const file of files) {
  const path = join(distAssets, file);
  const raw = statSync(path).size;
  const gz = gzipSync(readFileSync(path), { level: 9 }).length;
  const name = chunkName(file);
  const isJs = file.endsWith('.js');
  const isMain = MAIN_CHUNK_PREFIXES.includes(name); // entry CSS is index-*.css
  const entry = { file, raw, gz };
  if (isMain) {
    mainTotal += gz;
    mainParts.push(entry);
  } else if (isJs) {
    routeChunks.push(entry);
  } else {
    // Non-entry CSS (none today) would be a route asset; hold it to the
    // route budget as well so it can never grow silently.
    routeChunks.push(entry);
  }
}

let failed = false;

console.log('check-bundle-size — gzip level 9, budgets in script header\n');
console.log('MAIN (entry + eager vendor):');
for (const { file, raw, gz } of mainParts) {
  console.log(`  ${file.padEnd(40)} raw ${kb(raw).padStart(9)}  gz ${kb(gz)}`);
}
const mainOk = mainTotal <= MAIN_BUDGET_GZ;
if (!mainOk) failed = true;
console.log(
  `  TOTAL gz ${kb(mainTotal)} / budget ${kb(MAIN_BUDGET_GZ)}  ${mainOk ? 'OK' : 'OVER BUDGET'}\n`,
);

console.log('ROUTE/LAZY CHUNKS (each vs budget):');
for (const { file, raw, gz } of routeChunks) {
  const ok = gz <= ROUTE_CHUNK_BUDGET_GZ;
  if (!ok) failed = true;
  console.log(
    `  ${file.padEnd(40)} raw ${kb(raw).padStart(9)}  gz ${kb(gz).padStart(9)} / ${kb(ROUTE_CHUNK_BUDGET_GZ)}  ${ok ? 'OK' : 'OVER BUDGET'}`,
  );
}

if (failed) {
  console.error(
    '\ncheck-bundle-size: OVER BUDGET. Either shrink the chunk (preferred) ' +
      'or raise the budget in scripts/check-bundle-size.mjs with a written ' +
      'reason in the same commit — never silently.',
  );
  process.exit(1);
}
console.log('\ncheck-bundle-size: all budgets met.');
