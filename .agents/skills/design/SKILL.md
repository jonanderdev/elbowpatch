---
name: design
description: >
  Turn a direction into the product's look: prototype the brief's key screens
  in plain HTML, let them pick and iterate, then on approval write DESIGN.md
  in one go and build the screens in Figma from it. Colour, type, spacing and
  copy are chosen here, on rendered screens. Runs when
  design-exploration/<slug>/direction.md exists and there is no approved
  DESIGN.md, or for a feature that needs screens. Figma is required.
---

# Design

Three things come out, in order: a prototype they approved, `DESIGN.md` (the official look, committed), and the screens in Figma marked **Ready**. Figma is the truth for screens. `DESIGN.md` is the written summary of the rules behind them.

Read [design-rules.md](references/design-rules.md) before the first prototype. It is the checklist for every screen here and in `design-check`.

## Gate

Look at the repo. Do not ask what is there.

1. No `docs/brief.md` → `idea` first. Stop.
2. The brief says no UI → nothing to design. Stop.
3. No `design-exploration/identity*/direction.md` and no `DESIGN.md` → `design-direction` first. Stop.
4. `DESIGN.md` exists and an identity `direction.md` is newer than it → a rebrand: **First pass**. On approval its `DESIGN.md` replaces the old one.
5. `DESIGN.md` exists → **Feature loop**.
6. Otherwise → **First pass**.

The first pass reads the newest `design-exploration/identity*/direction.md` (`identity/`, `identity-2/`), never a one-piece direction.

No Figma connection → say Figma is required for UI projects, and stop before the Figma step. The prototype and `DESIGN.md` can still be done.

## First pass

### 1. Ask first

The direction settles the idea, not the values. Colour, type and the rest of the look are chosen here, so they get a say before anything is drawn. Read the brief and `direction.md`, then send one message and wait. Always ask, however the run was set up. Only they can say "go".

```
Before I prototype, a few choices. Skip any with "go" and I'll bring options to react to.

1. Colour: light, dark or both? Any colours you already have, want, or refuse?
2. Type: what should it feel like to read? Any faces you love or refuse?
3. Anything else you already see: shapes, density, imagery, how it moves?
```

Propose from the direction, so they react rather than start from nothing: for each question, offer two or three concrete options that fit it.

### 2. Prototype the key screens

Read the brief's key screens (2–4) and `direction.md`. Prototype only those, with their main states. Other screens are composed later in Figma from the components.

Load Matt's `prototype`, UI branch, and tell it:

- **No app.** Sub-shape B, in `design-exploration/<slug>/prototype/`: one `index.html` per key screen, plain HTML and CSS, no build step, no router, no NODE_ENV gate. It runs by opening the file.
- **2–3 variants per screen** behind `?variant=`, structurally different as its rules say. Build their answers in. Where they left a choice open, variants differ on it: this is where colour and type get chosen.
- **Hide the switcher when the URL has `capture`** (`?variant=B&capture`), so screenshots show only the design.
- **Real content, not polish skipped.** Real copy in the voice from `direction.md`, real or properly chosen imagery (local files in `prototype/img/`), the longest real names. No lorem, no grey boxes.
- **No throwaway branch.** The folder is gitignored. The winner goes into `DESIGN.md`, not into git.

The default state is not enough. Each key screen also gets empty, loading and error, as frames in the same file (`?variant=B&state=empty`).

### 3. Self-check, then show

Screenshot each variant at desktop and mobile:

```
node <skill>/scripts/capture.mjs "file://$PWD/design-exploration/<slug>/prototype/today.html?variant=B&capture" --out <scratch>/today-b.png
node <skill>/scripts/capture.mjs "file://$PWD/design-exploration/<slug>/prototype/today.html?variant=B&capture" --out <scratch>/today-b-mobile.png --width 390
```

Shoot every state of every variant, not only the default. Check them against the rules: Idea first, then hard, then soft. That includes the hard rules about controls: every input has a visible label, focus and pressed exist, and what looks tappable has a stated result. A hard finding after approval reopens an approved screen. Fix what fails before they see it. Then give the paths and the `?variant=` keys, name the colours and faces each variant uses, and ask which leads, what to take from the others, and whether the colour and type are right. Expect "the header from B with the list from C": that is the design. Iterate on the prototype until they say it is right.

A pattern can bring a feature the brief does not have. Name it when you show it. If they keep it, that is a product change: `idea`, Change, before `DESIGN.md`.

An `ownable` from `direction.md` is unconfirmed until they have seen it rendered. Confirm it or replace it here.

A gap no reference covers (a screen, a control) → `design-direction` one-piece mode with its own slug, then back here.

### 4. Approve: write `DESIGN.md` in one go

