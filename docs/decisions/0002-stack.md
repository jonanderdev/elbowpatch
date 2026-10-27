# 2. Stack: React and TypeScript, with an uncontrolled page

Date: 2026-10-27 · Status: accepted

## Context
The app has a library, the page, a tools bar, sheets, settings and the Time Machine. Plain DOM code was the lighter option; React is better known and keeps state in one shape, which matters for an open-source project.

## Decision
- TypeScript, Vite, a PWA service worker (`vite-plugin-pwa`), React for the whole UI.
- `<Page>` is an **uncontrolled** React component: the text is never kept in React state, and React never re-renders inside the editable area. React mounts it once, talks to it through a ref, and receives Markdown through an `onChange`.
- Business logic lives outside the UI layer (see 0004) and is tested without React.

## Consequences
- About 45 KB gzipped for React, cached after the first visit.
- Typing, paging and the caret are handled by our own code, so a re-render can never move the caret or drop a keystroke.
