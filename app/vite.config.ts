/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The code imports React; Preact runs it (docs/decisions/0002). Going back to
// React is deleting these aliases.
export default defineConfig({
  // Relative paths, so any static host works, in a subfolder too.
  base: './',
  plugins: [
    VitePWA({
      // A new version downloads quietly and waits for the next launch: it never reloads the page you write in (0010).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['launch-mark.svg', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Elbowpatch',
        short_name: 'Elbowpatch',
        description: 'A quiet place to write, with a memory.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f3f3f0',
        theme_color: '#f3f3f0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Every font is precached, so a page in any script opens offline (0011).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    alias: [
      { find: /^react\/jsx-runtime$/, replacement: 'preact/jsx-runtime' },
      { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/jsx-dev-runtime' },
      { find: /^react(-dom)?$/, replacement: 'preact/compat' },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
    // Each file gets its own fake IndexedDB.
    isolate: true,
  },
})
