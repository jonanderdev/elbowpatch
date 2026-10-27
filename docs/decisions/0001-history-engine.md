# 1. History engine: our own immutable versions

Date: 2026-10-27 · Status: accepted

## Context
The Time Machine is the reason the app exists. History could be kept as Git (in the browser) or as our own records.

## Decision
- History is our own store of immutable versions in IndexedDB. No Git inside the app.
- Every version has a globally unique id (UUID) and is never edited after it is written. New text means a new version.
- Restoring ("bring this back") writes a new version with the old text. Nothing is ever removed from history by the user's own actions.
- Local first: the device is the source of truth and everything works offline. Syncing is optional, runs in the background when online, and never blocks writing.
- Git (through the GitHub REST API) is one future connector among several. Connectors copy versions out; they do not define them.

## Consequences
- A connector only has to send the versions the other side does not have yet: compare sets of ids. No outbox, queue or sync fields are needed before sync is built.
- No heavy Git library in the bundle, and no Git words leaking into the UI.
- A version holds one section (a journal day, a chapter, an essay), with local thinning (0005).
