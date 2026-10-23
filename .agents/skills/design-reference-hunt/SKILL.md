---
name: design-reference-hunt
description: >
  Find real visual references and propose a direction. Does not code pages.
  With no official look (no DESIGN.md, no Figma, no .design/board.md), ask
  once for a Figma file; if they paste one, stop. If not, whole look →
  .design/board.md with cards (idea, hero, type, colour, worth taking) and
  a short Read this. After they pick a primary, say the direction in chat,
  ask once to write DESIGN.md (design-md); stop unless they also asked to
  build. Later hunt (piece, ideas, check) writes .design/hunts/<slug>/;
  after they accept, ask once to update DESIGN.md. Direction-only stops
  after persist. Before looking, ask once for style and requirements; on a
  piece, offer two or three search ideas. Use when they ask to hunt, define
  direction, or design with no look yet.
---

# Reference hunt

This skill finds references and proposes a direction. It does **not** lay out or code a page. Say the direction clearly in chat. Persist with `design-md` only after they confirm. Coding is the project’s router, only when they also asked to build.

Read [quality.md](references/quality.md) before you keep a reference. Weak nominees and generic Dribbble do not go on the board.

A Dribbble illustration is **imagery**, not a website. A Dribbble shot of a real screen can be a screen reference. It is never a Site.

## Modes (pick one)

| They asked… | This skill | Then |
|-------------|------------|------|
| Define direction / hunt only / find the look | Whole look or later hunt | Ask to persist `DESIGN.md` → **stop** |
| Design / build the page, no look yet | Whole look first | Ask to persist → router may build |
| Direction exists; build more UI | Do not hunt | Router builds from `DESIGN.md` / board |
| Hunt a piece / ideas / double-check | Later hunt | Ask to update `DESIGN.md` → stop, or build if they also asked |

## Where files go

Two places. They do not share shots.

- **Board** — the one full hunt when this project has no look. `.design/board.md` and `.design/refs/`. One board. Evidence for the direction. Card fields stay stable (idea, hero, type, colour, worth taking) so people and later builders can read the same file.
- **Hunt** — every other pass. `.design/hunts/<slug>/note.md` and `.design/hunts/<slug>/refs/`. Suggestion set. Does not replace the board, `DESIGN.md`, or a Figma file until they confirm a persist via `design-md`.

`<slug>` names what the pass is for: `pricing`, `primary-button`, `settings`, `home-ideas`, `home-check`. If that folder exists, use `<slug>-2`, then `<slug>-3`. Never overwrite a hunt. Never delete one. Leave an old `.design/piece.md` where it is. Do not write a new one.

A file in `.design/refs/` that the board does not cite gets deleted. A file in a hunt’s `refs/` that its note does not cite gets deleted. That delete stays inside the place this pass owns. Do not delete across those folders.

A search writes only its own place. The whole no-look search owns `.design/board.md` and `.design/refs/`. A loading search owns `.design/hunts/loading/` and the shots inside it. Neither replaces the other, whichever ran first. The same whole look may rewrite its own board and its own refs: the board is unfinished, or they asked to redo that whole look. It still leaves every hunt folder. A second pass of the same piece is the next slug (`loading-2`). It does not replace `loading`, and it does not replace the board. A different piece does not replace a sibling.

## Gate (do this first)

Check the repo and the prompt, in order. Stop at the first hit.

