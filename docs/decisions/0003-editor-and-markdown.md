# 3. Editor: ProseMirror on our own paged view, Markdown stored

Date: 2026-10-27 · Status: accepted

## Context
The page is paged, not scrolled (DESIGN.md, Behaviour): a page is what fits the screen at the current text settings.

*Updated 2026-10-27:* the first version of this decision was our own editor on a bare `contenteditable`, because editor libraries are built around a scrolling viewport. That holds for code editors, not for ProseMirror: it is a `contenteditable` with a strict schema and leaves layout to us. Our own editor would have meant owning undo after our code changes the text, cleaning up pasted HTML, and phone keyboards that compose words before we can see them.

## Decision

### The editor
- **ProseMirror** is the editing surface. Paging is ours.
- The editor holds **one section**: the chapter, the day or the essay being written (0005). Other sections are laid out read-only when you turn to them.

### Paging
- The section is laid out in **CSS columns, one column per page**, and the view slides by a page width. The browser keeps caret, selection and keyboard behaviour across pages.
- A chapter or a day starts on a fresh page with `break-before: column`.
- The current page and its neighbours are shown. Typing past the end of a page turns to the next one.
- A turn changes the column container's scroll position, never a `transform`, so the browser's and the editor's own "keep the caret visible" work with it, not against it. ProseMirror's `handleScrollToSelection` is where the editor asks for a turn: typing past the end, an undo far back and a jump to a found word all turn the page through it, with the same slide.
- Page counts of the other sections are measured off screen when the app is idle, and cached by section version, text settings and screen size. The tools bar shows the total once it is known; the page button never waits for it.
- **The limit:** typing stays smooth on a mid-range Android phone in a 10,000-word chapter. If it does not, the editor holds only a window of three pages, and this decision is amended.

### Markdown
- **Only Markdown is stored, snapshotted and exported.** HTML exists on screen only. `domain/markdown.ts` reads and writes a small tree of blocks and marks (0009); `page/` maps that tree to and from ProseMirror.
- v1 marks, matching DESIGN.md: paragraphs, `*italic*`, `**bold**`, `> ` a pull quote. Chapter titles are fields, not Markdown (0005).
- Writers never need Markdown. The selection menu and the writing bar are the way to format; typing `*`, `**` or `> ` converts as you type, as a shortcut. In a book, `# ` at the start of a line starts a new chapter and moves that line into its title. In a journal or an essay a `#` typed at the start of a line is ordinary text, stored escaped (`\#`).
- **Markdown outside the v1 marks is kept exactly as written**, shown as plain text with its symbols visible. It is never dropped, rewritten or escaped, so an imported file loses nothing. Escaping applies only to what is typed in the editor.
- **Pasting** keeps bold and italic; everything else, headings included, becomes plain paragraphs. Pasted plain text is read as Markdown with the same rules as typing.
- Lists, links, images, tables and code come later.
- *Updated 2026-10-28:* what Markdown cannot hold is not offered. A line break (Shift + Return) is refused at the start of a paragraph and straight after another; an empty paragraph left as spacing is only space, and is gone on the next open. Words are never touched by either.

### Language
- Each piece has a language (`lang`), taken from the browser's when the piece is made, and set on its page. Hyphenation (justified text always hyphenates) and spellcheck follow it, so a Spanish journal is hyphenated as Spanish. Changing it in Aa comes later; the field is there from day one.

### Undo
- One undo history per section, grouped by pauses in typing. It survives page turns and switching to another chapter and back, and lasts until reload. A line becoming a chapter is one step.
- Anything older than the session is the Time Machine's job.

## Consequences
- ProseMirror is the largest dependency; its size is measured when it is installed.
- We own the paging and the Markdown ↔ tree conversion, so both get tests (0007).
- A selection cannot cross from one chapter into the next.
