# Elbowpatch

> A quiet place to write, with a memory. Local-first and private, your words stay yours, and nothing you write is ever lost.

Status: pre-MVP, idea validated in conversation, nothing built yet.
Owner: a solo maintainer building this first as a personal tool, hoping it finds an audience.

---

## 1. What this is

Elbowpatch is a minimalist, beautiful writing app for journals, essays, and eventually longer work. It
feels like a quiet study with a lamp on: one page, good typography, nothing else on screen. Behind the
page it keeps a complete, effortless history of everything written, so the writer can travel back through
their own words without ever thinking about "version control".

It is a **PWA** (works on any device, installable, works offline), **local-first** (the device is the
source of truth), and **private by default**. There is no required account and no server that sees
anyone's writing.

It is open source. Anyone can clone and self-host it. The maintainer also hosts a main instance so
anyone can just open it and use it.

### The one-sentence test
If a feature doesn't make the page quieter, the history more trustworthy, or the data more the user's own,
it probably doesn't belong.

---

## 2. Why it exists

- Most writing tools are noisy: sidebars, metrics, notifications, accounts, proprietary clouds.
- Minimal editors write beautifully but remember little.
- Version control remembers everything but is technical and ugly for prose.
- Existing options (Obsidian + Git plugin, Bear, iA Writer, Scrivener) each miss one of: beautiful to open
  daily, real history, plain files the user owns, works on every device, free.

Elbowpatch's wedge is the combination: **beautiful daily-driver feel + effortless, explorable history +
user-owned data + runs everywhere**. Beauty and feel are the product. Code is the cheap part.

### Who it is for (in order)
1. The maintainer, who will use it daily. This is the success bar.
2. Journalers and personal writers, including technical people who like analog, quiet tools.
3. Essayists and, later, novelists (long-form structure is v2+, see Non-goals).

---

## 3. Principles

1. **The page is the product.** Text, typography, centered focus. No floating panels, no metrics, no
   notifications. Everything else is hidden until summoned and gone when dismissed.
2. **Never lose a word.** Autosave, automatic snapshots, safe storage. Data loss is the worst possible bug.
3. **Local-first.** Writing works fully offline. Sync is optional and never blocks writing.
4. **Private by default.** No analytics inside the editor, no content ever leaves the device unless the
   user connects a destination themselves. Content is never sent to the maintainer's servers.
5. **User-owned data.** Plain-text (Markdown) content, always exportable in one click. The user can leave
   with everything, at any time.
6. **Human language, zero jargon.** Never show "commit", "branch", "merge", "diff". Say "drafts",
   "moments", "versions", "bring this back".
7. **Small and finishable.** Prefer fewer features done beautifully. Resist scope creep.
8. **Open and forkable.** Self-hosting is a first-class path, documented and simple.

---

## 4. Product concept

### 4.1 The Page
- A single centered column, generous margins, carefully chosen typography (readable serif or mono as
  options, comfortable measure, good line height).
- Light and dark themes, plus a warm "paper" and a dark "night" feel. Respect `prefers-color-scheme`.
- Typewriter-like calm: optional subtle caret, optional typewriter scrolling (current line stays centered).
- Markdown-based, but gentle: render nicely while typing, never intimidating.
- Zero chrome while writing. Controls appear on a small gesture (move mouse to edge, a key chord, or a
  tap) and fade away.

### 4.2 Pieces
The unit of writing is a **piece** (a document). A journal is a piece per day with a calendar-style way
in. An essay is one piece. Novels (chapters, ordering, binder) are explicitly out of scope for v1.

### 4.3 The Time Machine (the differentiator)
- The app automatically takes **snapshots** while the user writes (debounced, plus on pause, on blur, and
  on close). Users never press "save" or "commit".
- A **timeline** lets the user move back through a piece's history as a story, not a diff list:
  visually calm, with a scrubber, dates written in plain language ("Tuesday evening", "3 weeks ago"),
  and a gentle view of what changed (words added and removed shown softly, never a code-style diff).
- Actions in plain language: **Look back**, **Bring this version back** (restores as the current text but
  never destroys later history), **Keep a copy as a new draft**.
- Alternate versions ("drafts") exist so a writer can try a different ending without fear. Comparing and
  choosing is the primary interaction. Merging two drafts is NOT a v1 goal.
- History is **append-only** from the user's view. Restoring never deletes anything.

### 4.4 Sync and backup (optional, provider-based)
- Local storage works with no account. A gentle, non-nagging first-run message explains that the browser
  can lose data and offers to connect a backup destination or export.