1. They did not ask to hunt or define direction, and `DESIGN.md` exists → follow it. Do not hunt a whole look.
2. They did not ask to hunt, and the prompt has a Figma file or link → implement from that file. Do not hunt.
3. They did not ask to hunt, and `.design/board.md` exists → whole look is done when **Read this** names a primary card, that card’s hero names the control, and any shortfall is named. Aims: a website, 10 live sites and up to 20 screens; an application, up to 20 screens and not an Awwwards, MaxiBestOf, or Recent set. Imagery is up to 10. A short board that does not name each drop is unfinished: finish the hunt. Missing control: open the shot and write it. Or run **Later hunt** if they asked for a section. Building is the router only if they asked to build.
4. They asked to hunt a view, a control, a section, new ideas, or a double-check → **Later hunt**. They asked only for a piece (a loading state, a button, an empty state, a section), including “build this and find references” → **Later hunt**. A page with no look is the whole look, not a piece. A direction or a design already in the project does not block this. Do not ask for a Figma file.
5. `.design/board.md` exists, and they asked to hunt again → **Later hunt** in a new folder. The board and `.design/refs/` stay. They asked to redo that same whole look → rewrite `.design/board.md` and `.design/refs/` only, and leave `.design/hunts/` in place.
6. Otherwise, for a **whole look** only: ask **once**, and wait. There is no board yet.

   Do you have a Figma file for this, or should I hunt references? If I hunt, any specific style or requirements are optional: how it should feel, and what it must do.

   - They paste a Figma link → implement from Figma. Stop hunting.
   - They say no, skip, or “hunt” → **Whole look** below. Style and requirements they added ride along. If they added none, do not ask again.

Do not ask whether DESIGN.md exists; look for the file.

## Before looking

Ask **once**, then wait. Do not look in that turn. The project’s subject is already known. This question is the style and the requirements the repo does not say.

On a whole look, that question is already in the Figma message. Do not ask it twice. Do not offer search ideas.

On a later hunt that is not a piece (`ideas` or `check`), ask:

Any specific style or requirements? How it should feel, and what it must do. Optional. Skip, and the search follows the subject alone.

On a **piece** (a view, a section, a component, or an element — a loading state, a button, an empty state), that same message also offers search ideas. Two or three. Each one is a form you can type into a gallery: a bar that fills once, a word that counts, a mark that draws itself. Not a mood, not a brand, not a palette, and not ten options. When a look already exists, the ideas are forms for this piece. They do not propose a new colour or a new type.

```
Any specific style or requirements for this? How it should feel, and what it must do. Optional.

A few ways to search:
- <idea>
- <idea>
- <idea>

A style or a requirement uses these too. Pick, rewrite, or drop one to change them. Skip, and the search follows the subject alone.
```

They already named a style or a requirement → do not ask that half again. They already named what to search for → do not offer ideas. Both already named → do not ask; search.

A reply that names a style or a requirement, and does not drop the list, uses those ideas plus what they added. A pick uses that idea. A rewrite replaces the ideas. “Not the third” drops that one. “Go” or “use these” uses the ideas. The style they named still applies when they drop the list. A bare no, skip, or “leave it” searches the subject alone. Do not treat that as a style.

What they accepted goes into the queries, with the subject, the page type, and the element. It does not lower the quality filter. If it fights the topic, keep the topic. A style is a query, not a reason to keep a weak shot. Write what was used on the board as `Asked:`, or on the hunt note as `asked:`. None is valid.

## Whole look

No `DESIGN.md`, no Figma, no `.design/board.md`. The first time this project needs a look. A direction that already exists, or a hunt they asked for beside a design, is **Later hunt**, not this.

Say once, in one line, what you are looking for, and that the closest come back as a short list. Then look without narrating. No scores, no drops, and no site called interesting until that list.

Look, then keep. The counts below are what you **keep**. They are not how many you open. More galleries do not raise those counts. They raise how many you open, across every gallery, until the ones that pass [quality.md](references/quality.md) are the keep. Do not fill that keep from the first gallery. Read listings and score pages, and do not stop at the first page. There is no small cap on looking. A website opens each live gallery — Awwwards, Godly, Land-book, siteinspire, MaxiBestOf, Recent, and Dark Mode Design when the subject, the register, or the style they asked for is dark — and uses Muzli only to reach the original. It looks through at least 60 live candidates, past the first page of each of those galleries, before it accepts fewer than 10 sites. It can stop once the keep is full of ones that pass and it has gone past the first page of each gallery this hunt opens. Screens go through the popular Dribbble sort and a Pinterest search, past the first page of each, and the other-subject queries, before it accepts fewer than the screens it could have kept. The screen cap stays 20. A thin field stays thin: name each drop, and do not lower the filter to fill the count.

