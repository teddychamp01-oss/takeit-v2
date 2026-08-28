import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { isPublicAvatarRead, isPublicCatalogRead } from './src/lib/swCache';

// Low-end-first: no remote fonts, no analytics, vendored assets only.
// The only network the built app talks to is the Supabase project.

// Guard: the Supabase hostname is a LITERAL in three places (both swCache
// matchers — workbox serialization forbids closures — and the index.html
// preconnect). If a build points VITE_SUPABASE_URL at a different project
// (staging/branch), runtime caching + preconnect silently no-op. Fail the
// build loudly instead of drifting.
const PINNED_SUPABASE_HOST = 'snfkefcluzkdeztdtdnk.supabase.co';
const envUrl = process.env.VITE_SUPABASE_URL;
if (envUrl && new URL(envUrl).hostname !== PINNED_SUPABASE_HOST) {
  throw new Error(
    `VITE_SUPABASE_URL host ${new URL(envUrl).hostname} != pinned ` +
      `${PINNED_SUPABASE_HOST} — update src/lib/swCache.ts (both matchers), ` +
      `index.html preconnect, and this guard together.`,
  );
}

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // N10: vendor bytes survive app deploys in the HTTP/SW cache.
        // react + react-dom (+ scheduler, react-dom's runtime dep) in one
        // chunk, supabase-js in another; everything else stays app code.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return 'react';
          }
          if (id.includes('node_modules/@supabase/')) return 'supabase';
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // A4 — inline the 134-byte registerSW snippet instead of emitting
      // /registerSW.js. The default ('script') injects a <script src> into
      // <head> with neither defer nor async, so it parser-blocks the cold
      // load for a whole round trip to save nothing. Inline is the same code
      // in the same place, minus the request.
      injectRegister: 'inline',
      includeAssets: ['icons/icon.svg', 'icons/icon-maskable.svg'],
      manifest: {
        name: 'Take It',
        short_name: 'Take It',
        description:
          'የተረጋገጡ ባለሙያዎች በአዲስ አበባ — verified workers in Addis Ababa.',
        lang: 'am',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#FDF8F3',
        theme_color: '#F97316',
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        // N4 — offline-tolerant reads (SPEC C6). ALLOWLIST-style matchers
        // (src/lib/swCache.ts, unit-tested incl. a revived-from-toString
        // pass): only the named public catalog tables + the public avatars
        // bucket are ever cached. /rest/v1/rpc/*, /auth/*, messages,
        // bookings, notifications, profiles and every other per-user read
        // stay network-only — a cached response outliving a session on a
        // shared phone is the failure mode. Do NOT add routes here without
        // extending the allowlist tests first.
        runtimeCaching: [
          {
            urlPattern: isPublicCatalogRead,
            method: 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-read',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 50,
                // 1 hour, tightened from 1 day after adversarial review:
                // NetworkFirst silently serves cache when the network is
                // slow/erroring while ONLINE, and the offline banner only
                // fires on real offline (generateSW cannot signal
                // served-from-cache to the page — repo law 6 residual,
                // documented in docs/PERFORMANCE.md; injectManifest
                // follow-up filed in PROPOSALS). A 1h ceiling bounds how
                // stale that silent serve can ever be.
                maxAgeSeconds: 3600,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: isPublicAvatarRead,
            method: 'GET',
            handler: 'CacheFirst',
            options: {
              cacheName: 'avatar-images',
              expiration: { maxEntries: 100 },
              // 0: <img> tags fetch cross-origin no-cors → opaque responses.
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
