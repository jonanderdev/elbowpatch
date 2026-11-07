# 11. Fonts, dependencies, state and URLs

Date: 2026-10-27 · Status: accepted

## Fonts
- The app serves its own `woff2` files of Literata and EB Garamond italic (both under the OFL, which allows it), precached for offline use. They are split by script with `unicode-range`, never cut down: Latin with all its accents loads at once, other scripts (Greek, Cyrillic) only when a page uses them. No font CDN: a request to one would tell a third party that someone opened the app.
  *Updated 2026-11-07:* the fixed font files a PDF is set in, and the PDF code, are the exception: not installed, fetched on the first PDF (0019).
- Paging measures after `document.fonts.ready`, and again if a font arrives late, so page breaks do not shift after load.

## Dependencies
Each one is justified; nothing else without a reason recorded here.
- **Runtime:** `preact` (as React, 0002); ProseMirror's `model`, `state`, `view`, `history`, `keymap`, `inputrules` and `commands` (0003); `idb`, a small wrapper over IndexedDB; `fflate` for the export zip, loaded only when exporting or importing; `pdf-lib` and `@pdf-lib/fontkit` for a PDF, loaded only when the first one is made (0019).
- **Development:** `vite`, `vite-plugin-pwa`, `typescript`, `vitest`, `@playwright/test`, `pdfjs-dist` (which reads a PDF back in the end-to-end tests), and `fake-indexeddb` so the IndexedDB store and its migrations are tested in Vitest without a browser.
- No CSS framework: plain CSS with custom properties named after the DESIGN.md colours.
- `app/` has its own `package.json`; the root keeps only project tooling.

## State and URLs
- The domain exposes small stores that can be subscribed to. The UI reads them through `useSyncExternalStore`. No state library.
- URLs use the hash, so any static host works without setup: `#/` is the library, `#/p/<pieceId>` a piece. No router library.
- Sheets and the Time Machine have no URL, but each adds a history entry, so Android's back button closes it instead of leaving the app.
