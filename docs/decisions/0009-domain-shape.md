# 9. The domain: plain functions, product words, ports

Date: 2026-10-27 · Status: accepted

## Context
The rules of the app (versions, thinning, put away, export) should outlive the web page. A wrapped app (the PWA inside a native shell) would reuse everything; a React Native app would reuse `domain/`; a fully native app would reuse nothing but the data format. So the domain must know nothing about the browser, the editor or the UI, and the data format must be versioned (0007, 0010). A light domain-driven shape gets there; a heavy one would cost more than it saves at this size.

## Decision
- **The product's words are the code's words:** piece, section, version, outline, working copy, moment, put away, bring back, keep a copy. Never `doc`, `note`, `commit` or `branch`.
- **`domain/` holds the model and the use cases** as plain types and functions: `write`, `takeMoment`, `bringBack`, `keepACopy`, `putAway`, `restore`, `thin`, `exportAll`, `importArchive`. The UI calls these and never touches storage.
- **A piece is the unit of consistency:** a piece, its outline, its sections and their working copies change together in one transaction. Versions are immutable records that hang off it (0001).
- **Order comes from the data, not the clock:** a section's newest version is found through `parentId`, and the `Clock` port is only asked for labels (0005).
- **The outside world comes in through interfaces the domain declares:** `Store` (with `transaction()`), `Clock`, `Ids`, `WriterLock`, and later `Connector`. Adapters implement them; `main.tsx` connects them.
- **Markdown belongs to the domain:** export, import and word counts need it. `domain/markdown.ts` reads and writes a small tree of blocks and marks; `page/` maps that tree to and from the editor.
- **Platform details stay out:** timers and "the page was hidden" live in a small moment scheduler in `adapters/` that calls `takeMoment()`. The window lock lives in an adapter. ProseMirror lives only in `page/`.
- **The compiler holds the line:** `domain/` has its own TypeScript config with no browser types and no React types. Touching `window`, `document`, `indexedDB` or importing React there does not compile.

## Not doing
Event sourcing, CQRS, a dependency-injection container, a class per entity, or a separate package for the domain before something else needs it.

## Consequences
- Tests run the whole domain against the in-memory store and a fake clock, so a year of thinning takes milliseconds.
- Moving `domain/` into its own package later is a move, not a rewrite.
