# Design

The look of Elbowpatch. Builders follow this file. PROJECT.md §9 still applies: calm, analog, typography first, accessibility required.

## Sources of truth
- **This file** holds the direction and the rules: what the look is, why, and what it never does. It wins on principle.
- **The Figma file** holds the exact screens and components — every screen in paper and night, phone and desktop, built from shared components, colour variables and text styles: [Elbowpatch on Figma](https://www.figma.com/design/yRuD5MDnH3WHbNjqMEUPpB/Elbowpatch) — open to anyone to view. Builders take sizes, spacing, states and copy from there.
- **When they disagree,** the rule here wins until both are put right. A change to the look updates this file (if it changes a rule) and the Figma file (if it changes a screen) together, never one alone.
- The first prototype was retired on 2026-10-27: its screens live in the Figma file, its decisions in this file. Motion was never reviewed in it, so the timings below are proposals (see Motion).

## Direction
- leads: a minimalist e-reader page, in light and dark
- also: a book's chapter opening; focus by dimming at night; one round control that opens into a bar
- from: design exploration, 2026-10-26
- in one line: the calm of a minimalist e-reader — but you are writing it.
- take: The reader's page — a title placed like a chapter opening, a narrow column, generous leading, a page number at the foot. Paging is the model: the page fills, then you turn to the next one; no long scroll. Earlier paragraphs dim at night while the current one stays lit. Nothing else on the page.
- change: It is an editor, not a reader: pages form as you type and a new page begins when one fills, numbered like a book. The turn is a quiet slide, not a 3D paper curl. Reader features (search book, bookmarks, ratings, bylines) are gone; the only status is the page number, and the word count when the tools are open. White, black and grey only for now — no cream, no accent colour; more palettes later.
- ownable: The elbow patch, as the page button — one small round button at the bottom right whose face is the current page number. It is the only shaped mark on the page and the only way into the tools; tapped, it opens into the tools bar. The round shape may carry into the logo. No mustache, no pipe, no illustration. (Replaced the earlier oval page marker on 2026-10-26, after seeing it rendered in the prototype.)
- leave: Reader features; a 3D page curl; cream and amber; anything that reads like an existing writing app — monospace text, a signature accent colour.

## Colour

Two themes, both first-class. Paper follows light system appearance, night follows `prefers-color-scheme: dark`. Every pair below was checked with WCAG 2.x contrast.

### Paper
- #fbfbf9: the page — almost paperwhite.
- #1f1f1f: titles and body text. 15.91:1 (AAA). Also the focus ring (a mark, ≥ 3:1).
- #6e6e6e: secondary text (page number, word count, running head). 4.92:1 on the page, 5.10:1 on a surface (AA).
- #ffffff: surfaces — the page button, the tools bar, the settings sheet, the selection menu — lifted by a soft shadow and a 1px hairline edge.
- #e8e8e4: the hairline edge of a surface and the separator in the tools bar only — never text.
- #f1f1ee: a pressed or hovered button.
- #dcdcd6: text selection. Text on it 11.97:1.
- Paper does not dim earlier paragraphs.

### Night
- #0e0e0e: the page — a true black, slightly lifted.
- #e6e6e3: titles, the drop cap, the caret and the focus ring. 15.44:1 (AAA).
- #b5b5b2: body text. 9.39:1 (AAA).
- #8c8c8a: secondary text and dimmed earlier paragraphs. 5.73:1 on the page, 5.17:1 on a surface (AA) — dimming never goes below this.
- #1a1a1a: surfaces (as in paper), lifted by a deeper shadow.
- #2a2a2a: the hairline edge of a surface and the bar separator only.
- #242424: a pressed or hovered button.
- #3a3a38: text selection. Body on it 5.55:1, titles 9.12:1.

### Not defined yet
- Further palettes (sepia, a warm night) — later, as named themes.

## Type
- **Literata** (TypeTogether, OFL) for titles, body and labels: titles in a light display optical size, body in the text size.
- **EB Garamond italic** (Georg Duffner, OFL) for pull quotes only: a centred paragraph, larger than the text (1.36em, weight 400). Literata's italic is too upright to read as a quote at that size. Chosen on 2026-10-26 over Newsreader italic: it reads as italic at once, holds up on the night page, and gives the one bookish moment on an otherwise modern page.
- Nothing else: no sans, no mono for now.
- Both OFL: bundled in the app, self-hosted, default UI — covered.
- Literata was chosen because it was made for long reading on screens.
- **Body:** Literata at weight 360, 19px on desktop and 18px on a phone, line height 1.55, measure 34rem, old-style figures; paragraphs spaced by one line, no indent. Settings change these within fixed steps (see Control).
- **Title:** weight 300, optical size 60, 2.05 × the body size, line height 1.12, slightly tightened (−0.012em). Title only — no label above it naming the kind of piece (essay, journal) in v1.
- **Running head:** from page 2 on, the piece title in small italic (13px), centred at the top in secondary grey, like a book's running head.
- **Drop cap (optional):** the first letter of the piece, four lines deep, weight 600 (SemiBold), optical size 72, title colour, upright. (Three lines read too small, and at weight 500 the hairlines were light beside the text; both changed on 2026-10-27. An EB Garamond italic cap was tried and left: it broke the opening.) Where a browser lacks `initial-letter`, a floated letter of the same depth stands in.
- **Pull quote:** one paragraph, centred, with space above and below; no author line in v1.
- **Indented paragraphs (optional, off by default):** as in a printed book, each paragraph's first line steps in by 1.5em and the space between paragraphs goes. The first paragraph of a piece or chapter, and the one after a pull quote, start flush.
- **Italic in the text:** EB Garamond italic, as the pull quote — scaled to 1.17em so its x-height matches Literata's, with line-height 1 so it sits on the same baseline and never moves the leading. Bold in the text is Literata at 600.
- **Numbers in controls** (page button, word count) are lining and tabular, so they do not jump.
- **Thousands take a dot, European style:** 1.240 words, never 1,240.

## Control
- No filled button on the page, and no text in letter-spaced capitals. Tools appear only when summoned (PROJECT.md §4.1) and on selection, and leave when dismissed.
- **The page button:** a 44px circle at the bottom right, on a surface with a soft lift, showing the current page number (it grows into a pill past page 99). Its label for assistive tech says "Page N of M. Open tools". It shows one number only — the total appears when the tools are open.
- **The tools bar:** the page button opens into one rounded bar, in place: "3 of 12 · 1.240 words" in secondary grey, then icon buttons — Time Machine, text settings (Aa), paper / night (moon or sun), close. Escape or close folds it back into the button.
- **Icons:** one set, drawn for this app: 20px, 1.5px stroke, round caps and joins, current text colour — all the same colour, none highlighted. Icon buttons are 36px circles with a soft round pressed tint, no border — every round control is fully round.
- **Text settings:** a sheet over the page, applied live as you change it. Each setting is a segmented control, one row each: size (S / M / L), line spacing (tight 1.42 / normal 1.55 / loose 1.72), alignment (left / justified — icons), theme (Paper / Night, with a small swatch), measure (narrow 34rem / wide 40rem). Drop cap is one on/off switch; Indent paragraphs is another, off by default. "Done" closes it as a text link.
- Justified text always hyphenates.
- **Selection menu:** the same rounded bar, floating over the selected words: bold, italic, pull quote, § (start chapter here), and "keep this moment" (a Time Machine save).
- **Writing on a phone:** above the keyboard, the same bar: undo, redo, a separator, then bold, italic, pull quote, § (new chapter), hide keyboard. A phone has no reliable undo of its own, and moments are up to 5 minutes apart, so undo is on the bar. On desktop it stays ⌘/Ctrl + Z and ⌘/Ctrl + Shift + Z, with nothing on screen.
- **Keyboard up:** the page keeps its size. When the caret would go under the keyboard, the page slides up so the caret line sits just above the writing bar. *Library* and the running head stay, on a strip of page colour with a 44px fade under it (solid for its first 15%), so text leaving the top goes softly instead of meeting them; once the title has slid away, the running head carries it. This is the one fade on the page, only while the keyboard pushes it. Page numbers do not change when the keyboard comes up.
- **Moving around with the keyboard up:** drag the text up or down to see the part of the page behind the keyboard (the caret stays where it is); swipe sideways to turn pages; tap a word to move the caret there. "Hide keyboard" in the writing bar puts the keyboard down; return only ever makes a new paragraph. To go far — the start of the piece, another chapter, another day — tap the page button beside the writing bar: the tools open, and the page count opens Contents (or Days), all without leaving the keyboard.
- **§ is the chapter mark.** Set in Literata like B and I, it starts a new chapter in the writing bar and "starts chapter here" on a selection. Typing `#` at the start of a line does the same.
- **Back to the library:** the word *Library*, 13px, secondary grey, at the left of the running-head line, aligned with the text's left edge; it darkens on hover and has a 44px-tall tap area. A word, not an icon: an arrow felt generic and a pile-of-sheets glyph read as "copy". (Provisional: whether it should fade while writing is still open.)
- **Focus:** a 2px ring in the title colour, offset 2px, on every control, visible on keyboard focus only.

## Layout
- One page, one narrow column, generous leading. The page carries the design; nothing frames it — no hairline, no fade, no page dots at the foot. (The journal's left margin rule is the one exception; see The journal.)
- Page 1 opens with the piece title like a chapter, then the text. Later pages have the running head instead.
- Margins: 88px above the text and 96px below on desktop; 64px above and 92px below on a phone, 24px each side. With the keyboard up, the page keeps its size and slides up (see Control).
- Top left: *Library*. Bottom right: the page button. That is all the page carries besides the text; a long running title is cut short before it reaches *Library*.

## The library
- Where the app opens. "Library" set like a piece title; settings as one quiet icon button in the top-right corner.
- **Continue:** on top, the piece you were last in, as a compact open page — a surface with the soft lift, 16px corners: two lines from where you stopped (slightly smaller than the body, cut with "…"), then one line of *chapter* · book in secondary grey, and the page number in a 28px outlined patch at the right. The meta line never wraps: the book title is cut first, then the chapter. Tapping it opens the piece where you were. (Chosen on 2026-10-27, made compact after a first, taller version.)
- **Grouped by kind:** below it, the pieces under *Books*, *Journal* and *Essays*, each kind named once in small italic secondary grey (15px), most recent first within a kind. Groups breathe: 2.6em above each heading, 0.5em below it, so the gap between kinds is clearly larger than the gap between rows. The piece in Continue is not repeated in its group.
- Each piece is a row: its title (Literata, a little larger than the body) and a line in secondary grey — "6 chapters · 48 pages · 9 Oct" for a book, "214 days · nothing yet today" for the journal, "1.240 words · 25 Oct" for an essay. Rows are separated by space, not rules, with a soft rounded pressed tint.
- **Kinds have marks, not drawings:** typographic marks set in Literata, regular, as § is for a chapter — **&** for a book (and so on, chapter after chapter), **today's date with its ordinal** for the journal ("27th": the ordinal half size and raised, since Literata has no superior letters; it changes daily), **¶** (the pilcrow) for an essay. 19px in the new-piece bar (title colour, as its word), 16px before the word in each library group heading (secondary grey, as its word). (Chosen on 2026-10-27 from 36 marks Literata draws itself, over line drawings, which felt busier than §.)
- **New piece:** the round button at the bottom right, in the place of the page button, with a +. Tapped, it opens into a bar like the tools bar: Book, Journal, Essay — each its icon and its word — then a separator and close, where the + was. Choosing one opens its first page. A new piece left empty is not kept.
- The library fades in over the page (220ms; instant with reduced motion). The page behind is inert while the library shows.
- Empty: one calm line, "Nothing written yet."
- Main settings (account, global options, connectors) open from the library only, never from the page.

## Books and chapters
- A book is one piece made of chapters. A chapter starts on a fresh page with its title set like page 1's, and no running head on that page — as a printed book does. Later pages carry the chapter title as their running head.
- A new chapter's title shows "Chapter title" in secondary grey until written, then "Begin anywhere."
- The page button keeps counting the whole book.
- **Contents:** tapping "18 of 48" in the tools bar opens a sheet like text settings: "Contents" and the book's page count, then each chapter with the page it starts on (right, tabular, secondary). The current chapter has the soft pressed tint. "§ New chapter" and "Done" are text links at its foot. Contents is a sheet, never a page in the book, so page numbers do not shift while writing; on export a contents page is printed at the front.

## The journal
- A journal is one piece; each day begins on a fresh page with the date as its title ("Monday 26 October"). The date is not editable — an entry with its own title is an essay. The journal's own name ("Journal", "Dream journal") is edited in the library.
- Opening the journal lands on today. Turning back goes to earlier days. A long day runs onto the next page, with the date as the running head.
- **The margin:** the journal alone has a hairline (the surface-line colour) down the left margin, from top to bottom. On a phone it sits 24px from the edge and the text starts at 44px; on desktop it sits 44px left of the text. A deliberate exception to "nothing frames the page", for the journal only.
- **The day's words** sit at the foot, upright, 12px secondary: "312 words" at the text's left edge, level with the page button on the right. Not rotated, not beside the title. (Chosen on 2026-10-27 over a count beside the title, which sat at no clear line.)
- **The way in:** "26 Oct · 312 words" in the tools bar opens a Days sheet as a **month** (in the MVP; changed on 2026-10-27 from a list): the month and year between two arrow icon buttons for the months before and after, a seven-column grid under one-letter weekday initials (12px, secondary), each day a round button — written days in the title colour at weight 560, today with the pressed tint and a hairline ring, days still to come disabled. At the foot, "19 days written in October" (13px, secondary) and "Done". Each day is labelled for assistive tech ("26 October, written").
- The same sheet is also drawn as a list in the Figma file, as an alternative not in the MVP: "Days" and how many are written, the month in italic, then each written day with its word count, today first ("nothing yet" until begun).

## The Time Machine
Designed on 2026-10-27. How it opens and what one version holds are in docs/decisions/0008 and 0005.
- **One moment, the whole piece:** the Time Machine stands at a point in time and shows the whole piece as it was then. Turning pages crosses chapters (or days) as reading does; a chapter that did not exist then is not there. The tape steps through the moments when the section on screen changed, so every step shows a difference; turning into another section keeps the same time and shows that section as it was then.
- **The way in:** the Time Machine icon in the tools bar, or ⌘/Ctrl + Alt + Z (a step further back than undo). It takes the place of the page and opens on the most recent moment that differs from now, so the first thing seen is already the past.
- **The past reads by its frame, never by its text:** the old text keeps full contrast — no tint, no grey, no caret, and night does not dim earlier paragraphs. *Library* becomes *Now* (same place, same style), which goes back to the present, as does Escape. The page button is gone; the moment bar takes the foot.
- **The head:** the running head does its usual job — the chapter title in a book, the date in a journal, the essay's title after page 1. At the top right, mirroring *Now*: *Contents* in a book, *Days* in a journal, which open that sheet **as it was at that moment**, above the moment bar. An essay has nothing there. Navigation sits at the top; what you can do with the moment sits at the foot.
- **The moment bar:** one rounded surface, like the tools bar. Full width less 16px each side on a phone; centred at the column's width on desktop. Three parts, top to bottom:
  - **The moment**, named in plain words, Literata italic 15px, title colour: "Sunday evening".
  - **The tape:** one 1px tick per moment, evenly spaced (about 11px; up to 44px when there are few, so the tape spreads across the bar), sliding under a fixed 1.5px hairline in the title colour that marks this moment. The right end is now; the tape is as long as the history, and older moments come in from the left. Kept moments ("keep this moment") are ticks in the title colour; the rest are secondary. Labels (12px, secondary) sit under taller ticks and change unit with age, as thinning does: hours today ("9:00", "13:00", "Now"), weekdays within the week ("Sat", "Mon"), dates within the year ("16 Oct"), months before ("Sep"). A label that would meet its neighbour is left out, as on a ruler. The tape fades at its edges to show it goes on; labels never fade.
  - **The actions:** two equal halves, 44px tall, split by the bar separator: *Bring … back* and *Keep a copy*, in the title colour.
  - The tape is dragged or swiped itself, glides and settles on a tick; a tap on a tick goes to it. No arrows.
- **Bring … back** names what it replaces: *Bring chapter back* in a book, *Bring day back* in a journal, *Bring essay back* in an essay. Nothing else in the piece changes. It does not ask first, because nothing is lost: it closes onto the page with the old text in place, and a calm line shows at the foot for a few seconds (two lines on a phone) — "Chapter 3 brought back from Sunday evening. The rest of the book is as it was." The text it replaced stays a moment, never thinned.
- **Removed and renamed chapters:** Contents as it was lists the chapters of that moment under their titles of that moment; a chapter removed since carries "removed since" in secondary where its page number would be. It opens like any other, and *Bring chapter back* puts it back in its old place — or at the end, if the chapters around it are gone — with its old title. Contents as it was has no "§ New chapter": the past is read-only.
- **Bringing back a part:** the old text is read-only but selectable. A selection shows a bar with two words: *Bring part back* and *Copy*. Bringing a part back returns to now and inserts the passage where it stood — after the paragraph that came before it, found as a reading place is (paragraph, offset, a few words), or at the end of the section if that paragraph is gone. It arrives as its own paragraph, left selected so it can be moved or trimmed, and one undo removes it. It never replaces or merges anything. Its line: "Brought back from Sunday evening."
- **Keep a copy** copies the section only and opens the copy at once as a new essay ("Chapter 3, draft 2"), with one line: "A copy of Sunday evening, kept as a new essay." The piece it came from is untouched. Copying a whole book as it was is after the MVP.
- **Nothing earlier:** the bar holds one line, "Nothing earlier yet. Moments are kept as you write." — no tape, no actions.
- **Dates in plain words:** "Just now" under a minute; "12 minutes ago" within the hour; "This afternoon, 14:05" today; "Yesterday evening, 21:10"; "Sunday evening" within the week; "14 October" this year; "14 October 2025" before. A 24-hour clock. Morning 5–12, afternoon 12–18, evening 18–23, night 23–5.
- **Moving around:** sideways swipe on the page, Page Up / Page Down, Alt + ← / →, the wheel and the side margins still turn pages of the old text; swipes on the tape move the tape. The tape is a slider: ← / → step a moment when it has focus, Home goes to the oldest, End to now.
- **For assistive tech:** the tape is a slider whose value is the full date ("Sunday 25 October, 21:10"); a change of moment is announced, as a page turn is.

## Settings
- Opened from the library only. The same view as the library: "Settings" set like a piece title, *Library* at the top left to go back. Each area is a row that says what it is set to: Writing ("Medium · normal spacing · narrow · left"), Appearance, Time Machine ("Thinned with age · 14 MB"), Backup & sync ("GitHub · last copy 2 minutes ago"), Export, About & privacy.
- Each area is its own view, its name as the title and *Settings* at the top left to go back. On desktop, the areas are words on the left (the open one with the pressed tint) and the open area on the right.
- **Writing:** defaults for new pieces, with the text settings' segmented controls and the drop cap switch. Each piece can still change its own in Aa.
- **Backup & sync:** one sentence on where the writing lives. **One place at a time:** the connected place is a surface at the top — its name, "Copying here · last copy 2 minutes ago · as you write" and "Copy now". Other places sit below under *Use another place instead*, each with "Switch" (or "Not available yet"). Switching asks once in a sheet — "Copy to Dropbox instead? GitHub stops receiving copies. Everything already there stays" — with "Keep GitHub" and "Switch to Dropbox". "Disconnect" is a text link in the note under the list. Every action is a word; no filled button. No Git words, apart from the provider's own name.
- Nothing connected: the sentence says plainly that the writing lives only in this browser, and that clearing it loses everything; "Connect" sits beside GitHub.
- **Time Machine:** nothing to set in v1. One sentence on how moments are kept — "A moment is kept every 5 minutes while you write, and whenever you stop. After an hour, one an hour is kept for a day, then one a day for a month, one a week for a year, and one a month after that. Moments you keep are never thinned." — and the space they use. No "keep everything" switch: it would be the one setting that fills the browser's storage.

## Patterns
- Patterns to follow: settings as a quiet sheet over the page, applied live; a single round control that opens into a bar; themes named for a mood, not a hex; writing tools on the selection, not in a toolbar; a calm one-line serif sentence for empty and closing states.

## Behaviour
- **Paging, not scrolling.** Writing fills a page; the next page begins when it is full and the view turns to it. Page breaks re-flow as text changes.
- **Turning a page** (decided 2026-10-27):
  - **Phone:** swipe sideways — left for the next page, right for the one before. No tap zones at the edges: a tap in the text places the caret, and the 24px side margin is too narrow to tell the two apart. A vertical drag is kept for seeing what is behind the keyboard (see Control).
  - **Desktop:** Page Up / Page Down or Alt + ← / →; a two-finger swipe sideways on a trackpad; a scroll of the wheel or trackpad turns **one page per gesture** (a gesture is one continuous scroll, so a long flick still turns one page), because people scroll by habit; and a click in the wide side margins turns back (left) or forward (right) — they are hundreds of pixels wide there, so they never meet the text.
  - Each turn is the same quiet slide, and is announced to screen readers.
- **A page is what fits the screen** at the current text settings — not a fixed book page. Larger text makes more pages, never a scroll, so nothing ever slides under the head or the foot and no fade is needed. Chosen on 2026-10-27 over a fixed book page, which on a phone means scrolling inside every page and text cut at the edges.
- **Page numbers are for orientation, not addresses.** They follow the screen, as on an e-reader: page 18 on a phone is not page 18 on a desktop. Finding things is by chapter (Contents) and by date (journal), never by page number. Fixed, printable numbers come only from the export.
- **Your place travels with the piece.** The app keeps where you were: the caret if you were writing, otherwise the first line on screen — as a paragraph, an offset and a few words of its text, so it survives edits made elsewhere (if the words are gone, the nearest paragraph). With a connected place this goes with the piece, so another device opens on the page that holds it, caret restored. The most recent position wins; it is only a position, nothing is lost.
- **The turn** is a quiet horizontal slide (timing in Motion). With `prefers-reduced-motion` it is an instant cut. A page change is announced to screen readers; typing is not.
- **Night focus:** paragraphs before the current one dim to #8c8c8a; the current paragraph stays at body colour. Never dimmer than 4.5:1. Paper does not dim.
- **The tools bar** opens out of the page button and folds back into it.
- Settings and the theme are remembered; until the writer picks, the theme follows the system.

## Motion
Proposed, **not yet reviewed** — carried over from the first prototype, where motion was never checked. Decide each before it is built; these are starting points, not rules.
- What moves: the page turn (a horizontal slide), the tools bar opening out of the page button and folding back, the library fading in over the page, sheets (text settings, Contents, Days, confirmations) appearing over the page, the night dimming as the caret moves between paragraphs, the theme changing, the page sliding up when the keyboard comes, and the Time Machine opening and changing moment.
- Starting values: the turn 460ms ease-out; the tools bar opening 340ms from the 44px circle; the library fade 220ms; colour changes (theme, night dimming) 300–400ms; presses 160ms; the Time Machine opening and closing as a 220ms cross-fade; a change of moment a 120ms fade in place — never a slide, so it never reads as a page turn; the tape follows the finger, then glides and settles on the nearest tick.
- Fixed already: one quiet kind of motion, never a 3D paper curl; with `prefers-reduced-motion` every move is an instant cut; nothing moves while you type except the page turning when it fills.

## Imagery
- None in the interface. Photos inside a piece are allowed only when cleanly placed and shaped — small, framed, beside or between paragraphs, never full-bleed. Not designed yet: see Gaps.
- **The mark:** § in Literata at display size — the chapter mark already on the page. The app icon is § in paper white on the night black; a paper version (dark § on paper) serves light places. The wordmark is § then "Elbowpatch" in the title's face (Literata Light). Both are in the Figma file. The README uses the paper wordmark card (dark ink on paper, 16px corners), outlined as `docs/brand/wordmark.svg`.

## Gaps
Open — treat as undesigned, not as solved by a familiar pattern:
- The writing state on a real phone: designed (keyboard up, writing bar), but never tested with a real keyboard, or with editing in the middle of a long piece.
- Motion: proposed, not reviewed (see Motion).
- The Time Machine: designed (see The Time Machine), but the tape has not been tried in the hand — its glide and settle, and a history of a year; whether a passage brought back lands in the right place after heavy edits needs a test once the page is built.
- Settings areas not yet drawn: Appearance, Export, About & privacy.
- Reordering chapters and Collections (folders) are after the MVP.
- A photo placed inside a piece.

Paged writing is new ground: typing on a paged page, a phone keyboard, Markdown, an empty first page and a long title being written all still need designing.

## Do not
- Scroll a long page endlessly; page it.
- Fade over readable text, or add a hairline, fade or dots at the foot of the page. (The one exception: the short fade under the head while the keyboard pushes the page up.)
- Use a 3D paper curl, page textures, parchment, typewriter fonts, quills, or any old-writer illustration in the interface.
- Add an accent colour, cream, or amber in this pass.
- Add a third font family without a reason recorded here.
- Label the kind of piece above the title, or credit a pull quote, in v1.
- Put a filled button on the page, or reader features (search book, bookmarks, ratings, bylines).
- Use any text colour below 4.5:1 on its page.
- Use Git words in the UI (PROJECT.md §3): say moments, drafts, bring this back.
- Borrow another product's name, typefaces or colours.
