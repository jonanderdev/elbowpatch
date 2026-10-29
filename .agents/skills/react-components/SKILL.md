---
name: react-components
description: >
  React best practices for Elbowpatch's UI (Preact through the React API, client only): component
  and hook design, state, refs and effects, re-renders, events and listeners, wrapping imperative
  libraries, and rendering cost. Use when writing, reviewing or refactoring any component or hook
  in app/src/ui, and before adding state, an effect or a ref.
license: MIT
---

# React best practices

The UI is Preact through the React API (`react` is aliased to `preact/compat`), rendered on the
client only: no server rendering, no data-fetching library, no framework router. The rules below
are the ones that apply to that. Code should read clearly to any engineer who knows React.

Adapted in part from Vercel's `react-best-practices` and `composition-patterns` skills
(github.com/vercel-labs/agent-skills, MIT), keeping only what applies to a client-only app.

## Components

- **One job per component.** If describing it needs "and", or the file passes ~250 lines, split it.
  A screen composes smaller components; it does not draw everything itself.
- **Compose instead of adding boolean props.** `showFoo`, `isCompact`, `withBar` multiply into
  states nobody tests. Pass children, or make explicit variants (`<CardRow>`, `<CardTile>`).
- **Children over render props** (`renderHeader={…}`) unless the child needs the parent's data.
- **Never define a component inside another.** It is a new type every render, so its state and
  DOM are thrown away. Define it at module level.
- **Props are read-only.** Never assign to a prop or to an object passed in one.
- **Keep static JSX and constants out of the render** (module level), so they are not rebuilt.
- **Name things for what they mean** (`onLibrary`, `pageCount`), not how they look.

## Hooks

- **One concern per custom hook**, named for what it does (`usePageTurns`, `useWriterLock`). It
  takes what it needs as arguments and returns what callers use. A component should read as a
  list of hooks followed by its JSX.
- **Split hooks with independent dependencies** rather than one hook that does everything and
  re-runs for any change.
- **Hooks at the top level only**, never in conditions or loops.

## State

- **State is what the screen shows.** A value that never changes the output is not state.
- **Derive during render** instead of copying into state and syncing it in an effect. Compute
  `const done = items.every(…)`; do not `useEffect(() => setDone(…))`.
- **Keep state as small and as local as possible**; lift it only as far as the components that
  share it.
- **Functional updates** (`setCount((c) => c + 1)`) when the next value depends on the last, so
  callbacks need not depend on the state.
- **Lazy initial state** (`useState(() => expensive())`) for anything costly to compute.
- **Context** for values many levels need (theme, settings), not to skip passing two props. Keep a
  provider's value stable, or every consumer re-renders.

## Effects

- **An effect synchronises with something outside React**: a subscription, a listener, a timer,
  the DOM, storage, an imperative library. If nothing outside React is involved, it should not be
  an effect.
- **Respond to a user's action in its event handler**, not in an effect watching state it set.
- **Every effect cleans up what it starts**: listeners, timers, animation frames, instances.
- **Honest dependencies.** Prefer primitives (`settings.size`, not `settings`). If an effect must
  run once per something, key it on that something and say so in a comment where the lint is
  silenced.
- **`useLayoutEffect` only when the user would otherwise see a wrong frame** (measuring and
  placing before paint). Say why in a comment.
- **Preact runs effects after paint.** An event can arrive between a render and the effect that
  re-attaches a listener. A long-lived listener should read the latest values from a ref instead
  of being re-attached on each change.

## Refs

- **A ref holds an element, an instance, or a value that must not re-render**: an imperative
  object, a timer id, the latest value a long-lived listener reads. Say which in a comment when
  it is not obvious.
- **Do not read or write refs during render** for anything that affects the output; that is state.
- **Do not use refs to dodge effect dependencies.** Fix the dependency instead.

## Imperative libraries

The editor (ProseMirror) and the pager are imperative and long-lived.

- **One hook per library, one job per hook** (`useEditor`, `usePager`, `useSaving`). The hook
  creates the instance in an effect keyed on what it belongs to, destroys it in the cleanup, and
  mirrors into React state only what the screen shows, through callbacks the instance calls.
- **The component composes the hooks.** It reads as a list of what the screen does; no session
  object that knows everything.
- **Plain functions for logic with no React in it** (a `create…` factory, a pure helper), in their
  own module, called by the hook that needs them.
- **Keep non-React helpers out of component files.** Code that works on the DOM or the library
  lives in its own module beside that library, testable without React.
- **Uncontrolled where React would get in the way.** A contentEditable field filled when it opens
  and read when saving should not be re-rendered by React on every keystroke.

## Events and listeners

- **Use React's props for events on your own elements**; add DOM listeners only for the window,
  the document, or elements you do not render.
- **Passive listeners** (`{ passive: true }`) for touch and wheel unless you call
  `preventDefault`.
- **One listener per event per concern**, removed in the cleanup; do not attach the same global
  listener from many components.

## Re-renders and rendering cost

- **Measure before optimising.** `memo`, `useMemo` and `useCallback` add cost and code; use them
  when a profile shows a real re-render problem, or to keep a value stable for a memoised child
  or an effect dependency. Never wrap a simple expression.
- **Subscribe to the narrowest value** a component needs (a derived boolean, not a whole object),
  and do not read state a component only uses in a callback.
- **Frequent, transient values** (pointer position, scroll offsets) go in refs or the DOM, not state.
- **Batch DOM style changes** through a class or a CSS variable rather than many inline writes.
- **Long lists:** render what is visible, or let CSS skip offscreen work (`content-visibility`).
- **Conditionals:** prefer a ternary to `&&` when the left side can be `0` or `''`.

## Types and lint

- **Every export states its types**, return types included. TypeScript's `isolatedDeclarations`
  enforces it; local callbacks keep their inferred types.
- **`npm run lint`** (Biome) checks hook rules, effect dependencies and accessibility. Silence a
  rule only with a `biome-ignore` comment that says why.

## JavaScript

- **Return early**, and check cheap conditions before expensive work.
- **Maps and Sets for repeated lookups**; one pass instead of chained `filter`/`map` on hot paths.
- **Hoist regular expressions and constants** out of loops and renders.
- **Non-urgent work** (cleanup, thinning, prefetching) in `requestIdleCallback` or after first paint.
- **Read `localStorage` once** and keep it in memory; version what you store there.

## Code splitting

- **Import modules directly**, not through barrel files that pull in everything.
- **Load heavy, rarely used code on demand** (`import()`), e.g. zip handling only when exporting.

## Accessibility

Interactive elements are real `<button>`s, links or inputs, with an accessible name. Focus moves
deliberately when a sheet opens or closes, and status changes are announced through a live
region. (Interface rules in full: the `web-design-guidelines` skill.)

## Checks

- `npx tsc -b`, and the Playwright suite (`npx playwright test`, run under `caffeinate`) after any
  change to a screen; it is the safety net for behaviour moved between components.
- For changes that touch the caret or paging, also `node scripts/painted-caret.mjs all`
  (docs/decisions/0007).
