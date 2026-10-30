---
name: design-md
description: >
  Use when building or changing UI and the project has a DESIGN.md, or when
  they confirmed writing or updating the brand file. Follow that file. Write
  or update DESIGN.md only from what they confirmed: the adaptation after a
  hunt, or decisions they approved on a rendered prototype (with the reason,
  the date, and a contrast check). DESIGN.md names ideas, never sources or
  .design paths. Do not copy a reference’s exact palette or faces. Do not
  invent a look they did not accept. If they asked to design or define
  direction and there is no DESIGN.md and no Figma, that is
  design-reference-hunt first.
---

# DESIGN.md

The project's `DESIGN.md` is the durable look. Coding follows it when it exists.

## Follow

If the file exists, read it before writing UI. Use its colour, type, spacing, control, behaviour, and components the way that file states them.

They asked to **hunt**, **define direction**, or find references → load `design-reference-hunt`. Do not rewrite this file until they confirm after that pass.

## Write or update (only on confirm)

Write or change `DESIGN.md` only when they said yes to persisting the adaptation (after a whole-look leading pick, or after accepting a later hunt), or approved a decision on a rendered prototype (below). Do not invent hexes, faces, or controls. Do not copy the leading card’s `colour` or `type` into the brand. Take the adaptation from:

- `.design/board.md` **Read this** (`take`, `change`, `ownable`, `colour`, `type`, `control`, `behaviour`, `leave`, `gaps`), or
- `.design/hunts/<slug>/board.md` **Read this** when the change is a later pass they accepted

`.design/moodboard.html` is the references. Do not read it as the brand: the brand is **Read this**.

If a whole-look **Read this** has no `take`, `change`, `colour`, or `type`, or has no `ownable`, stop and send it back to the hunt. Do not fill those in here.

If neither file exists, ask which reference to follow. Do not guess.

Refuse to write a colour palette whose text/background pairs have not been through contrast check. On a board from `design-reference-hunt`, **Read this** `contrast` lists each adapted pair with ratio and verdict (`scripts/contrast.mjs`). Body and small text need 4.5:1; large text and non-text marks need 3:1. If pairs are missing or any still FAIL, send the board back — do not write failing hexes into `DESIGN.md`.

**Ideas, not sources.** `DESIGN.md` is usually committed, and often public; `.design/` is not. It never names a product, site, studio, or designer the hunt looked at, never cites a `.design/` path, and its contrast notes name our tokens, not a reference's colour. The board's card names and its `leave` line name sources, which is fine there. Turn each into the idea before it crosses: “a quiet reading page, light and dark”, not the product it came from; “a bright brand accent”, not whose.

## Decisions approved on a prototype

Most of a design is made after the direction, on rendered screens: the controls, the text sizes, the navigation, the states. When they approve one of those decisions on a rendered prototype, it may go into `DESIGN.md` without a hunt. Write what was approved, the reason they gave, and the date, under **Decisions**. Every new or changed colour token — a surface, a pressed state, a selection, a focus ring, a faint control — goes through the hunt skill's `scripts/contrast.mjs` first, with the same thresholds. An `ownable` element marked unconfirmed is confirmed here, once they have seen it rendered, or replaced.

## The file

Expand the adaptation into a short brand file a builder can follow without the shots open:

```markdown
# Design

To see it working: <prototype path, once there is one>. This file wins where they differ.

## Direction
- leads: <the idea that leads, in our words>
- also: <other ideas they liked, in our words, or none>
- draws on: <what we learn from them: a layout, a temperature, a kind of picture>
- change: <the twist>
- ownable: <the one concrete element from the project’s own identity; “unconfirmed” until seen rendered>
- leave: <ideas we do not use, in our words: “a bright brand accent”, never a product's name>

## Colour
- <adapted hex>: <where it sits — ground, text, accent, control fill only if the shot fills one>

## Type
- <adapted pairing, and how it is used>

## Control
- <text link | filled shape | absent, and where it sits — from the leading hero>

## Layout
- <what we take that still belongs on this topic. Form cards: layout or component only, not their type or colours>

## Behaviour
- <how the page moves, pages, fades, or reveals. Omit the section when Read this says none>

## Imagery
- <what the pictures are, if any>

## Gaps
- <screens with no strong reference, from Read this. A builder treats these as open, not as solved by a borrowed pattern. A prototype closes them>

## Decisions
- <date>: <what they approved on the prototype> — <the reason they gave>

## Do not
- <the leave line, as ideas>
```

A **later hunt** they accepted: update only the sections that pass changes (often Layout, sometimes Control). Keep colour and type unless they explicitly accepted a change to those. Say in chat what you changed.

A full redo of the whole look they accepted: rewrite the file from the new adaptation.

## Missing file

- They asked to **define direction**, **hunt**, or **design a page** and there is no Figma → `design-reference-hunt` first. This skill waits for confirm.
- They asked only for a **brand file / DESIGN.md** with no board → ask which reference to follow, then write.

Leave brand catalogs out of the repo. Leave a second visual system out when one already exists.
