# 3. Editor: our own paged contenteditable, Markdown stored

Date: 2026-10-27 · Status: accepted

## Context
The page is paged, not scrolled (DESIGN.md, Behaviour): a page is what fits the screen at the current text settings. Code-editor libraries are built around a scrolling viewport and would be fought at every turn.

## Decision
- Our own editor on `contenteditable`, as in the prototype, rewritten in TypeScript. Native caret, selection, spellcheck, IME and phone keyboard come for free.
- Pages are the size of the screen. Paging is done by measuring where the text falls.
- **Only Markdown is stored, snapshotted and exported.** HTML exists on screen only. The editor turns its DOM into Markdown on change, and Markdown back into DOM on load.
- v1 Markdown, matching the marks in DESIGN.md:
  - paragraphs
  - `# ` at the start of a line: a chapter (the § mark)
  - `*italic*`, `**bold**`
  - `> `: a pull quote
- Lists, links, images, tables and code come later.

## Consequences
- We own the paging and the DOM↔Markdown conversion, so both get round-trip tests (0007).
- Fewer elements means fewer cases where something has to split across a page break.