Scroll and screenshot only a keep. Do not scroll a candidate. Do not screenshot a listing, a score page, or a URL you might drop. The capture script scrolls; run it only on a keep. A file in `.design/refs/` that is not on the board gets deleted. Leave `.design/hunts/` alone, including a loading hunt written before this board. Do not edit those notes or delete those shots.

1. Name the subject and the **surface**: `website` or `app`.
2. This year’s date. Do not search only the same subject. Also search the page type, the component, and the element, including other subjects that share that form. Add the style and the requirements they gave. Filter with [quality.md](references/quality.md).
   - **Website — Sites (aim 10), mixed `fit`:** live URLs from this year. These outweigh Dribbble. The aim stays 10. Prefer Awwwards SOTD / high scores (overall and Design ≥ 7.5; never 4s). Also Godly, Land-book, siteinspire, MaxiBestOf, and Recent. Dark Mode Design only when the subject, the register, or the style they asked for is dark. Muzli is a way into the original, not a page you keep. Supahero is heroes: open the live page when you keep a site. Aim `same-job` 2, `register` 2, `form` 6. `same-job` is this subject. `register` shares its feeling: the hour, the material, the ritual, or the kind of place. `form` is another type of business. From it, take only a layout or a component that still works once this topic’s pictures and words are in the frame. If that frame only makes sense for the other type, drop it. Not its type, and not its colours. Leave their identity. An older site only when nothing current has that structure.
   - **Website — Screens (up to 20):** strongly voted Dribbble from this year, after the quality filter, and a Pinterest pin that is one real screen. The cap stays 20. They lose to a kept site. Tag `role: page | component | element` and `subject: same-job | other`. An illustration stays imagery. These are not Sites.
   - **App — Products (up to 6):** public product pages of this job. Not Awwwards, not a campaign site. Fewer is valid when the board names each drop (a login wall, no public page).
   - **App — Screens (up to 20):** strongly voted Dribbble, a Pinterest pin that is one real screen, and component galleries. These outweigh product pages and award sites. The shot is the screen, a component, or an element. Other subjects that share that role count. An illustration stays imagery. Do not fill this board with Awwwards, MaxiBestOf, Recent, Supahero, or Dark Mode Design.
   - **Imagery (up to 10):** this subject’s world (Unsplash, Wikimedia, museums). Not stock category. A file counts when a crop can make the principle the subject. Drop the rest. Do not pad.
   - **Type / marks (1–2):** a pairing or a stamp you can name. MaxiBestOf fonts are a place to find one.
3. Scroll and screenshot only a keep. `node <skill>/scripts/capture.mjs <url> --out .design/refs/<name>.jpg` for that URL only. Do not stitch. How: [shots.md](references/shots.md). Jury quotes only from an Awwwards page you kept. Dribbble: the shot artwork of a keep, not the search grid.
4. Write `.design/board.md`. One file, two layers. **Read this** is a few lines a person can read. **Cards** are the references (idea, hero, type, colour, worth taking). A website is valid at 10 sites, or short when each missing site is named after the 60-candidate look across those galleries. Screens are up to 20. An application is valid with its screens, and invalid if the spine is Awwwards, MaxiBestOf, Recent, Supahero, or Dark Mode Design. A short one names each missing screen. Imagery is up to 10. Products are up to 6. Do not pad by lowering the filter. Hexes come from a kept shot, not a palette library. Later pages reuse it. Do not write a second board. A later pass is a hunt folder. Do not treat a short board that does not name each drop as finished.

`Asked:` sits above **Read this**. It is not a card.

**Read this** is written from the cards, after they choose. The primary card is the closest to this subject, not the largest type and not the highest score. Closest means the subject’s world is in the shot: the same job, or a register that shares its hour, its material, its ritual, or its kind of place. Colour and type come from that card, or from this subject’s pictures. A form card does not supply them. It can only add a layout or a component that still belongs on this topic.