- Sync is built behind a **provider interface**, not hard-wired to any service. See Architecture.
- v1 ships exactly **one** provider: GitHub (the user's own private repo, which the app creates for them).
- Other providers (GitLab, Codeberg/Gitea/Forgejo, WebDAV, S3-compatible) are future work and a good
  contribution area.

### 4.5 Export
One click: download everything as a zip of Markdown files (plus metadata for history). Export is the
universal escape hatch and the answer to "what if this app disappears".

---

## 5. Scope

### MVP (time-boxed; goal: usable daily by the maintainer)
- [ ] PWA shell: installable, offline-capable (service worker), responsive to phone/tablet/desktop
- [ ] The Page: centered editor, Markdown, themes, typography, typewriter scrolling option
- [ ] Local persistence (IndexedDB) with `navigator.storage.persist()` requested
- [ ] Pieces: create, open, rename, delete (delete is soft with an undo window), journal-by-day entry
- [ ] Automatic snapshots + the Time Machine timeline (look back, bring back, keep a copy)
- [ ] One-click export (zip of Markdown) and import of Markdown files
- [ ] First-run note about storage safety and backup/export
- [ ] Basic settings: theme, font, size, measure

### After dogfooding (only once the maintainer has used the MVP for ~2-3 weeks)
- [ ] Sync provider interface + GitHub provider (OAuth via tiny stateless worker, REST API based)
- [ ] Optional drafts/branches UX polish
- [ ] Search across pieces (local, simple)

### Later / contributions welcome
- Additional sync providers
- Optional client-side encryption before sync
- Long-form structure (chapters, reorder), word-count goals, EPUB/DOCX export
- Mobile polish, widgets-like shortcuts

### Non-goals (explicitly)
- No accounts system, no server-side storage of user content, no proprietary cloud
- No collaboration/real-time multi-user editing
- No AI features in the writing surface
- No gamification, streaks, or productivity metrics inside the editor
- No plugin system in v1
- No Git jargon in the UI
- Not trying to replace Scrivener or Obsidian feature for feature

---

## 6. Architecture (recommended; challenge with reasons)

### 6.1 Principles
- **Static site.** No application backend. Hostable on any static host (Cloudflare Pages, Netlify,
  GitHub Pages).
- **Local-first.** IndexedDB is the working store. Everything works offline.
- **Storage-agnostic sync.** The editor and timeline know nothing about GitHub.

### 6.2 Suggested stack (open to change)
- TypeScript, Vite, `vite-plugin-pwa` (Workbox) for the service worker
- UI: Svelte or React; prefer whichever keeps the bundle small and the code simple
- Editor: CodeMirror 6 (Markdown) or a lightweight custom editor; avoid heavy rich-text frameworks
- Storage: IndexedDB via a thin wrapper (e.g. `idb`)
- Tests: Vitest for logic (snapshots, restore, sync adapters), Playwright for key flows
- No runtime dependencies without a reason; the bundle should stay small and fast

### 6.3 Data model (sketch)
- `Piece { id, title, createdAt, updatedAt, kind: 'journal' | 'essay' | ..., currentVersionId }`
- `Version (snapshot) { id, pieceId, parentId, createdAt, content, label? }`
  - **Immutable** and append-only. New versions are new records.
  - `parentId` forms a history; a draft is simply a branch of that chain with a human name.
- Snapshot policy: debounce while typing, snapshot on pause (~a few seconds idle), on blur, on close,
  and on explicit "keep this moment". Avoid unbounded growth (e.g. thin out very dense snapshots over
  time, but never delete user-labeled ones).
- Content is plain Markdown strings. Prose diffs are done by word/sentence, not line.

### 6.4 History engine decision (open, decide early)
Option A: custom immutable snapshot store (recommended default). Works with any provider, trivial to
sync as small immutable files, avoids `.git` corruption in synced folders.
Option B: use Git semantics (e.g. isomorphic-git). Powerful, but heavy and awkward in browsers.
Recommended direction: **A internally**, and Git-based providers *mirror* snapshots as commits.

### 6.5 Sync provider interface (sketch)
A narrow contract that providers implement, for example:
- `authenticate()`
- `listPieces()`, `readPiece(id)`, `writePiece(id, content, message)`
- `listVersions(id)`, `readVersion(id, versionId)`
- Conflict policy: single-writer assumption, last-write-wins plus **keep both** as a draft. Never
  silently discard content.
- Sync runs in the background, never blocks the editor, and is retry-safe.

### 6.6 GitHub provider notes
- Use the **GitHub REST API** (contents / git data endpoints), not the git protocol, because the git
  protocol does not allow browser CORS.
- OAuth code exchange needs a client secret, so use a **tiny stateless serverless function** (e.g.
  Cloudflare Worker). It stores and logs nothing.
- The app **creates the private repo** for the user. Users never create or configure repos by hand.
- Fallback for technical users: paste a fine-grained personal access token.
- Self-hosters register their own OAuth app and deploy their own worker. Document this clearly.

### 6.7 Known constraints to design around
- Safari/iOS lacks the File System Access API, so sync is network-provider based, not folder based.
- Browser storage can be evicted. Request persistence, warn until a backup is connected, offer export.
- iOS PWAs have no background sync: sync runs while the app is open.
- Do not store history in a raw `.git` directory in cloud-synced folders.

---

## 7. Privacy and analytics

- Content never leaves the device except to a destination the user connects.
- No cookies, no fingerprinting, no tracking in the editor.
- Optional page-level analytics only, via **Cloudflare Web Analytics** (cookieless). Loaded only if an
  environment variable is set, so self-hosters get no analytics by default.
- Never send custom events from inside the editor ("we count visits, never words").
- Include a short, plain-language privacy page. State that, if the user connects a sync provider, their
  data goes to that provider under its terms.

---

## 8. Licensing and project stance

- Open source from day one. License to be decided: **MIT** (max adoption) or **AGPL-3.0** (prevents closed
  hosted forks). Default recommendation: MIT unless the maintainer prefers the stronger stance.
- Provided as-is, no warranty. Say so in the README and on the first-run screen.
- The maintainer hosts a main instance on a best-effort basis. Self-hosting must always be a real option.
- Donations (GitHub Sponsors / Ko-fi) are optional and never shown inside the writing view.
- The repo should not talk about pricing or subscriptions.

---

## 9. Design direction

- Calm, warm, analog. Think study, lamp, paper, not dashboard.
- Typography first: pick excellent fonts, set the measure and rhythm carefully.
- Motion: slow and subtle, never decorative.
- Mascot/identity: an old writer in a tweed jacket with elbow patches, mustache, maybe a pipe. Use sparingly
  (favicon, about page), never in the writing view. The name "Elbowpatch" references the elbow-patched
  jacket.
- Accessibility is required: keyboard navigation, screen reader support, sufficient contrast, reduced
  motion respected.

---

## 10. Roadmap

1. **Core:** the Page, local persistence, pieces, export. *Done when:* you use it for your own notes instead of your current tool.
2. **Time Machine:** snapshots and the timeline. *Done when:* you've used it daily for a while and restoring an old state has saved you at least once.
3. **Polish:** README with screenshot/GIF, first-run experience. *Done when:* someone else can open it and get it without you explaining.
4. **Gate:** did daily use feel good? If not, stop or rethink.
5. **Sync:** provider interface + GitHub, only if you passed the gate.
6. **Launch:** one public post (e.g. on a relevant community), once, then let it grow organically.

Success = the maintainer uses it every day. An audience is a bonus.

---

## 11. Open questions (resolve and record decisions)

- [ ] Final history engine: custom snapshots (recommended) vs Git semantics
- [ ] Svelte vs React (or other)
- [ ] Editor library: CodeMirror 6 vs custom
- [ ] License: MIT vs AGPL
- [ ] How the timeline appears without breaking the quiet UI (gesture, shortcut, edge reveal)
- [ ] Thinning policy for snapshots
- [ ] Journal-by-day entry design (calendar vs list)
- [ ] Name check: confirm domain, GitHub org/user, npm availability for "Elbowpatch" (a project named
      `elbow-patch` exists on GitHub with a dash; confirm it is unrelated)

---

## 12. Guidance for agents working in this repo

- Read sections 1-3 before changing anything. When in doubt, choose the quieter, simpler option.
- Never introduce UI chrome into the writing view without justification.
- Never add network calls that carry user content unless the user has connected a provider.
- Keep the bundle small. Justify every dependency.
- Treat data loss as a P0. Add tests for snapshot, restore, import/export, and sync edge cases.
- Use human language in all user-facing strings. No Git terms.
- Record decisions in `docs/decisions/` as short ADRs when resolving the open questions above.
- Keep commits small and the app runnable at every step.
