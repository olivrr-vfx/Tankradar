/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Relative base: works on GitHub Pages sub-paths, inside Capacitor and inside Tauri.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173, strictPort: true, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: { manualChunks: { maplibre: ['maplibre-gl'], react: ['react', 'react-dom', 'react-router-dom'] } },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // Home-screen apps update themselves: new version is activated on the next launch/focus.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: './',
        name: 'Tankradar – Spritpreise & Routenplaner',
        short_name: 'Tankradar',
        description: 'Spritpreise in Echtzeit, Preisverläufe, beste Tankzeit und die günstigsten Tankstopps auf deiner Route.',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0d1726',
        theme_color: '#2f5bff',
        categories: ['travel', 'navigation', 'utilities', 'finance'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Routenplaner', url: './#/route', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Favoriten', url: './#/favorites', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 2000, maxAgeSeconds: 14 * 86400 } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'photon.komoot.io' || url.hostname === 'nominatim.openstreetmap.org',
            handler: 'NetworkFirst',
            options: { cacheName: 'geocode', networkTimeoutSeconds: 5, expiration: { maxEntries: 200, maxAgeSeconds: 7 * 86400 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.js'],
  },
});
