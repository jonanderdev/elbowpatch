# 7. Export, import and tests

Date: 2026-10-27 · Status: accepted

## Export
- One click downloads everything as a zip: readable `.md` files usable with no app at all, the full history as `.md` files, put-away pieces in their own folder, and one small `index.json` that ties versions together. Each piece is a folder with one `.md` per section (a day, a chapter) plus the whole piece as one `.md`, and the history holds the section versions kept locally (0005).
- A chapter's file starts with `# Title`, so it reads well anywhere (0005).
- `index.json` carries a `formatVersion`. *Updated 2026-10-27.*
- A single piece exports as Markdown or as PDF. PDF uses the browser's own "Save as PDF" with a print stylesheet; printed pages get fixed numbers and a book gets a contents page at the front (DESIGN.md). DOCX, EPUB and others come after dogfooding.
  *Updated 2026-11-05:* a print stylesheet alone cannot do this. Only Chromium prints page numbers and running heads from CSS, and a contents page has to know where each chapter lands. So the app lays out the printed pages itself and draws each running head and page number on the page. Otherwise, pages would be unnumbered in Safari and Firefox.
  *Updated again 2026-11-05:* the app also makes the PDF file itself, with no print dialog. The browser sets the lines, hyphenation included, the app splits them into pages and writes those into a file. A print dialog is unproven in an installed iPhone app, where the writing happens, and that app's storage is its own, so sending the writer to Safari is no way out. It costs a dependency and fixed font files, kept out of the install and fetched on the first PDF export, so a first PDF export offline says so plainly. Characters the font does not have are drawn as small images, so nothing goes missing from a PDF. This replaces "Save as PDF" above.
- A single piece as Markdown is one `.md` file with no history: a book has a `# ` heading per chapter, and a journal a `# ` heading per day that carries the year (`# Monday 26 October 2026`), so the file can be read back across years. *Updated 2026-10-28.*
  *Updated 2026-11-05:* a book's or journal's file opens with its title as the `# ` heading and its subtitle as an italic line, and chapters and days become `## ` headings. A file with no title in it does not read well without the app, and a metadata block would be clutter in any plain text app. The cost: a `## ` line inside a chapter splits it if that one file is imported. A chapter's own file in the zip keeps its `# Title`.
- *Added 2026-11-05:* a PDF is always the whole piece; whatever prints it can choose a range. The paper is Letter or A4 by the device's region, with no choice in the sheet, because laying out pages means knowing the paper first. A journal's PDF leaves out empty days; a book keeps empty chapters, so its contents page matches the book. Only exporting everything counts as the last export.

## Import
- Accepts our own export zip, restoring everything including history, and loose `.md` files, each becoming a new piece.
- Reads older `formatVersion`s. A newer one is refused with a plain message, never half-imported.
- A chapter file's `# Title` line becomes the chapter's title.
- Markdown outside the v1 marks is kept exactly as written (0003).
- **Never overwrites.** When ids collide, an identical copy is skipped and a different one is added as a new piece.
- Loose `.md` files get a kind chosen before import, with a guess (DESIGN.md): two or more `# ` headings make a book, one chapter per heading; headings that all read as dates make a journal, one day per heading, always a **new** journal, never merged into one that exists; anything else, an essay. *Updated 2026-10-28.*
  *Updated 2026-11-05:* one `# ` heading followed by `## ` headings is a title with chapters or days, read by the same guess. Files written the old way still import.

## Tests
*Updated 2026-10-27:* real layout is tested in Playwright, not jsdom, which cannot lay out text.
- **Vitest** on `domain/` and the pure logic in `page/`: making versions, rebuilding a piece at any moment from outline and sections, thinning never removing a protected version, bring back, keep a copy, put away and restore, the working copy surviving a crash, database migrations, export → import gives identical data, Markdown → tree → Markdown gives identical text (unsupported Markdown included), and where page breaks fall given measured lines.
- **Playwright** in WebKit, Chromium and Firefox, at phone and desktop sizes:
  - layout of a few fixed texts: page breaks, a chapter starting on a fresh page, the caret across a page edge
  - flows: type, reload, the text is there; bring back an old version; export and import again.
- **Where the caret is painted**, checked by hand with `app/scripts/painted-caret.mjs`: a browser can paint the caret away from where it reports it (Firefox did, at page breaks and line ends), and the automated tests read only where it is reported. It compares the two step by step in all three engines; for Firefox it captures the window from the screen.
- No unit tests for UI components. Daily use covers the rest.
*Updated 2026-10-28:* Firefox joined the automated runs, and the painted-caret check was added.
