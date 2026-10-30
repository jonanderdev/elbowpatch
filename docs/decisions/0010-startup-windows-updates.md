# 10. Startup, one writing window, updates, stored format

Date: 2026-10-27 · Status: accepted

## Context
Data loss is the worst bug (PROJECT.md §3). Three ways to lose words have nothing to do with the editor: two windows saving over each other, an update reloading the app mid-sentence, and stored data that a later version cannot read.

## Decision

### Startup
The launch screen (§) shows while the app:
1. opens the database and runs its migrations
2. turns working copies left by a crash into versions (0005), then writes the journal (below)
3. takes the lock on the last piece if it is free, and otherwise opens it read-only (never waits for it)
4. waits for the fonts (0011)
5. lays out that piece and opens it at your place.

The launch screen leaves once the first page is ready. Thinning runs afterwards, when idle. Persistent storage (`navigator.storage.persist()`) is requested after the first piece is written, not at launch, because some browsers ask the user.

### A save never fails silently
*Added 2026-10-27.* Safari on iOS can drop the database connection when the app goes to the background, and a full disk fails a save the same way.
- The store reopens its connection when the app comes back (`visibilitychange`, `pageshow`) and retries.
- Every write can run twice safely: same ids, same result.
- If a save still cannot complete, the text stays in memory and one calm line shows on the page: "Can't save right now. Your words are still here." with *Save a copy*, which downloads the piece as `.md`.
- *Added 2026-10-28:* words not yet stored are also kept in `localStorage`, one entry per section: when a save fails, and synchronously when the page hides or unloads, since IndexedDB may not finish while a page unloads. It is a journal, not a second store: an entry goes as soon as its words are stored. At launch, after crash recovery, each entry is written under the piece's lock, unless its section was stored later (another window), in which case it waits for *Save a copy*. While any wait, the library says so too. Export never reads it: it holds only what has not reached the database yet.

### Keeping the browser from clearing it
*Added 2026-10-27.* Safari deletes a site's storage after 7 days of browsing without a visit; an app added to the Home Screen keeps its own count, reset each time it opens, and is the one Safari grants persistent storage to.
- The app encourages installing it (Add to Home Screen on Safari, Install elsewhere), and, once sync exists, connecting a place.
- In Safari outside the Home Screen, the library says it plainly: "Safari clears this after 7 days away. Add Elbowpatch to your Home Screen." Elsewhere there is no warning; a quiet reminder appears after 30 days without an export (DESIGN.md, The library). *Updated 2026-10-28.*
- How the invitation looks, and its area in Settings, are not designed yet (DESIGN.md, Gaps).

### One window writes a piece
- One window at a time holds a lock per piece (the Web Locks API).
- Another window opening that piece shows it read-only, with one quiet line: "Open in another window · Write here". *Write here* takes the lock; the first window saves and becomes read-only.

### Updates never reload while you write
- A new version downloads silently and takes over on the next launch.
- While one waits, the library shows a quiet "A new version is ready · Restart". The page never shows it.

### Stored format
- The local database carries a schema version. Migrations are ordered steps, each with its own test.
- The export carries a `formatVersion` (0007).

## Consequences
- Startup costs one database open and one recovery pass before the first page; both are small.
- A second window is never a second writer, so two saves cannot race.
