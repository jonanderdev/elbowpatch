/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin, type UserConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import manifest from './package.json' with { type: 'json' }

// A link preview needs full addresses, which a build for any host cannot know: they come from
// SITE_URL, or from URL, which Netlify sets. With neither, a link shows no picture (docs/decisions/0016).
const env = loadEnv('production', '.', ['SITE_URL', 'URL'])
const siteUrl = (env.SITE_URL ?? env.URL)?.replace(/\/$/, '')

function linkPreview(): Plugin {
  const meta = (attrs: Record<string, string>) => ({ tag: 'meta', attrs, injectTo: 'head' as const })
  return {
    name: 'link-preview',
    apply: 'build',
    transformIndexHtml: () =>
      siteUrl
        ? [
            meta({ property: 'og:url', content: `${siteUrl}/` }),
            meta({ property: 'og:image', content: `${siteUrl}/og-image.png` }),
            meta({ property: 'og:image:type', content: 'image/png' }),
            meta({ property: 'og:image:width', content: '1200' }),
            meta({ property: 'og:image:height', content: '630' }),
            meta({ property: 'og:image:alt', content: 'Elbowpatch: a quiet place to write' }),
          ]
        : [],
  }
}

// WebKit keeps a module that failed to load, by its address, until the page is loaded again, so a second try at the same
// address fails the same way. The PDF code's second try asks for another address, and only the build knows the chunk's
// name: this puts it in the one place that names it (docs/decisions/0019).
const PDF_CODE_FILE = '__PDF_CODE_FILE__'
function pdfCodeFile(): Plugin {
  return {
    name: 'pdf-code-file',
    apply: 'build',
    generateBundle(_, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk')
      const pdf = chunks.find((chunk) => chunk.name === 'pdf')
      if (!pdf) throw new Error('The PDF code has no chunk of its own')
      const [user, ...others] = chunks.filter((chunk) => chunk.code.includes(PDF_CODE_FILE))
      if (!user || others.length) throw new Error('Expected one chunk to name the PDF code')
      user.code = user.code.replaceAll(PDF_CODE_FILE, pdf.fileName.split('/').pop()!)
    },
  }
}

// The code imports React; Preact runs it (docs/decisions/0002). Going back to
// React is deleting these aliases.
const config: UserConfig = defineConfig({
  // Relative paths, so any static host works, in a subfolder too.
  base: './',
  // Only the version enters the bundle, never the manifest.
  define: { __APP_VERSION__: JSON.stringify(manifest.version) },
  plugins: [
    linkPreview(),
    pdfCodeFile(),
    VitePWA({
      // A new version downloads quietly and waits for the next launch: it never reloads the page you write in (0010).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Elbowpatch',
        short_name: 'Elbowpatch',
        description: 'A quiet place to write',
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
        // Only link previews fetch this one; no installed copy needs it.
        // The PDF code is fetched when the first PDF is made, not installed (docs/decisions/0019).
        globIgnores: ['**/og-image.png', '**/assets/pdf-*.js', '**/assets/makePdf-*.js'],
        navigateFallback: 'index.html',
        // The first PDF fetches its code and fixed fonts and keeps them, so later ones need no network. Their names carry a
        // hash, so a kept file is never stale; a new version asks for new names, and the oldest are let go.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/((pdf|makePdf)-[^/]*\.js|[^/]*\.ttf)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'pdf', cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 40 } },
          },
        ],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // One chunk with a name of its own for the PDF code and the libraries it uses, so the install can leave it out by name.
        // Only the modules named here go in it: what the rest of the app shares with it stays in the main chunk, which must
        // never need this one to open (a chunk left out of the install would stop the app opening offline).
        advancedChunks: {
          groups: [
            {
              name: 'pdf',
              includeDependenciesRecursively: false,
              test: /node_modules[\\/](pdf-lib|@pdf-lib|pako|tslib)[\\/]|src[\\/]pdf[\\/]|src[\\/]domain[\\/]printOrder\.ts$/,
            },
          ],
        },
      },
    },
  },
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

export default config