Before you write **Read this**, ask once, and wait. That message names the two or three closest cards. Each one has its idea in one line, why it is close, and the live URL, so the page can be opened. It also says the shots and the other cards are in `.design/board.md`. It does not list scores, drops, or the other keeps. Their answer is the primary card. If they say you should choose, take the closest.

```
Asked: <style, requirements, and any search ideas used, or none>

## Read this
- primary: <card name>
- also: <one other card>
- control: <as that card’s hero describes it: text link, filled shape, or absent, and where it sits>
- colour: <where it sits in the shot>
- type: <the pairing>
- leave: <one line>
```

Each site, product page, or screen is a card, written from the open shot file. `role` is required on `form`. A hero that says “one action” and does not say what the control is does not count. On a website the primary card is the closest live site, not a form site chosen for its type. On an application it is a screen, not an award site.

```
### <name>
- source:
- score:
- fit: same-job | register | form
- role: page | component | element
- subject: same-job | other
- url:
- shot: .design/refs/<file>
- idea: <one sentence. The principle, not their name>
- hero: <what is in the frame. The control: text link, filled shape, or absent, and where it sits>
- type: <the faces, and how the shot uses them>
- colour: <hexes you can see, and where each sits. A colour is a button fill only when the shot fills a button with it>
- imagery: <what the pictures are>
- worth taking: <one principle. On a form card: a layout or a component only, and only if it still works on this topic. Not their type. Not their colours>
- leave: <their identity, and anything that is not the principle>
```

Imagery and type stay short. They are material, not cards.

```
- kind: imagery | type
- url:
- shot: .design/refs/<file>
- shows:
- leave:
```

The cards are the references. The shot files are the evidence.

## Later hunt

A suggestion set. Use it when they named a view, a section, a component, or a control; when they asked for new ideas or a double-check; when a direction exists and they asked to hunt; or when there is no look yet and they asked only for this piece.

Name `for` from what they asked. Ask once, as in **Before looking**, and wait. After they answer, look. Do not ask for a Figma file.

`status` is the project at the start of this pass:

- `no-direction` — no `DESIGN.md`, no Figma, no finished board
- `has-direction` — one of those exists
- `has-design` — the screen or the page is already designed (they said so, or it is in the repo). Use this when both are true.

`intent` is what they asked for: `piece` (a view, section, component, or element), `ideas` (new directions), or `check` (a double-check of a look that exists).

1. Name `for` (hero, menu, pricing, a button, the whole look, …) and, for a piece, its role: page, component, or element. Slug the folder from that name.
2. **Keep 10** after the quality filter when `for` is a piece. Not 20. The keep stays 10. Look through at least 30 candidates, past the first page, across the galleries that fit this piece, before you choose. Include the same role in other subjects. A whole-look `ideas` or `check` pass uses the **Whole look** keep counts, written in the hunt folder, not in `.design/board.md`. Name each drop. Do not pad. Dribbble (popular, this year), Land-book, Godly, MaxiBestOf, Recent, Supahero when the piece is a hero, component galleries, a Pinterest pin that is one real screen, Unsplash for imagery. Muzli only into the original. Dark Mode Design only when the subject, the register, or the style they asked for is dark. Add the style, the requirements, and, on a piece, the search ideas they accepted. Capture only what you keep. Crop to the **shot**, not the gallery. Live sites only if the piece is a whole block on a real page. A Supahero crop or a MaxiBestOf section can be the shot for that piece.
3. Tag each: `kind: section | component | imagery | type | mark` and `subject: same-job | other`. Do not file a drawing as a section.
4. Write `.design/hunts/<slug>/note.md`. Shots only in `.design/hunts/<slug>/refs/`. `node <skill>/scripts/capture.mjs <url> --out .design/hunts/<slug>/refs/<name>.jpg`. Do **not** replace `.design/board.md`, `DESIGN.md`, or `.design/refs/` from this pass alone. That holds when the board was written first and when this piece is hunted first. Do not delete a file in `.design/refs/` from this pass. If a board or `DESIGN.md` exists, a piece takes a layout principle from these refs and keeps that look’s colour and type unless they accept a change.

