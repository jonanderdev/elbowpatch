# 11. Fonts, dependencies, state and URLs

Date: 2026-10-27 · Status: accepted

## Fonts
- The app serves its own `woff2` files of Literata and EB Garamond italic (both under the OFL, which allows it), precached for offline use. They are split by script with `unicode-range`, never cut down: Latin with all its accents loads at once, other scripts (Greek, Cyrillic) only when a page uses them. No font CDN: a request to one would tell a third party that someone opened the app.
- Paging measures after `document.fonts.ready`, and again if a font arrives late, so page breaks do not shift after load.

## Dependencies
Each one is justified; nothing else without a reason recorded here.
- **Runtime:** `preact` (as React, 0002); ProseMirror's `model`, `state`, `view`, `history`, `keymap`, `inputrules` and `commands` (0003); `idb`, a small wrapper over IndexedDB; `fflate` for the export zip, loaded only when exporting or importing.
- **Development:** `vite`, `vite-plugin-pwa`, `typescript`, `vitest`, `@playwright/test`, and `fake-indexeddb` so the IndexedDB store and its migrations are tested in Vitest without a browser.
- No CSS framework: plain CSS with custom properties named after the DESIGN.md colours.
- `app/` has its own `package.json`; the root keeps only project tooling.

## State and URLs
- The domain exposes small stores that can be subscribed to. The UI reads them through `useSyncExternalStore`. No state library.
- URLs use the hash, so any static host works without setup: `#/` is the library, `#/p/<pieceId>` a piece. No router library.
- Sheets and the Time Machine have no URL, but each adds a history entry, so Android's back button closes it instead of leaving the app.
