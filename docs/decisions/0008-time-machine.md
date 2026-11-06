# 8. The Time Machine: how it opens and what it shows

Date: 2026-10-27 · Status: accepted

*Updated 2026-11-06:* DESIGN.md and the Ready frames now hold how it looks, and win where this record differs. There is no *Contents* or *Days* at the top right: the running head opens them, and ✕ in the moment bar goes back to now. The scrubber below is the tape.

## Decision
- Opens from the Time Machine button in the tools bar, or a keyboard shortcut. Nothing new on the writing page.
- Full screen, in place of the page: the text as it was at the chosen moment, laid out as the same pages, with a scrubber at the foot labelled in plain words ("Tuesday evening", "14 October").
- Actions: **Bring chapter / day / essay back** (a new version with the old text; nothing later is lost), **Bring part back** (inserts a selected passage) and **Keep a copy** (as a new essay). See The design below.
- No "what changed" view in v1. If one comes later, it stays simple and soft, nothing like a code diff.

## The design
*Added 2026-10-27.* DESIGN.md (The Time Machine) holds the screens' rules; these are the decisions behind them.
- **One moment, the whole piece.** The Time Machine stands at a point in time and pages through the whole piece as it was then, crossing chapters as reading does. The scrubber — a tape of ticks under a fixed hairline — steps through the moments when the section on screen changed, so a novel's timeline is not thousands of steps that change a chapter not on screen. (Revised the same day from "one section at a time", which left no way to reach another chapter but an unlabelled page count.)
- **Navigation at the top, actions at the foot.** *Contents* (or *Days*) sits at the top right, mirroring *Now*, and opens that sheet as it was. The foot holds only the moment, the tape and the two actions.
- **Bring … back names its scope** ("Bring chapter back", "Bring day back", "Bring essay back") and replaces that section only. It does not ask first: the text it replaces stays a version and is never thinned (0005).
- **Removed chapters come back through the outline.** *Contents* opens as it was at that moment, from the outline version of then, so a chapter removed since can be opened and brought back to its old place, with its old title.
- **Bring part back** inserts a selected passage where it stood, anchored like a reading place (paragraph, offset, a few words), or at the end of the section. It only inserts, so it needs no merging.
- **The shortcut is ⌘/Ctrl + Alt + Z.** ⌘/Ctrl + H and ⌘/Ctrl + Y open the browser's own history.
- **The page is shorter than the writing page.** *Added 2026-11-05.* The moment bar needs its room, so the old text keeps the column and the type on a page that ends above the bar, and its page breaks can differ from the writing page's. "The same pages" above means the same measure, not the same breaks. The Time Machine's layout never changes a piece's saved page counts.
- **Keep a copy stays one section** in v1. A copy of a whole book as it was is possible from the data (the outline then, plus each chapter's version then) and waits with the drafts work after dogfooding.

## Bringing a section back, in order
*Added 2026-11-06.* A section comes back by its id, whichever section the Time Machine stands on, so a chapter or a day works as an essay does. What protects the words is the order:
- **The page stores and is sealed first.** It stores what it holds, waits for any page still closing, and then writes nothing more, so its closing save can never write over what came back. If it cannot be sure in time, nothing is written and the bar says so with *Try again*. A sealed page that was not replaced saves again.
- **One transaction does the rest.** It writes the replaced text as a version marked as before a bring back, then the old text as a later version, and points the working copy at it. The marked version is stamped by the same rule as any moment (0005), and the working copy is never stamped earlier than it was, so words held in the unsaved journal that came before can never start the page or replay over what came back. Words held there that are newer than what is stored stop the bring back instead, and stay.
- **It writes nothing it should not.** It needs this window to hold the piece, asked inside the transaction. If the moment on screen has gone (another window's launch thinned it, which this window cannot stop), or the section already holds that text, nothing is written.
- **Then the page reopens** on that section, by name, at its opening page, with the line. The Time Machine's own failure leaves it where it was.

## Drafts in v1
*Updated 2026-11-05:* keep a copy is in v1 after all, as the moment bar has always drawn it; on 2026-11-04 the brief had moved it after daily use. It stays one section, and comparing drafts waits. It works like this:
- "Keep a copy" creates a **new essay piece** from the section being looked at (an essay, one journal day or one chapter), named for what it came from, like "Salt on the windows, draft 2". Its history starts now, with today's date, since a copy is a piece in its own right and its first moment is the day it was made (decided on 2026-11-06). The numbering goes up past any name in use, put-away pieces included, and an essay's copy is named from the title of that moment. It keeps no link back to where it came from in v1: the name says it, and the page stays quieter.
- No comparing or switching drafts inside one piece, and no merging, in v1.
