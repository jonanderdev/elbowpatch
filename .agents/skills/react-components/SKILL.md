---
name: react-components
description: >
  How React code is written in Elbowpatch: one job per component, effects only to sync with
  something outside React, imperative things (the editor, the pager, saving) in plain classes
  behind a hook, helpers next to what they work on. Use when writing, reviewing or refactoring
  any .tsx or hook in app/src/ui, and before adding state, an effect or a ref.
license: MIT
---

# React components in Elbowpatch

The app is Preact through the React API (`react` is aliased to `preact/compat`). These rules
keep the UI readable by any engineer, not only by whoever wrote it. When a rule and the code
disagree, the rule wins for new code; change old code when you touch it.

## Shape

- **One job per component.** A component lays out one thing. If its file passes ~250 lines, or
  its name needs "and", split it. `ui/page/Page.tsx` composes `TitlePage`, `SectionTitle`,
  `PageFoot`, `StatusLine`; it does not draw them.
- **One concern per hook.** A hook is named for what it does (`usePageTurns`, `useFocusOnOpen`,
  `useWriterLock`), takes what it needs as arguments and returns what callers use. A component
  reads as a list of hooks, then JSX.
- **Imperative things live in plain classes, not in effects.** The editor (ProseMirror), the
  pager and saving are imperative and long-lived: they live in `PageSession` and `Saving`, with
  a constructor, methods and `destroy()`. React creates one in a layout effect, keyed on what
  it belongs to, and destroys it in the cleanup. React state mirrors only what the page shows
  (page number, word count, failed), through callbacks the class calls.
- **Helpers next to what they work on.** Caret and page maths on the editor go in `src/page/`
  (no React there). A helper used by one component sits under it; one used by several gets its
  own module. Never a pile of unrelated functions at the bottom of a component file.
- **Folders by feature:** `ui/page/`, `ui/app/`, then the shared bits in `ui/`.

## State, refs and effects

- **State is what the screen shows.** If changing it should not re-render, it is not state.
- **A ref is for an element, an instance (a session), or the latest value a long-lived listener
  must read.** Say which in a comment when it is the last. Do not use refs to dodge
  dependencies.
- **Effects sync with something outside React** (a listener, the editor, a timer, storage) and
  always clean up what they start. Derive values during render instead of setting state in an
  effect. Handle a user's action in its handler, not in an effect that watches for it.
- **One listener that reads the latest value from a ref**, not one re-attached on every change,
  when events can arrive between a change and the next effect: Preact runs effects a frame
  after rendering, so Done-then-Escape reached the old listener (`ui/page/Page.tsx`, Escape).
- **Layout effects only when a frame would show the wrong thing** (the page opening on page 1
  before the writer's place). Say so in a comment.
- **Dependencies are honest.** Suppress the lint only for "once per X" effects, with a comment
  saying what X is.
- **Uncontrolled fields stay uncontrolled.** The title fields are contentEditable and filled when
  a section opens; React does not render their text, so typing never re-renders the page.

## Comments

- Say why, not what, in plain words; point at DESIGN.md or the decision (0005…) that settled it.
- A comment that explains a browser quirk names the browser and the symptom.

## Checks

- `npx tsc -b` and the Playwright suite (`npx playwright test`, run under `caffeinate`) after
  any change to the page: it is the safety net for behaviour these rules move around.
- For caret work, `node scripts/painted-caret.mjs all` too (see docs/decisions/0007).
