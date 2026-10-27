# 7. Export, import and tests

Date: 2026-10-27 · Status: accepted

## Export
- One click downloads everything as a zip: readable `.md` files usable with no app at all, the full history as `.md` files, put-away pieces in their own folder, and one small `index.json` that ties versions together. Each piece is a folder with one `.md` per section (a day, a chapter) plus the whole piece as one `.md`, and the history holds the section versions kept locally (0005).
- A chapter's file starts with `# Title`, so it reads well anywhere (0005).
- `index.json` carries a `formatVersion`. *Updated 2026-10-27.*
- A single piece exports as Markdown or as PDF. PDF uses the browser's own "Save as PDF" with a print stylesheet; printed pages get fixed numbers and a book gets a contents page at the front (DESIGN.md). DOCX, EPUB and others come after dogfooding.

## Import
- Accepts our own export zip, restoring everything including history, and loose `.md` files, each becoming a new piece.
- Reads older `formatVersion`s. A newer one is refused with a plain message, never half-imported.
- A chapter file's `# Title` line becomes the chapter's title.
- Markdown outside the v1 marks is kept exactly as written (0003).
- **Never overwrites.** When ids collide, an identical copy is skipped and a different one is added as a new piece.

## Tests
*Updated 2026-10-27:* real layout is tested in Playwright, not jsdom, which cannot lay out text.
- **Vitest** on `domain/` and the pure logic in `page/`: making versions, rebuilding a piece at any moment from outline and sections, thinning never removing a protected version, bring back, keep a copy, put away and restore, the working copy surviving a crash, database migrations, export → import gives identical data, Markdown → tree → Markdown gives identical text (unsupported Markdown included), and where page breaks fall given measured lines.
- **Playwright** in WebKit and Chromium, at phone and desktop sizes:
  - layout of a few fixed texts: page breaks, a chapter starting on a fresh page, the caret across a page edge
  - flows: type, reload, the text is there; bring back an old version; export and import again.
- No unit tests for UI components. Daily use covers the rest.
