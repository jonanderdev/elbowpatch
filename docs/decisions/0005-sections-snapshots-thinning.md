# 5. Sections, snapshots and thinning

Date: 2026-10-27 · Status: accepted

## Context
A journal is one piece with a page per day, and a book is one piece made of chapters (DESIGN.md). A year of journal or a novel as one Markdown string is hundreds of KB, too large to copy whole on every pause.

## Decision

### What a version holds
- A piece is a container of **sections**: a journal day, a book chapter, or the whole of an essay.
- A version holds the full Markdown of **one section**, and is immutable (0001).
- A piece also has immutable **outline** versions: the ordered list of its sections and their titles. A new outline version is written when a section is added, split (typing `#` mid-chapter), removed or renamed.
- The piece at any moment = the outline at that moment + each section's latest version at or before it.
- *Updated 2026-10-27:* a section's newest version is found by following `parentId` from its first version, not by time. `createdAt` is never earlier than the previous version's (now, or the previous plus 1 ms, whichever is later). Device clocks jump; timestamps label moments, they do not order them.

### Titles
*Updated 2026-10-27.*
- A chapter's title is a field, written in its own input, not in the text. It lives in the outline, so renaming a chapter writes a new outline version and the Time Machine remembers old titles.
- The piece's own title (an essay's, a book's, a journal's name) lives in the outline too, so the Time Machine shows the title as it was. The piece record keeps a copy of the current title for the library; edits save there like a working copy, and the next moment writes the outline version.
- A section's Markdown holds its body only. An essay's title is the piece title; a journal day's title is its date.
- Export writes `# Title` at the top of each chapter's file, and import reads it back as the title (0007).

### The working copy
*Updated 2026-10-27.*
- Each section has one mutable **working copy**: `{ sectionId, content, title?, baseVersionId, updatedAt }`. It is written about a second after typing stops, and at least every 5 seconds while typing goes on, in the text or in a chapter's title, so a crash loses a few seconds at most.
- A snapshot moment turns working copies into versions in the same transaction, and writes one new outline version if any title changed.
- On launch, a working copy that differs from its base version becomes a version first. This is how text left by a crash enters history.

### When versions are written
- A snapshot moment comes on 3 seconds idle, but at most once every 5 minutes while writing; and always on blur or the page hidden, on switching pieces, on closing, and on "keep this moment". *Updated 2026-10-27:* it was every 3-second pause, which kept far more history than anyone travels back through; the working copy, saved about a second after typing stops, is what protects against a crash, so fewer moments lose nothing. Anything finer than 5 minutes is undo's job (0003), which is on the writing bar on a phone. At each moment, every section whose text changed since its last version gets a new version, all with the same timestamp. A section that did not change gets nothing.

### Thinning (local only)
Each section's local history gets sparser with age, keeping the last version in each period:

| Age | Keep |
|---|---|
| last hour | every version |
| last 24 hours | one per hour |
| last 30 days | one per day |
| last year | one per week |
| older | one per month |

Never removed: the latest version of each section, its first version, versions marked "keep this moment", and the version just before each "bring this back". Outline versions follow the same rule. Thinning runs when the app opens or sits idle.

## Consequences
- Storage stays bounded: an active section holds at most about 200 versions, and a finished day or chapter very few.
- "Bring this back" can restore one day or one chapter, not a whole year.
- Thinning works per section, so after a while the whole piece "at a moment" is each section as it was at or before that moment, which may never have been one exact moment. The section on screen in the Time Machine is always exact: the tape steps through its own versions.
- Thinning is the one place the app deletes history. It lives in `domain/` and carries the heaviest tests.
- With a connector that keeps history, the far past also lives there (0004).
