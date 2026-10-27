# 7. Export, import and tests

Date: 2026-10-27 · Status: accepted

## Export
- One click downloads everything as a zip: readable `.md` files usable with no app at all, the full history as `.md` files, put-away pieces in their own folder, and one small `index.json` that ties versions together. Each piece is a folder with one `.md` per section (a day, a chapter) plus the whole piece as one `.md`, and the history holds the section versions kept locally (0005).
- A single piece exports as Markdown or as PDF. PDF uses the browser's own "Save as PDF" with a print stylesheet; printed pages get fixed numbers and a book gets a contents page at the front (DESIGN.md). DOCX, EPUB and others come after dogfooding.

## Import
- Accepts our own export zip, restoring everything including history, and loose `.md` files, each becoming a new piece.
- **Never overwrites.** When ids collide, an identical copy is skipped and a different one is added as a new piece.

## Tests
- Vitest on the domain and the page module: making versions, rebuilding a piece at any moment from outline and sections, thinning never removing a protected version, bring back, keep a copy, put away and restore, export → import gives identical data, Markdown → DOM → Markdown gives identical text.
- A few Playwright flows: type, reload, the text is there; bring back an old version; export and import again.
- No unit tests for React components. Daily use covers the rest.
