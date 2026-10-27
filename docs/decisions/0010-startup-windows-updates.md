# 10. Startup, one writing window, updates, stored format

Date: 2026-10-27 · Status: accepted

## Context
Data loss is the worst bug (PROJECT.md §3). Three ways to lose words have nothing to do with the editor: two windows saving over each other, an update reloading the app mid-sentence, and stored data that a later version cannot read.

## Decision

### Startup
The launch screen (§) shows while the app:
1. opens the database and runs its migrations
2. turns working copies left by a crash into versions (0005)
3. takes the lock on the last piece if it is free, and otherwise opens it read-only (never waits for it)
4. waits for the fonts (0011)
5. lays out that piece and opens it at your place.

The launch screen leaves once the first page is ready. Thinning runs afterwards, when idle. Persistent storage (`navigator.storage.persist()`) is requested after the first piece is written, not at launch, because some browsers ask the user.

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
