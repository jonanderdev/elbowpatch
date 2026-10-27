# 4. Code layout: domain, adapters, page, ui

Date: 2026-10-27 · Status: accepted

## Context
A landing site may come later and may deploy on its own subdomain. Business logic must stay out of the UI, and sync is part of the domain, not of a provider.

## Decision
- The app lives in `app/`. A future landing site goes in `site/`, sharing fonts and colours through DESIGN.md, not a shared package. Workspaces only once `site/` exists.
- `prototype/` stays untouched as a reference until the new page matches it, then it is deleted. *Updated 2026-10-27:* deleted early, once every screen was in the Figma file and every decision in DESIGN.md. Its paging code (a CSS multi-column flow, one column per page) is in git history if `page/` wants to look at it.
- Inside `app/src/`:

```
domain/     pieces, versions, snapshot rules, put away, export/import,
            the sync contract (Connector interface, "what is unsynced")
            — plain TypeScript, no browser APIs, no React
adapters/   the outside world behind domain interfaces:
            indexeddb store, in-memory store for tests, later github, ...
page/       paging maths, DOM ↔ Markdown, caret — plain TypeScript
ui/         React: Library, Page, Tools, Time Machine, Settings
main.tsx    wires adapters → domain → ui
```

- Imports point inward: `ui` → `domain`, `page`; `adapters` → `domain`; `domain` → nothing outside itself.

## The connector contract (built after the dogfooding gate)
- Each connector declares whether it **keeps history**.
  - Yes (Git-based, e.g. GitHub): push only the current section files, one commit per push. Commits are the far history.
  - No (e.g. WebDAV, S3): push the current files plus a `history/` folder mirroring the local, thinned versions.
- Pushes run every few minutes while writing, plus on pause and close, not on every local snapshot, to stay within provider rate limits.
- The Time Machine shows local versions offline, and fills in older moments from the connector when online.

## Consequences
- A new connector is a new adapter. The domain decides what to send and how conflicts are kept ("keep both", never discard).
- The whole domain runs in tests against the in-memory store.
