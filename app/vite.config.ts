/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// The code imports React; Preact runs it (docs/decisions/0002). Going back to
// React is deleting these aliases.
export default defineConfig({
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