```
# Hunt
status: no-direction | has-direction | has-design
intent: piece | ideas | check
for: <hero / primary button / whole look>
asked: <style, requirements, and the search ideas used, or none>
replaces: nothing
### <name>
- kind: section | component | imagery | type | mark
- subject: same-job | other
- url:
- shot: .design/hunts/<slug>/refs/<file>
- idea:
- hero: <the frame, and the control>
- worth taking:
- leave:
Read this: <one sentence, from the cards. Suggestions for this pass. They do not replace the board, DESIGN.md, or a Figma file until confirmed.>
```

The note is the suggestion set. This skill does not rewrite `DESIGN.md` until **After they pick**.

## After they pick

Do not end the turn on raw cards alone.

**Whole look:** In the chat, name only the two or three closest, each with its live URL, and say the shots are in `.design/board.md`. Wait. After they answer, write **Read this**, say that direction in the chat (primary, control, colour, type, leave). Then ask **once**:

Write `DESIGN.md` from this direction? Colour, type, control, and layout principles from the primary card. Skip if you only want the board for now.

- Yes → load `design-md` and write the file from the board.
- No / skip → leave the board; do not invent a brand file.

**Later hunt:** Name the two or three closest the same way; shots in `.design/hunts/<slug>/`. Say this pass does not change the look until they accept. After they pick what to take, ask **once**:

Update `DESIGN.md` with what we accepted from this hunt? (Keeps colour and type unless we agreed to change them.)

- Yes → load `design-md` and update only what that pass changes.
- No / skip → leave `DESIGN.md` and the board as they were.

Then **stop**, unless they also asked to build, code, or design the page in the same ask. Coding is the project’s router after this skill finishes. The board and `DESIGN.md` are enough when the ask was direction only — say the direction in chat and stop.

The control in the primary card is the control. Do not add a filled button the card does not show. A custom cursor, a password gate, or a WebGL scene is used only when a card shows it. On a website the site cards outweigh the screen cards. On an application the screen cards outweigh award sites.

## Do not

- Code or lay out the page from this skill.
- Keep an Awwwards nominee with 4s or overall under 7.5.
- Stitch viewport screenshots. A file that repeats one fold is invalid.
- Screenshot a gallery listing.
- Put files under `.claude/`.
- Put page-build steps in this file.
- Write a second `.design/board.md`. A later pass is a hunt folder.
- Overwrite or delete `.design/hunts/<slug>/`. Use the next free slug.
- Put a later hunt’s shots in `.design/refs/`, or delete a hunt shot because the board does not cite it.
- Let a loading hunt replace `.design/board.md` or `.design/refs/`, or let the whole look replace `.design/hunts/`. Order does not matter. The only rewrite of the board is that same whole look.
- Rewrite `DESIGN.md` without their confirm. Persist only through `design-md` after **After they pick**.
- Write a new `.design/piece.md`.
- Pad the count by lowering the filter, or by keeping pictures you would not put on the page.
- Stop looking at the first page of results, or treat the keep count as the number of candidates you open.
- Scroll or screenshot a candidate. The capture script runs on a keep only.
- Narrate candidates, scores, or drops while looking. After the opening line, the next thing said is the short list of the closest, each with its live URL.
- Look in the same turn as the style question, or in the same turn as a piece’s search ideas. Wait for the answer, or for a skip.
- Offer search ideas on a whole look, or on an ideas or check pass.
- Search a piece with ideas they skipped.
- Write a hero that does not say what the control is.
- Treat a short board that does not name each drop as finished direction.
- Take colour or type from a card about another business.
- Let a card lead because its type is large, when a closer card has the subject’s world in the shot.
- Let a screen card be the primary card on a website, or an award site be the primary card on an application.
- Fill an application board with Awwwards, MaxiBestOf, Recent, Supahero, or Dark Mode Design.
- Raise a keep count because there are more galleries.
- Fill the keep from the first gallery and leave the others unopened.
- File a Supahero crop, a Pinterest pin, or a Muzli card as a Site.
- Open Dark Mode Design when the subject, the register, and the style they asked for are not dark.
