---
name: design-reference-hunt
description: >
  Find real visual references and propose an adaptation, so the project gets a
  DESIGN.md. Does not code pages. Runs when there is no DESIGN.md and no Figma,
  or when they ask to hunt, define direction, or find references for a piece.
  Talk first (one round), search small, write short cards to .design/board.md,
  open scripts/moodboard.mjs so they pick by looking, say the adaptation (take,
  change, leave, ownable, gaps, colour, type), then ask to write DESIGN.md as
  its own message. A later hunt for one piece writes .design/hunts/<slug>/.
  .design/ is scratch: out of git, and safe to delete once DESIGN.md exists.
---

# Reference hunt

The goal is one file: `DESIGN.md`, a direction someone can later build or draw a Figma file from. Everything under `.design/` is scratch on the way there. It is out of git, and they may delete it once `DESIGN.md` exists. Do not keep an archive.

This skill does **not** lay out or code a page. Building is the router, only when they asked to build.

## Gate

Look at the repo and the prompt. Do not ask whether `DESIGN.md` exists.

1. They pasted a Figma link, or one is in the repo, and they did not ask to hunt → build from Figma. Stop.
2. `DESIGN.md` exists and they did not ask to hunt → follow it. Stop.
3. They asked for one piece (a view, a section, a control, an empty state, “ideas for X”, “double-check X”) → **Later hunt**. With or without a `DESIGN.md` or a `.design/` folder.
4. Otherwise → **Whole look**. If a `DESIGN.md` exists and they asked to redo the look, say it stays as it is until they answer the persist ask, which then asks to **replace** it.

## Whole look

### 1. Talk first — one round

Read the repo first: the README and product file give the subject, the surface, and the identity nouns. Then send one message and wait. Do not search in that turn.

```
I don't see a Figma file or a DESIGN.md for this project. If you have a Figma file, paste the link now and I'll build from that instead. If not, let's find the direction together. Skip any of these with "go" and I'll decide.

1. How should it feel, and never feel? Any apps, sites, brands, books or places you love for this?
2. Pictures you already like? Screenshots, links or files.
3. I read this as <subject>, a <website | app>, and the name gives me <identity nouns>. Right? For an app: the main screens, and how you move between them?
4. Does it need pictures? A website usually does. An app like this may not.
5. Where should I look? [x] <source> — <what it gives> … [ ] your own
6. How many references do you want to see? 6 / 12 / 20
```

Default sources:

- **App:** popular Dribbble, Pinterest, and component galleries. Mobbin and Refero unticked (login wall). No award galleries.
- **Website:** Awwwards, Godly, Land-book, siteinspire, MaxiBestOf, Recent. Dribbble for screens. Dark Mode Design only when the look is dark.
- **Imagery** (Unsplash, Wikimedia, museums) only when question 4 says yes.

Anything skipped is yours to decide: say what you chose in one line, then search. A Figma link at any point before the search → build from it. A brief that contradicts itself is `grilling`, not a second round.

A picture they gave is a **seed**: a card with `source: user`, never scored or dropped. Seeds steer the queries (“more like this”).

### 2. Search small

Read [sources.md](references/sources.md) before keeping anything. Do not narrate while looking: one line at the end is enough (“Found 11, building the moodboard.”).

- **The keep is the number they chose** (default 10 for an app, 12 for a website). Eight strong beat twenty adequate. A thin field stays thin: say what was missing instead of lowering the filter.
- **Query the form, not the word.** “writing app” returns T-shirts and essay mills; `product-design?q=text+editor+screen` returns screens.
- **Thumbnails are the first cut.** Use `scripts/contact-sheet.mjs` in scratch, then open the shortlist at full size. Nothing is kept from a thumbnail.
- **Capture only a keep:** `node <skill>/scripts/capture.mjs <url> --out .design/refs/<name>.jpg`.
- **App:** a real product's screen outweighs a Dribbble concept, which has never faced real content.
- **Website:** live sites outweigh Dribbble shots. A site of another business gives a layout or a component only, never its colour or type.

On the first write to `.design/`, add `.design/` to `.gitignore` if it is missing, and say why in one line: the shots are other people's work. If `git ls-files .design` already lists files, say so and leave `git rm -r --cached .design` to them.

### 3. Write `.design/board.md`

One file. A few header lines, short cards, and **Read this** after they pick.

```
Asked: <feel, requirements, or none>
Sources: <what was searched, and any skip: "Mobbin: login wall">
Missing: <what the search could not find, or none>

### <name>
- source: <gallery, or user>
- url: <the page a person can open, or "none (shared in chat)">
- shot: .design/refs/<file>
- tagline: <about six words, the moodboard caption>
- worth taking: <one principle, not their name>
- colour: <hex + the element it was sampled from, e.g. "#2c2824 body text">
```

