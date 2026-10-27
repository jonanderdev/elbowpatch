# 8. The Time Machine: how it opens and what it shows

Date: 2026-10-27 · Status: accepted

## Decision
- Opens from the Time Machine button in the tools bar, or a keyboard shortcut. Nothing new on the writing page.
- Full screen, in place of the page: the text as it was at the chosen moment, laid out as the same pages, with a scrubber at the foot labelled in plain words ("Tuesday evening", "14 October").
- Actions: **Bring this back** (a new version with the old text; nothing later is lost) and **Keep a copy as a new draft**.
- No "what changed" view in v1. If one comes later, it stays simple and soft, nothing like a code diff.

## The design
*Added 2026-10-27.* DESIGN.md (The Time Machine) holds the screens' rules; these are the decisions behind them.
- **One section at a time.** The scrubber moves through the versions of the section in view, one step per moment. A whole book on one timeline would be thousands of moments, most of them changing a chapter not on screen.
- **Bring this back names its scope** ("Bring this chapter back", "Bring this day back") and replaces that section only. It does not ask first: the text it replaces stays a version and is never thinned (0005).
- **Removed chapters come back through the outline.** The page count opens Contents as it was at that moment, from the outline version of then, so a chapter removed since can be opened and brought back to its old place, with its old title.
- **Bring this part back** inserts a selected passage where it stood, anchored like a reading place (paragraph, offset, a few words), or at the end of the section. It only inserts, so it needs no merging.
- **The shortcut is ⌘/Ctrl + Alt + Z.** ⌘/Ctrl + H and ⌘/Ctrl + Y open the browser's own history.
- **Keep a copy stays one section** in v1. A copy of a whole book as it was is possible from the data (the outline then, plus each chapter's version then) and waits with the drafts work after dogfooding.

## Drafts in v1
- "Keep a copy as a new draft" creates a **new essay piece** from the section being looked at (an essay, one journal day or one chapter), titled like "Chapter 3, draft 2", with a link back to where it came from. Its history starts at that moment.
- No comparing or switching drafts inside one piece, and no merging, in v1.
