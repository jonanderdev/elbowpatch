# Design

The look of Elbowpatch. Builders follow this file. PROJECT.md §9 still applies: calm, analog, typography first, accessibility required.

To see it working: `prototype/` (open `index.html`; `screens.html` has the still frames). The prototype shows this file; it does not define it. Where they differ, this file wins, and the prototype is fixed to match.

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
- **Drop cap (optional):** the first letter of the piece, three lines deep, weight 500, optical size 72, title colour.
- **Pull quote:** one paragraph, centred, with space above and below; no author line in v1.
- **Numbers in controls** (page button, word count) are lining and tabular, so they do not jump.

## Control
- No filled button on the page, and no text in letter-spaced capitals. Tools appear only when summoned (PROJECT.md §4.1) and on selection, and leave when dismissed.
- **The page button:** a 44px circle at the bottom right, on a surface with a soft lift, showing the current page number (it grows into a pill past page 99). Its label for assistive tech says "Page N of M. Open tools". It shows one number only — the total appears when the tools are open.
- **The tools bar:** the page button opens into one rounded bar, in place: "3 of 12 · 1,240 words" in secondary grey, then icon buttons — Time Machine, text settings (Aa), paper / night (moon or sun), close. Escape or close folds it back into the button.
- **Icons:** one set, drawn for this app: 20px, 1.5px stroke, round caps and joins, current text colour — all the same colour, none highlighted. Icon buttons are 36px circles with a soft round pressed tint, no border — every round control is fully round.
- **Text settings:** a sheet over the page, applied live as you change it. Each setting is a segmented control, one row each: size (S / M / L), line spacing (tight 1.42 / normal 1.55 / loose 1.72), alignment (left / justified — icons), theme (Paper / Night, with a small swatch), measure (narrow 34rem / wide 40rem). Drop cap is one on/off switch. "Done" closes it as a text link.
- Justified text always hyphenates.
- **Selection menu:** the same rounded bar, floating over the selected words: bold, italic, pull quote, and "keep this moment" (a Time Machine save).
- **Writing on a phone:** above the keyboard, the same bar: bold, italic, pull quote, hide keyboard.
- **Back to the library:** the word *Library*, 13px, secondary grey, at the left of the running-head line, aligned with the text's left edge; it darkens on hover and has a 44px-tall tap area. A word, not an icon: an arrow felt generic and a pile-of-sheets glyph read as "copy". (Provisional: whether it should fade while writing is still open.)
- **Focus:** a 2px ring in the title colour, offset 2px, on every control, visible on keyboard focus only.

## Layout
- One page, one narrow column, generous leading. The page carries the design; nothing frames it — no hairline, no fade, no page dots at the foot.
- Page 1 opens with the piece title like a chapter, then the text. Later pages have the running head instead.
- Margins: 88px above the text and 96px below on desktop; 64px above and 92px below on a phone, 24px each side. With the keyboard up, the page ends above the writing bar.
- Top left: *Library*. Bottom right: the page button. That is all the page carries besides the text; a long running title is cut short before it reaches *Library*.

## The library
- Where the app opens: the list of pieces (essays, novels, journals — no types shown in v1).
- "Library" set like a piece title; settings as one quiet icon button in the top-right corner (the settings themselves are not designed yet).
- Each piece is a row: its title (Literata, a little larger than the body) and "1,240 words · 25 Oct" in secondary grey, most recent first. Rows are separated by space, not rules, with a soft rounded pressed tint.
- New piece: the round button at the bottom right, in the place of the page button, with a +. A new piece left empty is not kept.
- The library fades in over the page (220ms; instant with reduced motion). The page behind is inert while the library shows.
- Empty: one calm line, "Nothing written yet."
- Main settings (account, global options, connectors) open from the library only, never from the page.
- Patterns to follow: settings as a quiet sheet over the page, applied live; a single round control that opens into a bar; themes named for a mood, not a hex; writing tools on the selection, not in a toolbar; a calm one-line serif sentence for empty and closing states.

## Behaviour
- **Paging, not scrolling.** Writing fills a page; the next page begins when it is full and the view turns to it. Turn pages by swipe, arrow keys, Alt + ← / → or Page Up / Page Down. Page breaks re-flow as text changes.
- **The turn** is a quiet horizontal slide (460ms, ease-out). With `prefers-reduced-motion` it is an instant cut. A page change is announced to screen readers; typing is not.
- **Night focus:** paragraphs before the current one dim to #8c8c8a; the current paragraph stays at body colour. Never dimmer than 4.5:1. Paper does not dim.
- **The tools bar** opens out of the page button and folds back into it.
- Settings and the theme are remembered; until the writer picks, the theme follows the system.

## Imagery
- None in the interface. Photos inside a piece are allowed only when cleanly placed and shaped — small, framed, beside or between paragraphs, never full-bleed. Not designed yet: see Gaps.
- The logo is the user's own; the round page button may inform it.

## Gaps
Open — treat as undesigned, not as solved by a familiar pattern:
- The writing state on a real phone: the prototype draws the keyboard and writing bar, but it has not been tested with a real keyboard, or with editing in the middle of a long piece.
- Pull quote, bold, italic and "keep this moment" are designed (selection menu, writing bar) but not yet working in the prototype.
- The Time Machine / history view (the differentiator).
- Main settings, opened from the library.
- Chapters: proposed — the page count in the tools bar opens a contents sheet (chapters and the page each starts on; "New chapter" at its end, and "start chapter here" on selection); a chapter starts on a fresh page with its title set like page 1's. Not built.
- A photo placed inside a piece.

Paged writing is new ground: typing on a paged page, a phone keyboard, Markdown, an empty first page and a long title being written all still need designing.

## Do not
- Scroll a long page endlessly; page it.
- Fade over readable text, or add a hairline, fade or dots at the foot of the page.
- Use a 3D paper curl, page textures, parchment, typewriter fonts, quills, or any old-writer illustration in the interface.
- Add an accent colour, cream, or amber in this pass.
- Add a third font family without a reason recorded here.
- Label the kind of piece above the title, or credit a pull quote, in v1.
- Put a filled button on the page, or reader features (search book, bookmarks, ratings, bylines).
- Use any text colour below 4.5:1 on its page.
- Use Git words in the UI (PROJECT.md §3): say moments, drafts, bring this back.
- Borrow another product's name, typefaces or colours.