`colour` is optional on a card. When it is there, it is sampled from a crop of that element, never from a photo or a mockup frame. A product page (voice, not visuals) may be a card with `slot: product`; it stays off the moodboard.

### 4. Pick on the moodboard

```
node <skill>/scripts/moodboard.mjs .design/board.md --out .design/moodboard.html
```

Look at it yourself first (`capture.mjs "file://$PWD/.design/moodboard.html" --out <scratch>/moodboard.jpg`). Fix a wrong caption or a missing picture on the board and run it again. Then say where it is, say every tile links to its source, and ask one line:

> Which one leads, which do you also like, which feel wrong, and why?

If they say “you choose”, take the closest and say which. Do not rerun the moodboard to mark the pick.

### 5. Read this — the adaptation

Write it under the header lines, after their answer.

```
## Read this
- leads: <card>
- also: <cards they also liked, or none>
- why: <their reason, in their words>
- take: <what we keep: a layout, a temperature, a kind of picture, and from which cards>
- change: <the twist, so this is not that reference>
- ownable: <one concrete element from the project's own identity nouns. Unconfirmed until seen rendered>
- control: <the lead's main control: text link, filled shape, or absent, and where it sits>
- behaviour: <how it moves, pages, fades, or reveals, from which card, or none>
- colour: <adapted hexes by role (page, text, secondary, mark…), each with its reason>
- contrast: <each text/background pair: hex on hex, ratio, AA | AAA | FAIL>
- type: <adapted pairing, with a licence that covers how this ships>
- leave: <their name, their identity colours and faces, and what they said feels wrong>
- gaps: <key screens or moves no reference covers, the project's differentiator first>
```

- **The lead is the closest**, not the boldest: the subject's world is in the shot. It leads the feeling. It is not the brand.
- **A colour moves only for a reason:** contrast, the twist, our pictures, or a brand colour they have. A generic cream or ink may stay as sampled. Nudging `#f6f1e7` to `#f4efe4` is not an adaptation.
- **`ownable` answers** “what makes this <project> and not <lead>?” with one element made from the identity nouns: for a lighthouse logbook, a lamp-glow marker on the active item.
- **Every pair goes through** `scripts/contrast.mjs`: 4.5:1 for body text, 3:1 for large text and marks. Fix failures before the persist ask.

Then, in chat, say the adaptation: take, change, leave, `ownable`, and the colour and type. Keep it short.

## Later hunt

One piece: a view, a section, a control, an element, ideas, or a check. A `DESIGN.md` or a board does not block it, and neither has to exist.

1. Ask once, then wait:

   ```
   Any style or requirements for this? Optional.

   A few ways to search:
   - <a form you can type into a gallery: "a bar that fills once">
   - <…>
   - <…>
   ```

   Skip a half they already answered. If they already said both, search.
2. Keep up to 10, from at least 30 looked at, across the galleries that fit. Include the same piece in other subjects. Same quality filter.
3. Write `.design/hunts/<slug>/board.md` with the same cards, shots in `.design/hunts/<slug>/refs/`. `<slug>` names the piece (`pricing`, `empty-state`). If it exists, use `<slug>-2`.
4. Run the moodboard on that board into `.design/hunts/<slug>/moodboard.html`, and ask which they would take.
5. Write a short **Read this** for the piece (`leads`, `take`, `leave`). With a `DESIGN.md`, the piece keeps its colour and type unless they agree to change them.

## The persist ask

Its own message, never the end of a long reply. Use a yes/skip prompt if the harness has one.

- Whole look: **Write `DESIGN.md` from this adaptation?** Skip if you only want the references for now.
- Redo: **Replace `DESIGN.md` with this adaptation?** The current one stays until you say yes.
- Later hunt: **Update `DESIGN.md` with what we took for <piece>?**

Yes → load `design-md` and write from **Read this**. Skip → leave the board, and say once that `.design/` stays on this machine, so `DESIGN.md` is how anyone else sees the direction.

If their next message moves on without answering, ask once more, first in that reply. Then let it go.

After the answer, offer the next step as a short list:

- **Prototype the gaps** (recommended for an app): the main screen built from `DESIGN.md`, with `gaps` as its brief. That is a build, through the router. It lives outside `.design/` and is committed.
- **Hunt a gap**: a later hunt, one per gap. For a gap software has not solved, search outside software for the same form.
- **Stop here.** `.design/` can be deleted once `DESIGN.md` is written.

Then stop, unless they also asked to build.

## Do not

- Code or lay out a page, or hand-write the moodboard.
- Search before the Talk first answer, or ask a second round.
- Pad the keep by lowering the filter, or keep a shot you only saw as a thumbnail.
- Screenshot a listing, a search grid, or a candidate you are not keeping. Never stitch screenshots.
- Paste the lead's exact colours or faces into **Read this** as the brand.
- Put skill feedback or notes under `.design/`. Use the chat, or a file they name.