Only on their yes to a rendered prototype. Write the whole file from [design-md-template.md](references/design-md-template.md): idea, voice, colour, type, spacing, components, decisions. Write it once, from what was approved. Do not draft it during iteration.

- **Contrast first.** Every text and background pair, and every control colour against its ground, goes through `scripts/contrast.mjs` before it is written: 4.5:1 for body text, 3:1 for large text and non-text marks. A failing pair is fixed in the prototype, shown again, then written. Never write a failing pair.
  ```
  node <skill>/scripts/contrast.mjs "#1b1b1f on #fafaf7" "#c2410c on #fafaf7:mark"
  ```
- **Ideas, not sources.** `DESIGN.md` is committed and often public. It never names a product, site, studio or designer from the exploration, and never cites a `design-exploration/` path. Turn each into the idea: "a quiet reading page", not whose.
- **Write down what makes it this design.** Whatever someone would need to rebuild it without the prototype open goes under Components, with values, not adjectives.
- **Tokens are code names.** Name each colour, type and spacing token as it will be named in code (`color/ink`, `space/md`). Figma variables use the same names, with code syntax `var(--color-ink)`.
- **Soft rules overridden on purpose** go under Decisions with the reason. Hard rules cannot be overridden.

### 5. Figma

Load `figma-use`, `figma-generate-library` and `figma-generate-design`, and follow them. This skill adds only what they do not decide.

- **One file per product.** A new one if the project has none (`figma-create-new-file`). Put its URL in `DESIGN.md`.
- **Our tokens, not a kit.** Variables and styles come from `DESIGN.md`. New files may come with community kits attached (Material, Apple, Simple Design System). Their discovery steps tell you to reuse them. Do not: search the file only (no `includeLibraryKeys`), and build what is missing from `DESIGN.md`.
- **Build, do not capture.** Compose screens from the tokens and components. Do not run `generate_figma_design` on the prototype. It is a throwaway with a switcher. For pictures, create the image frames, then `upload_assets` the prototype's own files with those `nodeIds`.
- **Pages:** Cover, Foundations, Components; one `Screens — <flow>` page per flow from the brief; `Explorations` for anything kept for later, by date.
- **Order:** tokens and styles from `DESIGN.md` → only the components the key screens need → the key screens → their states. The library grows with features. It is not built ahead.
- **States:** every screen has empty, loading and error frames next to the default, named `<screen> — <state>`.
- **Components have their states too:** focus and pressed for every control, before a screen uses it.
- **One text style per weight used.** Changing a font on styled text detaches it. A weight `DESIGN.md` does not list is a new style, and a new row there.
- **Trust the file, not the picture.** Take a screenshot only after the edit has returned, and read text back from the nodes. A cloned variant loses its text property links: wire them again. Swapping an instance can keep old overrides: replace it with a fresh one.
- **Be faithful to the approved prototype.** It is what they said yes to, and Figma is that design, not a new reading of it. Tokens carry the values, not the whole design, so work with the approved variant open and match it. If something cannot be built the same way, say so and ask. Never simplify it silently.
- **Check each screen** with `design-check` frame mode before showing it, passing the prototype shot. Fix its hard findings.
- **Ready:** when they approve a frame, rename it `<screen> — <state> — Ready`. Tickets link Ready frames, and build is checked against them.

If a Figma decision changes a rule (a new token, a component variant, a spacing step), update `DESIGN.md` in the same turn and say what changed.

### 6. Clean up

Offer to delete `design-exploration/<slug>/`. `DESIGN.md` and Figma now carry the result. On no, leave it. It is gitignored either way.

Then offer the next stage: architecture (`grill-with-docs`). Tell it to seed `GLOSSARY.md` from the brief and the copy in the Figma screens, and to ask before renaming a term the screens show.

## Feature loop

A feature with screens, once `DESIGN.md` exists.

- **Only existing parts?** Compose the screens in Figma from the library, with their states, and skip the prototype and `design-direction`.
- **New parts?** Prototype only the new parts, on the real screens around them, in `design-exploration/<feature>/prototype/`, then as above.
- New page `Screens — <feature>`. Reuse components. New ones are added to Components.
- `DESIGN.md` gets entries (a token, a component, a decision with date and reason). It is never rewritten in a feature.
- **Identity changes need their own yes.** A new colour role, a typeface, a change to the idea or the voice: ask for each one separately, after showing it rendered. Two such changes are approved one at a time, never bundled.
- A rebrand is not a feature: that is `design-direction` again, then a first pass.

## Do not

- Write `DESIGN.md` before they approve a rendered prototype, or rewrite it during a feature. Only a rebrand's first pass replaces it.
- Name a reference or a `design-exploration/` path in `DESIGN.md`.
- Use a community kit's components or variables in Figma.
- Build the whole component library before the screens need it.
- Mark a frame Ready that has no empty, loading and error states, or that has open hard findings.
