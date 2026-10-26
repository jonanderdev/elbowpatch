---
name: design-md
description: >
  Use when building or changing UI and the project has a DESIGN.md, or when
  they confirmed writing or updating the brand file after a hunt. Follow that
  file. Write or update DESIGN.md only from the adaptation they confirmed
  after a hunt — colour, type, control, what we take, what we change, and
  leave. Do not copy a reference’s exact palette or faces. Do not invent a
  look they did not accept. If they asked to design or define direction and
  there is no DESIGN.md and no Figma, that is design-reference-hunt first.
---

# DESIGN.md

The project's `DESIGN.md` is the durable look. Coding follows it when it exists.

## Follow

If the file exists, read it before writing UI. Use its colour, type, spacing, control, and components the way that file states them.

They asked to **hunt**, **define direction**, or find references → load `design-reference-hunt`. Do not rewrite this file until they confirm after that pass.

## Write or update (only on confirm)

Write or change `DESIGN.md` only when they said yes to persisting the adaptation (after a whole-look leading pick, or after accepting a later hunt). Do not invent hexes, faces, or controls. Do not copy the leading card’s `colour` or `type` into the brand. Take the adaptation from:

- `.design/board.md` **Read this** (`take`, `change`, `ownable`, `colour`, `type`, `control`, `leave`, `gaps`), or
- `.design/hunts/<slug>/note.md` when the change is a later pass they accepted

`.design/moodboard.html` is the references, and `.design/proof.html` is the adaptation shown with the project’s own words. Do not read either as the brand: the brand is **Read this**.

If **Read this** has no `take`, `change`, `colour`, or `type`, or has no `ownable`, stop and send it back to the hunt. Do not fill those in here.

If neither file exists, ask which reference to follow. Do not guess.

Refuse to write a colour palette whose text/background pairs have not been through contrast check. On a board from `design-reference-hunt`, **Read this** `contrast` lists each adapted pair with ratio and verdict (`scripts/contrast.mjs`). Body and small text need 4.5:1; large text and non-text marks need 3:1. If pairs are missing or any still FAIL, send the board back — do not write failing hexes into `DESIGN.md`.

Expand the adaptation into a short brand file a builder can follow without the shots open:

```markdown
# Design

## Direction
- leads: <card name>
- also: <card name, or none>
- from: .design/board.md | .design/hunts/<slug>/note.md
- take: <from Read this>
- change: <the twist>
- ownable: <the one concrete element from the project’s own identity, from Read this>
- leave: <their name, their exact colours, their exact faces, and the rest>

## Colour
- <adapted hex>: <where it sits — ground, text, accent, control fill only if the shot fills one>

## Type
- <adapted pairing, and how it is used>

## Control
- <text link | filled shape | absent, and where it sits — from the leading hero>

## Layout
- <what we take that still belongs on this topic. Form cards: layout or component only, not their type or colours>

## Imagery
- <what the pictures are, if any>

## Gaps
- <screens with no strong reference, from Read this. A builder treats these as open, not as solved by a borrowed pattern>

## Do not
- <the leave line>
```

A **later hunt** they accepted: update only the sections that pass changes (often Layout, sometimes Control). Keep colour and type unless they explicitly accepted a change to those. Say in chat what you changed.

A full redo of the whole look they accepted: rewrite the file from the new adaptation.

## Missing file

- They asked to **define direction**, **hunt**, or **design a page** and there is no Figma → `design-reference-hunt` first. This skill waits for confirm.
- They asked only for a **brand file / DESIGN.md** with no board → ask which reference to follow, then write.

Leave brand catalogs out of the repo. Leave a second visual system out when one already exists.
