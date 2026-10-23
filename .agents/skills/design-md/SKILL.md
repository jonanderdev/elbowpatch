---
name: design-md
description: >
  Use when building or changing UI and the project has a DESIGN.md, or when
  they confirmed writing or updating the brand file after a hunt. Follow that
  file. Write or update DESIGN.md only from a board or hunt note they accepted —
  expand colour, type, control, layout principles, and leave. Do not invent a
  look. If they asked to design or define direction and there is no DESIGN.md
  and no Figma, that is design-reference-hunt first, not this skill inventing.
---

# DESIGN.md

The project's `DESIGN.md` is the durable look. Coding follows it when it exists.

## Follow

If the file exists, read it before writing UI. Use its colour, type, spacing, control, and components the way that file states them.

They asked to **hunt**, **define direction**, or find references → load `design-reference-hunt`. Do not rewrite this file until they confirm after that pass.

## Write or update (only on confirm)

Write or change `DESIGN.md` only when they said yes to persisting the direction (after a whole-look primary pick, or after accepting a later hunt). Do not invent hexes, faces, or controls. Take them from:

- `.design/board.md` **Read this** and the primary / also cards, or
- `.design/hunts/<slug>/note.md` when the change is a later pass they accepted

If neither file exists, ask which reference to follow. Do not guess.

Expand the cards into a short brand file a builder can follow without the shots open:

```markdown
# Design

## Direction
- primary: <card name>
- also: <card name, or none>
- from: .design/board.md | .design/hunts/<slug>/note.md
- leave: <from Read this / cards>

## Colour
- <hex>: <where it sits — ground, text, accent, control fill only if the shot fills one>

## Type
- <pairing and how the shot uses it>

## Control
- <text link | filled shape | absent, and where it sits — from the primary hero>

## Layout
- <worth-taking principles that still belong on this topic. Form cards: layout or component only, not their type or colours>

## Imagery
- <what the pictures are, if any>

## Do not
- <identity and extras to leave from the cards>
```

A **later hunt** they accepted: update only the sections that pass changes (often Layout, sometimes Control). Keep colour and type unless they explicitly accepted a change to those. Say in chat what you changed.

A full redo of the whole look they accepted: rewrite the file from the new board.

## Missing file

- They asked to **define direction**, **hunt**, or **design a page** and there is no Figma → `design-reference-hunt` first. This skill waits for confirm.
- They asked only for a **brand file / DESIGN.md** with no board → ask which reference to follow, then write.

Leave brand catalogs out of the repo. Leave a second visual system out when one already exists.
