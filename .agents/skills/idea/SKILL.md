---
name: idea
description: >
  Turn an idea, or an existing repo, into docs/brief.md: one page that says
  what the product is, for whom, its core flows and key screens, and whether
  it has a UI. Grills in rounds until every section is settled, then writes
  the brief and offers the next stage. Runs first in a new project, when a
  repo has no brief, or when the product itself changes. A feature for a
  product that has a brief goes to to-spec, not here.
---

# Idea

One file comes out: `docs/brief.md`, about 500 words, one page. Every later stage reads it: `design-direction` for the people, surface and identity nouns, `design` for the key screens, `to-spec` for the flows. No stage asks for these again, so the brief has to settle them.

The brief says what and for whom, never how. No framework, database, host or library. Those are Architecture's.

## Gate

Look at the repo. Do not ask what is there.

1. `docs/brief.md` exists and they bring a feature → not this skill. Grill the feature with `grill-with-docs` when it brings new terms, otherwise `grilling`; then `to-spec`. The brief stays as it is.
2. `docs/brief.md` exists and the product itself changes (new people, new surface, a flow dropped) → **Change**.
3. No brief, and the repo has code or a README → **Existing project**.
4. Otherwise → **New idea**.

## New idea

Load Matt's `grilling` and run it. The design tree is the brief's sections below. Start with the frontier: a working name, problem, who it is for, surface. Flows, screens and scope hang off those. A working name is enough; it can change.

- One round per message, numbered, a recommended answer on each, as `grilling` says.
- Recommend from the idea itself. A one-line idea still has a likely person and a likely first flow: propose them, they correct.
- A section they do not care about gets your recommendation and a "yes" settles it. Never leave one blank.
- Stop asking when every section has an answer. Then say the brief in chat in six lines (problem, for, flows, surface, v1, out) and ask "Write `docs/brief.md`?" Write on yes.

## Existing project

Read the README, the package manifest, the routes or entry points, and any `docs/`. Draft every section you can from what is there and mark each one **from the repo** or **gap**. A section the code shows but the README contradicts is a gap.

Show the draft, then grill only the gaps, in rounds. Same confirm, same write.

## Change

Read the brief. Grill only what changes and what hangs off it: a new surface reopens key screens, a new person reopens flows. Update those sections, add a line under **Changes** with the date and why, and leave the rest word for word.

## The brief

```markdown
# <Product name>

<One sentence: what it is and for whom.>

## Problem
<What is hard or missing today, for whom, in two or three sentences. The cost of leaving it.>

## For
<The one person it is built for first: who, their situation, what they do today instead. Others later, in one line.>

## Flows
1. <Verb phrase, start to end: "log a catch from the boat in under a minute">
<3–5 flows. Each is one thing someone comes to do, and how they know it worked.>

## Key screens
- <Screen>: <what is on it, which flow it serves>
<2–4. The screens design prototypes first. No UI: "none".>

## Surface
<site | app | no UI (CLI, API, library)>. <One line why. A site is the page a person lands on to understand or choose; an app is the tool they come back to.>

## V1 and later
- v1: <what ships first, as flows from above>
- later: <what waits>

## Constraints
- <What is fixed: devices, offline, languages, accessibility needs, a deadline, a budget. Not tech choices.>

## Identity nouns
<4–8 concrete nouns from the product's world: the things, places, tools and materials its people know. "Tide, buoy, logbook, brass", not "trust, speed, simple".>

## Out of scope
- <What it will not do, so later stages do not drift into it.>
```

- Every section has content. "None" is an answer. A guess is not.
- **Changes** is added under Out of scope by the first Change, never before.
- Content is real: the longest names the people will type, the likely numbers, the real empty case. `design` uses them as copy.
- Over a page means a flow is really two products, or a section is doing Architecture's job. Cut it.

## After writing

Offer the next stage in one line:

- Surface is site or app → `design-direction`.
- No UI → stages 2 and 3 are skipped. Next is Architecture: `grill-with-docs`.

Do not start it until they say so.

## Do not

- Pick a stack, or write a requirement as one ("uses Postgres").
- Ask a question the repo or the idea already answers.
- Write the brief before they confirm the six-line summary.
- Edit the brief for a feature. Features get specs.
