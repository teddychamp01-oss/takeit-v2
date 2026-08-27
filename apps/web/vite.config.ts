import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Low-end-first: no remote fonts, no analytics, vendored assets only.
// The only network the built app talks to is the Supabase project.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
