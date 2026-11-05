# 3. Editor: ProseMirror on our own paged view, Markdown stored

Date: 2026-10-27 · Status: accepted

## Context
The page is paged, not scrolled (DESIGN.md, Behaviour).

*Updated 2026-10-30:* a page was what fits the screen at the current text settings, so page breaks moved with every window size, the keyboard and rotation. A page now has a fixed size (DESIGN.md, Layout): one for phones (390 × 826) and one for larger screens (540 × 834, a paperback page). The screen only scales the page, by one CSS size factor that multiplies the type, the margins and the page's size — never a `transform` — so a page holds the same words on every screen of its kind. What sits around the page (the controls, the space to the screen's edges) is not scaled. *Updated again 2026-10-30:* on a phone the page fills the screen's width and the screen's height sets how many lines it holds, so phone breaks follow the phone's height (never the keyboard); the fixed page, fitted to Safari's height, left the text narrow and small.

*Updated 2026-10-27:* the first version of this decision was our own editor on a bare `contenteditable`, because editor libraries are built around a scrolling viewport. That holds for code editors, not for ProseMirror: it is a `contenteditable` with a strict schema and leaves layout to us. Our own editor would have meant owning undo after our code changes the text, cleaning up pasted HTML, and phone keyboards that compose words before we can see them.

## Decision

### The editor
- **ProseMirror** is the editing surface. Paging is ours.
- The editor holds **one section**: the chapter, the day or the essay being written (0005).
- *Updated 2026-11-04:* other sections were to be laid out read-only when you turn to them. Instead, turning past a chapter's end opens the chapter next to it: its opening page going on, its last page going back. It is the same path as choosing a chapter in Contents, so the chapter being left is saved first and the place follows the writer, and a window that is not writing can turn through the book too. The page holds one section, and opening the neighbour reuses all of that, with less to go wrong. The caret goes where any turn leaves it, inside the new chapter, and a selection stops at its chapter's end. The cost: the page is replaced, so this turn is always a cut, never a slide, with or without reduced motion. If that does not feel right on a phone, this is the decision to revisit. A journal's days do not turn this way yet.

### Paging
- The section is laid out in **CSS columns, one column per page**, and the view slides by a page width. The browser keeps caret, selection and keyboard behaviour across pages.
- A chapter or a day starts on a fresh page with `break-before: column`.
- *Updated 2026-10-31:* the text itself is the column box, one box as wide as all its pages (the pager sets its width as pages come and go). Split across the columns of a box around it, as it was, the editable text had one box per page, and iOS places and draws the caret only within the first: on page 2 onwards a tap moved no caret, a double tap selected no word, and the caret was not drawn. The titles (a title page, a chapter's or a day's title, an essay's) sit over the text instead of in its flow, and the text keeps room for them at its start, a `::before` and not a node, so no caret or selection can land in it.
- The current page and its neighbours are shown. Typing past the end of a page turns to the next one.
- A turn changes the column container's scroll position, never a `transform`, so the browser's and the editor's own "keep the caret visible" work with it, not against it. ProseMirror's `handleScrollToSelection` is where the editor asks for a turn: typing past the end, an undo far back and a jump to a found word all turn the page through it, with the same slide.
- Page counts of the other sections are measured off screen when the app is idle, and cached by section version, text settings and screen size. The tools show the total once it is known; the folio (the page number at the foot) never waits for it.
- *Added 2026-10-30:* each section's page count, as last laid out, is kept with the piece, once for the phone's page and once for the desktop's (`Piece.pages`), so the library shows a book's pages without laying it out. It is not a change to the piece: it keeps its date and makes no moment.
- *Updated 2026-11-04:* a book's numbers are the whole book's, and never a guess. A chapter's start page is the sum of the counts before it, the title page being part of chapter 1. While an earlier chapter's count is unknown its start page, the folio and the page in the tools stand aside, and the total while any chapter's is: a folio from a partial sum would be a wrong number, so "the folio never waits" above now means it never waits for the total, only for the chapters before it. The tools then say what is known, down to the words alone.
- *Updated 2026-11-04:* the counts are not cached by version and settings. A count is either known or absent, so everything that reads one is simply right or stands aside. Chapters with no count are measured one at a time, in every book in the library, the open book first, once the writer has paused for 1.5 seconds and the app is idle. Measuring builds the same elements as the page, without an editor, and takes them away in the same task, so it is never painted. A change to the text settings forgets the counts of every book on both screens at once, and the text settings they were counted at are kept on this device, so a change the app did not see through is found at the next launch. An export's counts stay behind on import: they belong to the screen and the text settings it left.
- *Updated 2026-11-05:* the writer's place keeps the page in its chapter and whose page that was. The library adds the chapter's start page, so *Where you left off* agrees with the folio, and shows no number while that start page is unknown, on the other screen's page, after a rejoin until the page has opened, or at new text settings. The text settings' change is recorded only once the old counts are forgotten, so one not seen through is found at the next launch.
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
- *Updated 2026-11-05:* undo crosses a split. The page is made anew for each section, so a section's history waits in memory while its page is closed, and comes back only onto the very text it ended on. A chapter born of a split remembers that for the session, with how the two halves met. Undo steps back through what was typed in it, in the text or in its title, and past its first step rejoins it: the text goes back onto the end of the chapter before it, where the halves meet the paragraph is one paragraph and a mark one mark, a title taken from a `# ` line returns as an escaped `\# ` line, the section leaves the current outline, and the chapter before it opens with the caret at the join. A moment comes before and after, so its versions stay and earlier outlines still list it. A title the writer gave the chapter since returns as such a line too, so no word goes.
- Undo rejoins only a chapter holding the text the split gave it, right after the chapter it came from. With a chapter added between them, or words left that undo cannot reach, it stays a chapter.
- A split ends the history of the chapter it shortens: its steps hold the whole text, and replayed on either half they would double the words. A rejoin ends both chapters' histories in the same way, and cannot be redone. After a reload a split chapter is simply a chapter.
- A split or a rejoin is refused, with the text as it was, unless every page closed before it has finished: a closing save landing afterwards would replace the reshaped text. So is a rejoin while words newer than the chapter it joins wait in the unsaved journal, since the joined text would be stamped newer and shut them out. They come back when that chapter opens, and undo can rejoin it once they are stored.
- What goes back is what stood at the split only while it still does. New words on the end of the earlier chapter stand apart from what returns, and a `# ` line returns with its marks while the title still reads the same.
- Anything older than the session is the Time Machine's job.

## Consequences
- ProseMirror is the largest dependency; its size is measured when it is installed.
- We own the paging and the Markdown ↔ tree conversion, so both get tests (0007).
- A selection cannot cross from one chapter into the next.
