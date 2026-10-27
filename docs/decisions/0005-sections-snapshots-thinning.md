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

### When versions are written
- The current text is autosaved on every short pause, so a crash loses about a second at most.
- A snapshot moment comes on 3 seconds idle, on blur or the page hidden, on switching pieces, and on "keep this moment". At each moment, every section whose text changed since its last version gets a new version, all with the same timestamp. A section that did not change gets nothing.

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
- Thinning is the one place the app deletes history. It lives in `domain/` and carries the heaviest tests.
- With a connector that keeps history, the far past also lives there (0004).
