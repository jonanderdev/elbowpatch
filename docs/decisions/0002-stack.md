# 2. Stack: React's API on Preact, TypeScript, an uncontrolled page

Date: 2026-10-27 · Status: accepted

## Context
The app has a library, the page, a tools bar, sheets, settings and the Time Machine. Plain DOM code was the lighter option; React is better known and keeps state in one shape, which matters for an open-source project.

## Decision
- TypeScript, Vite, a PWA service worker (`vite-plugin-pwa`), React's API for the whole UI.
- *Updated 2026-10-27:* it runs on **Preact**. The code imports from `react` as usual, and Vite points `react` and `react-dom` at `preact/compat`. Going back to React is deleting that alias. Preact is a fraction of React's size, and a phone parses the script on every cold start, right behind the launch screen. It is safe here because the editor does not depend on a framework (0003) and the interface uses no third-party React components.
- `<Page>` is an **uncontrolled** component: the text is never kept in UI state, and the UI never re-renders inside the editable area. It is mounted once, talked to through a ref, and reports changes through an `onChange`.
- Business logic lives outside the UI layer (see 0004, 0009) and is tested without it.

## Consequences
- The UI costs a few KB, cached after the first visit.
- Typing, paging and the caret are handled by the editor and our paging code, so a re-render can never move the caret or drop a keystroke.
- A React-only library would need checking against `preact/compat` first, or the alias removed.
