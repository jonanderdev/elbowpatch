---
name: design-reference-hunt
description: >
  Find real visual references and propose an adaptation. Does not code pages.
  With no official look (no DESIGN.md, no Figma, no .design/board.md), talk
  first: one round on what they are into, pictures they like (seeds), the
  subject and surface, whether it needs pictures, which sources, and how
  many references to see; skip any with "go". Then search small and clean
  (form not word, a negative list, shipped apps first for an app) into
  .design/board.md with short cards. Run scripts/moodboard.mjs so they
  narrow by looking: which leads, which they also like, which feel wrong,
  and why. Then say the adaptation (take, change, leave, ownable, gaps,
  adapted colour and type), show .design/proof.html, and ask to write
  DESIGN.md as its own message (design-md) — never the last line of a long
  report. If they move on without answering, ask once more, first in that
  reply. Stop unless they also asked to build. A later hunt (piece, ideas,
  check) writes .design/hunts/<slug>/ and does not replace the moodboard;
  after they accept, ask to update DESIGN.md the same way. Direction-only
  stops after persist. Use when they ask to hunt, define direction, or
  design with no look yet.
---

# Reference hunt

This skill finds references and proposes an adaptation. It does **not** lay out or code a page. It writes `.design/moodboard.html` from the references — one fixed layout, the script’s — and opens that file **before** the pick, so they choose by looking rather than from two URLs. After they pick, the same script runs again to mark the lead. The moodboard is what we saw. The direction is the adaptation said after it: what we take, what we change, what we leave. Persist that adaptation with `design-md` only after they confirm. Coding is the project’s router, only when they also asked to build.

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

The board and a hunt do not share shots. The moodboard is the references, for a person to look at.

- **Board** — the one full hunt when this project has no look. `.design/board.md` and `.design/refs/`. One board. Evidence. Card fields stay stable (idea, hero, type, colour, worth taking) so people and later builders can read the same file.
- **Moodboard** — `.design/moodboard.html`. Written by `scripts/moodboard.mjs` from the board, before the pick, and written again after it with `--leads`. One file. The number of references they chose, type we saw, colour we saw. It is the narrowing step: they pick the lead by looking at it, so it is built before they answer, not only after. Images first: each tile is the shot, the card name, and at most the card’s `tagline:`. Not the brand. A later hunt does not replace it. A redo of this whole look rewrites it.
- **Proof** — `.design/proof.html`. Written by `scripts/proof.mjs` from **Read this**, after the narrowing answer and before the persist ask. The adaptation with this project’s own words in it. Not the product. A redo rewrites it. A later hunt leaves it.
- **Hunt** — every other pass. `.design/hunts/<slug>/note.md` and `.design/hunts/<slug>/refs/`. Suggestion set. Does not replace the board, the moodboard, `DESIGN.md`, or a Figma file until they confirm a persist via `design-md`. A confirmed later hunt still leaves the moodboard.

`<slug>` names what the pass is for: `pricing`, `primary-button`, `settings`, `home-ideas`, `home-check`. If that folder exists, use `<slug>-2`, then `<slug>-3`. Never overwrite a hunt. Never delete one. Leave an old `.design/piece.md` where it is. Do not write a new one.

A file in `.design/refs/` that the board does not cite gets deleted. A file in a hunt’s `refs/` that its note does not cite gets deleted. That delete stays inside the place this pass owns. Do not delete across those folders.

A search writes only its own place. The whole no-look search owns `.design/board.md` and `.design/refs/`. A loading search owns `.design/hunts/loading/` and the shots inside it. Neither replaces the other, whichever ran first. The same whole look may rewrite its own board and its own refs: the board is unfinished, or they asked to redo that whole look. It still leaves every hunt folder. A second pass of the same piece is the next slug (`loading-2`). It does not replace `loading`, and it does not replace the board. A different piece does not replace a sibling.

Skill feedback and session notes stay in the chat, for them to forward, **unless they ask for a file**. If they ask, write it where they say, or at the repo root — never under `.design/`. There is no `.design/feedback/`. `.design/` is the board, the moodboard, the proof, the hunts, and the shots those cite.

## Gate (do this first)

Check the repo and the prompt, in order. Stop at the first hit.

1. They did not ask to hunt or define direction, and `DESIGN.md` exists → follow it. Do not hunt a whole look.
2. They did not ask to hunt, and the prompt has a Figma file or link → implement from that file. Do not hunt.
3. They did not ask to hunt, and `.design/board.md` exists → whole look is done when **Read this** names the leading card, the control, the adaptation (`take`, `change`, `ownable`, `colour`, `type`, `leave`, `gaps`), and the adapted contrast pairs. Aims: the keep they chose in **Talk first** — a website, live sites first; an application, shipped and Dribbble screens and not an Awwwards, MaxiBestOf, or Recent set. Imagery only when the look uses pictures. Read this also names `ownable` and `gaps`. A short board that does not name each drop is unfinished: finish the hunt. Missing control: open the shot and write it. Missing adaptation: say the twist, do not copy the leading card’s colours and faces. Or run **Later hunt** if they asked for a section. Building is the router only if they asked to build.
4. They asked to hunt a view, a control, a section, new ideas, or a double-check → **Later hunt**. They asked only for a piece (a loading state, a button, an empty state, a section), including “build this and find references” → **Later hunt**. A page with no look is the whole look, not a piece. A direction or a design already in the project does not block this. Do not ask for a Figma file.
5. `.design/board.md` exists, and they asked to hunt again → **Later hunt** in a new folder. The board, `.design/refs/`, and `.design/moodboard.html` stay. They asked to redo that same whole look → rewrite `.design/board.md` and `.design/refs/`, and leave `.design/hunts/` in place. The moodboard is rewritten from the new board. A redo **looks somewhere new**: at least one source the last board’s `Sources:` did not use, and one deliberately opposite query (“dark-first writing app”, “editorial magazine app”), to test whether the lead still wins. Say which two in the board’s `Sources:` line. It still runs **Talk first**, with the previous answers offered as the defaults. An existing `DESIGN.md` stays exactly as it is until they answer the persist ask, and that ask says it **replaces** the current file.
6. Otherwise, for a **whole look** only: **Talk first**, below. One round of questions, then search. There is no board yet.

Do not ask whether DESIGN.md exists; look for the file.

## Talk first

A direction starts as a conversation, not a search. The corrections that matter — “not only recipes, any kind of cooking”, “I picked it for the typography, not the layout”, “does an app like this even need pictures?” — arrive after the search when nobody asked first, and then they patch a result instead of shaping it.

**One round.** One message, the questions below, each of them skippable. Then wait. Do not look in that turn. Do not ask a second round before searching.

Read the repo first. The subject, the surface, and the identity nouns come from the code, the README, and the product file. The questions are a check and the things the repo cannot say.

```
I don't see a Figma file or a DESIGN.md for this project. If you have a Figma file, paste the link now and I'll build from that instead of searching. If not, let's find the direction together before I search. Skip any of these with "go" and I'll decide.

1. What are you into? How it should feel, what it should never feel like, and any apps, sites, brands, books or places you love for this.
2. Pictures you already like? Screenshots, links or files — for this project or not.
3. I read this as <subject>, a <website | app>, and the name gives me <identity nouns taken from the name and the story>. Broader, narrower, or wrong? Are those nouns fair game for the look?
4. Does it need pictures? A website usually does. An app like this one may not.
5. Where should I look? Defaults for <surface> are ticked. Untick, or add your own.
   [x] <source> — <what it gives>
   [x] <source> — <what it gives>
   [ ] <source> — <what it gives>
   [ ] Your own: ______
6. How many references do you want to see at the end? 8 / 12 / 20
```

Defaults for the checklist, before they touch it:

- **App:** shipped app screens first — the products' own in-app screenshots (App Store listings, press kits, help docs) — then Dribbble (popular this year, product-design / mobile / web-design paths), then component galleries. Mobbin and Refero are offered unticked: they often need their login, and a login wall is a named skip, not a silent one. Award galleries stay unticked for an app.
- **Website:** Awwwards, Godly, Land-book, and siteinspire ticked; MaxiBestOf and Recent ticked; Dribbble ticked for screens; Dark Mode Design only when the subject, the register, or the style is dark.
- **Imagery sources** (Unsplash, Wikimedia, museums) are ticked only when question 4 says this look uses pictures.

**Rules.**

- Anything skipped is yours to decide. Say in one line what you chose, then search. Do not ask again.
- A question they already answered in their prompt is not asked again.
- They paste a Figma link, in this reply or any later one before the search starts → implement from that file. Stop hunting. The message above says so on its first line, because nothing else asks.
- The answers go on the board: `Asked:` (feel, requirements), `Seeds:`, `Sources:`, `Refs:`. They drive the queries. They do not lower the quality filter — a style is a query, not a reason to keep a weak shot.
- A brief that is thin or contradicts itself after this round is what `grilling` is for. One round here, then grill, then search.

**Seeds.** A picture they already like is a seed. Keep it on the board as a card with `source: user` and `fit: seed`, cite the file or the link they gave, and do not score it — they chose it. Seeds steer the queries (“more like this”) and they rank the candidates: a candidate that looks like a seed goes to the top of the contact sheet. A seed is never dropped for being off-gallery.

## Before looking — later hunt

A later hunt asks **once**, then waits. Do not look in that turn. The whole look asks in **Talk first** instead; do not ask twice.

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

What they accepted goes into the queries, with the subject, the page type, and the element. It does not lower the quality filter. If it fights the topic, keep the topic. Write what was used on the board as `Asked:`, or on the hunt note as `asked:`. None is valid.

## Whole look

No `DESIGN.md`, no Figma, no `.design/board.md`. The first time this project needs a look. A direction that already exists, or a hunt they asked for beside a design, is **Later hunt**, not this.

Say once, in one line, what you chose for anything they skipped and what you are looking for. Then look without narrating. No scores, no drops, and no site called interesting until the moodboard is open.

**Search small and clean.** The keep is what they chose in **Talk first** (default 10 for an app, 12 for a website), not a fixed 20. Eight strong references beat twenty adequate ones. The keep is not how many you open, and the filter does not drop to fill it. A thin field stays thin: name each drop.

- **Query for the form, not the word.** For “writing app” most of what comes back is about the *word*: print-on-demand tees, CV services, tracing worksheets, essay mills. Use the category path and add the form: `/search/shots/popular/product-design?q=writing+app+ui`, `/mobile?q=text+editor+screen`, `/web-design?q=…`. Other subjects that share the form count: the page type, the component, the element.
- **Negative list.** `scripts/dribbble-cards.mjs` drops the shared list from [quality.md](references/quality.md) by slug and title before a thumbnail is fetched, and prints the noise rate. Extend it with `--drop`, relax it with `--keep`.
- **Seeds rank.** When they gave pictures they like, candidates that look like a seed go first on the contact sheet. Query “more like this” from each seed.
- **A stop rule, not a floor.** For an app, stop when two more queries add nothing to the shortlist. For a website, the 60-candidate look across each live gallery still applies before it accepts fewer than the keep.
- **Noise rate.** A query’s noise rate goes under the board’s drops: “629 after filtering, about 40% off-topic”. A high rate means the query is wrong. Fix it. Do not scroll more.
- **Contact sheets are the first cut only.** Thumbnails cannot show type, and for a typography brief type is the whole question. Open every shortlisted shot at full size before it is kept. A shot you only saw as a thumbnail is not a keep.
- Screens come from the popular Dribbble sort and a Pinterest search, past the first page of each, and from the sources they ticked. A website opens each live gallery they ticked — Awwwards, Godly, Land-book, siteinspire, MaxiBestOf, Recent, and Dark Mode Design when the subject, the register, or the style is dark — and uses Muzli only to reach the original.

Scroll and screenshot only a keep. Do not scroll a candidate. Do not screenshot a listing, a score page, or a URL you might drop into `refs/`. Viewing a listing’s own thumbnails is allowed (not a capture; writes nothing to `refs/`). Use `scripts/contact-sheet.mjs` on candidate image URLs in a scratch folder, then open only the shortlist at full size. The capture script scrolls; run it only on a keep. Relative `--out` paths resolve against the git project root. A file in `.design/refs/` that is not on the board gets deleted. Leave `.design/hunts/` alone, including a loading hunt written before this board. Do not edit those notes or delete those shots.

1. Name the subject and the **surface**: `website` or `app`, as corrected in **Talk first**. Whether this subject **uses pictures** was asked there. A website or a marketing page usually does. An application whose look has no imagery in the product does not: hunt imagery only when it serves something named (a mascot, a texture, a marketing page later), and say on the board what it serves. Otherwise imagery is 0, the board says `imagery: none — this look has no pictures in it`, and that board is complete. Do not pass `--imagery` to the moodboard in that case.
2. This year’s date. Add the style and the requirements they gave. Filter with [quality.md](references/quality.md).
   - **Website — Sites (aim 10), mixed `fit`:** live URLs from this year. These outweigh Dribbble. Prefer Awwwards SOTD / high scores (overall and Design ≥ 7.5; never 4s). Muzli is a way into the original, not a page you keep. Supahero is heroes: open the live page when you keep a site. Aim `same-job` 2, `register` 2, `form` 6. `same-job` is this subject. `register` shares its feeling: the hour, the material, the ritual, or the kind of place. `form` is another type of business. From it, take only a layout or a component that still works once this topic’s pictures and words are in the frame. If that frame only makes sense for the other type, drop it. Not its type, and not its colours. Leave their identity. An older site only when nothing current has that structure.
   - **Website — Screens:** strongly voted Dribbble from this year, after the quality filter, and a Pinterest pin that is one real screen. They lose to a kept site. Tag `role: page | component | element` and `subject: same-job | other`. An illustration stays imagery. These are not Sites.
   - **App — Screens (the keep they chose):** **shipped apps first.** The real in-app screens of comparable products: their App Store listings, press kits, and help docs, and shipped-screen galleries (Mobbin, Refero) when they ticked them — a login wall is a named skip, not a silent one. Then strongly voted Dribbble (likes and views — see [quality.md](references/quality.md)), a Pinterest pin that is one real screen, and component galleries. A Dribbble concept is a mockup: it has never faced a long essay, a phone keyboard, an empty state, or the product’s key feature. Mark each card `shipped: yes | concept`. These outweigh product pages and award sites. Do not fill this board with Awwwards, MaxiBestOf, Recent, Supahero, or Dark Mode Design.
   - **App — Products (up to 6):** public product pages of this job. Not Awwwards, not a campaign site. Fewer is valid when the board names each drop. Product pages give voice and principle. The visual direction comes from screens. They stay on the board; they do not go on the moodboard.
   - **Register outside screens:** for a typography-first brief, one or two cards from book design, publishers, or editorial typography are allowed. `fit: register`, `slot: screen` if it is a page you can show, and say why on the card.
   - **Imagery (0 to 10):** only when **Talk first** said this look uses pictures. This subject’s world (Unsplash, Wikimedia, museums). Not stock category. A file counts when a crop can make the principle the subject. Drop the rest. Do not pad. Zero is a complete answer.
   - **Type / marks (1–2):** a pairing or a stamp you can name. MaxiBestOf fonts are a place to find one.
3. Scroll and screenshot only a keep. `node <skill>/scripts/capture.mjs <url> --out .design/refs/<name>.jpg` for that URL only (add `--review <scratch>/…` when the capture is tall; `--clip-selector "<css>"`, or `--clip x,y,w,h`, for type specimens). Do not stitch. How: [shots.md](references/shots.md). Jury quotes only from an Awwwards page you kept. Dribbble: artwork via `scripts/dribbble-cards.mjs` and `cdn.dribbble.com`, not the search grid and not a gated `/shots/...` page.
4. Write `.design/board.md`. One file, two layers. **Cards** are the references, **short**. **Read this** is the adaptation, written after they narrow on the moodboard. A website is valid at its sites, or short when each missing site is named after the look across those galleries. An application is valid with its screens, and invalid if the spine is Awwwards, MaxiBestOf, Recent, Supahero, or Dark Mode Design. A short board names each missing screen. Products are up to 6. Do not pad by lowering the filter. Hexes on a card come from a kept shot — sampled from a crop of the named element, not a photo, mockup frame, or presentation background, and not a palette library. Those hexes are what we saw. Later pages reuse the board. Do not write a second board. A later pass is a hunt folder. Do not treat a short board that does not name each drop as finished.
5. **Narrow on the moodboard.** The moodboard is the narrowing step, not only the result. Run `scripts/moodboard.mjs` on the board with `--count` set to the number they chose, open it, and look at it yourself first. Then ask once, in one line:

   Which one leads, which do you also like, which feel wrong, and why?

   One line is enough. Their answer is the adaptation’s input: `leads` and `also` come from the tiles they liked (it can be more than one), the reason they give becomes the lead caption (`--why`), and what feels wrong goes into `leave`. A tile they saw and picked outranks the three you would have named. If they say you should choose, take the closest and say which. Then rerun the moodboard with the lead marked, and write the full fields of the lead and the `also` cards (`hero`, `type`, `faces`, `imagery`, `role`, `subject`, `leave`) from the open shot files. The other cards stay short.

`Asked:`, `Seeds:`, `Sources:`, and `Refs:` sit above **Read this**. They are not cards.

**Read this** is the adaptation, written after the narrowing answer. The leading card is the closest to this subject, not the largest type and not the highest score. Closest means the subject’s world is in the shot: the same job, or a register that shares its hour, its material, its ritual, or its kind of place. That card leads the feeling. It does not supply the brand. A form card does not supply colour or type. It can only add a layout or a component that still belongs on this topic. `colour` and `type` are the adaptation. They are not a paste of the leading card’s colour line or type line.

Each adapted colour needs a **reason**, not a difference for its own sake. Valid reasons: contrast (a sampled hex that fails), the `change` twist, this subject’s own pictures, or a brand colour they already have. Name the reason beside the hex. A generic hex — cream paper, warm ink — may be kept exactly as sampled when it is not the reference’s identity; nudging `#f6f1e7` to `#f4efe4` is the same cream and is not an adaptation. `leave` holds their **identity** colours and faces — a brand accent, a licensed face — and whatever they said feels wrong, not every hex on the card. `control` is the behavior the leading hero shows (text link, filled shape, or absent, and where it sits).

Two lines keep the direction honest:

- `ownable` answers “what makes this recognisably <project> and not <lead>?”. It names **one concrete element** from the identity nouns in **Talk first**, turned into a design element: for a lighthouse logbook, a brass-derived accent, a rope-twist rule, a lamp-glow marker for the active item. A direction that fits the brief and is the default look of every calm app of the year has not answered it.
- `gaps` names the key screens the board does not cover — the project’s differentiator first. If every “version history” result is a business audit log, say the history view has no strong reference. When the lead is a `concept`, `not shown` lists what it never faced.

```
Asked: <style, requirements, and any search ideas used, or none>
Seeds: <the pictures and links they gave, or none>
Sources: <the ticked list, and any named skip: a login wall, no public page>
Refs: <how many they chose to see>
Noise: <query: kept of seen, % off-topic. Zero-card queries: "<query>: 0 cards (rate limit?)">

## Read this
- leads: <card name>
- also: <the other cards they liked, comma separated>
- control: <as that card’s hero describes it: text link, filled shape, or absent, and where it sits>
- take: <what we keep: a layout, a temperature, a kind of picture, and which cards. Draws from every tile they liked>
- change: <the twist, so this is not that reference>
- ownable: <one concrete element from the project’s own identity that this look has and the lead does not>
- colour: <adapted hexes, where each sits, and the reason each one moved: contrast, the twist, our pictures, our brand. A generic sampled hex may stay as it is>
- contrast: <each adapted text/background pair: hex on hex, ratio, AA|AAA|FAIL; failing pairs show sampled → used>
- type: <adapted pairing. Not their exact faces unless they asked to keep them. Licence still covers how this ships>
- faces: <names only, comma separated, for the proof page>
- leave: <their name, their identity colours and faces, and what they said feels wrong>
- not shown: <only when the lead is a concept: what it has never faced>
- gaps: <key screens with no strong reference, or none>
```

Every adapted text/background pair in **Read this** has been through `scripts/contrast.mjs`. Body and small text need 4.5:1; large text and non-text marks need 3:1. Adjust failures before the proof and before asking to persist `DESIGN.md`.

Each site, product page, or screen is a card, written from the open shot file. A hero that says “one action” and does not say what the control is does not count. On a website the primary card is the closest live site, not a form site chosen for its type. On an application it is a screen, not an award site.

A **short card** is what every keep gets. The lead and the `also` cards get the full fields, after the narrowing answer.

```
### <name>
- source: <gallery, or "user" for a seed>
- score: <the counts the listing shows, e.g. "39 likes, 6k views". Empty columns stay empty. A seed has none>
- slot: site | screen | product
- fit: same-job | register | form | seed
- shipped: yes | concept
- url: <the page a person can open: the shot page, the live site, the Unsplash or Wikimedia page>
- shot: .design/refs/<file>
- idea: <one sentence. The principle, not their name>
- tagline: <about six words, for the moodboard tile. "Night page, earlier lines fade">
- control: <text link, filled shape, or absent, and where it sits>
- colour: <hex + element sampled from a crop of that element, e.g. "#2c2824 body text", "#b0563a active-tab dot". Never from a photo, mockup frame, or presentation background unless that is the role. A colour is a button fill only when the shot fills a button with it>
- worth taking: <one principle. On a form card: a layout or a component only, and only if it still works on this topic. Not their type. Not their colours>
```

The full fields, for the lead and the `also` cards only:

```
- role: page | component | element
- subject: same-job | other
- hero: <what is in the frame, and the control>
- type: <the faces, and how the shot uses them>
- faces: <names only, comma separated: "Source Serif 4, Work Sans". The prose stays in type>
- imagery: <what the pictures are>
- leave: <their identity, and anything that is not the principle>
```

`slot`, `tagline`, `faces`, and `url` are what the moodboard reads. `slot: product` stays off the moodboard — a product page cropped into a tile is noise. `tagline` is a phrase, not a sentence, and it is not `worth taking`, which stays on the board. `faces` is names only, so the type tile can set them; a line like “a high-contrast display serif (Didone-like)” belongs in `type`, never in `faces`.

A **seed** is a short card with `source: user`, `fit: seed`, a `url` or the file they gave, and a `shot`. It is not scored and it is never dropped for being off-gallery. It is shown on the moodboard like any other tile.

Imagery and type stay short. They are material, not cards.

```
- kind: imagery | type
- url:
- licence: <OFL / Apache / commercial / restricted>; covers <bundled in app, self-hosted web, default UI>? yes/no
- shot: .design/refs/<file>
- shows:
- leave:
```

`licence:` is required on `kind: type`. A type pick whose licence does not cover how this project ships it is dropped and named under drops. Imagery may omit `licence:`.

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

**Whole look:** the moodboard is how they narrow, so it is built before they answer anything and again after.

```
node <skill>/scripts/moodboard.mjs .design/board.md --out .design/moodboard.html --count <their number>
```

Add `--imagery` only when **Talk first** said this look uses pictures. Open that file and look at it yourself before you show it — `node <skill>/scripts/capture.mjs "file://$PWD/.design/moodboard.html" --out <scratch>/moodboard.jpg` — then read the shot. A tile with the wrong caption, a face that did not set, or a missing picture is fixed on the board and the script is run again.

Then, in the chat, say where the moodboard is, say every picture links to its source, and ask the one narrowing question from **Whole look** step 5. Do not name two or three links instead. Wait. After they answer:

```
node <skill>/scripts/moodboard.mjs .design/board.md --out .design/moodboard.html --count <n> --leads "<card>" --also "<card>,<card>" --why "<their reason, in their words>"
```

The reason they gave is the lead caption — pass it as `--why`. Do not let the card’s `worth taking` stand in for a reason they contradicted. What they said feels wrong goes into `leave`. Open the file again. Write the full fields of the lead and the `also` cards, then **Read this**.

Then the **proof**, which comes before the persist ask:

```
node <skill>/scripts/proof.mjs .design/board.md --out .design/proof.html --name "<project>"
```

`proof.html` is the adaptation with this project’s own words in it: paper and night side by side, a list row, a phone column, the faces at body size, the contrast ratios, `ownable`, and `gaps`. The words come from the project’s own product file or README (`--sample <file>` to point elsewhere). It is not the product and not a page build. Open it, look at it yourself, and fix what you see in **Read this** — a face that did not set, a night text that is too dim, small caps that fight the serif. One check before it is shown: can this be done with fewer families? If they say skip the proof, skip it.

Then say the adaptation in chat: what we take, what we change, what we leave, `ownable`, and the adapted colour and type. Then the persist ask, as its own message. Do not hand-write the HTML. The script is the layout. Empty tiles are omitted. It does not add a logo, a slogan, a stat, or a brand.

**Later hunt:** Name the two or three closest, each with its live URL; shots in `.design/hunts/<slug>/`. Say this pass does not change the look until they accept. Leave `.design/moodboard.html`. After they pick what to take, the persist ask, as its own message. A later hunt does not redo the brand’s colour or type unless they agreed to that change.

**The persist ask.** Its own message. If the harness has a structured yes/skip prompt, use that. Never append it to a long report, a “not checked” list, or any other reply.

Before the question, these three lines. That message ends on the question:

The board and the moodboard are the references. **Read this** is the adaptation. `DESIGN.md` is the file every later build follows. Nothing is official until `DESIGN.md` exists.

Whole look:

Write `DESIGN.md` from this adaptation? The colour, type, and twist just named. Skip if you only want the references for now.

Whole look, redone, with a `DESIGN.md` already there:

Replace `DESIGN.md` with this adaptation? It is the file every later build follows, and the current one stays exactly as it is until you say yes.

Later hunt:

Update `DESIGN.md` with what we accepted from this hunt? (Keeps colour and type unless we agreed to change them.)

- Yes → load `design-md` and write or update from the board or the hunt note.
- No / skip → leave the board; do not invent a brand file. A later hunt leaves `DESIGN.md` and the board as they were.

After the answer, yes or skip, and as part of the reply that follows it — not inside the persist message — offer a later hunt for each line in `gaps`, one line each: “The history view has no strong reference. Hunt it next?” For a gap that software has not solved, suggest searching outside software for the same form: manuscript drafts, archive catalogues, film edit histories.

If their next messages go elsewhere without a yes or a skip, ask again **once**, and make it the first thing in that reply. A second ask after a topic change is the step, not a repeat of the style question. After that second ask, wait. Do not ask a third time.

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
- Bury the persist question at the end of a long report. It is its own message.
- Write skill feedback or session notes under `.design/`. In chat, or the file they asked for, outside `.design/`.
- Hand-write or restyle `.design/moodboard.html`. Run `scripts/moodboard.mjs`.
- Ask them to pick from two URLs with no moodboard open, or let a later hunt replace it.
- Search before the **Talk first** round, or ask a second round of questions before searching.
- Hunt imagery for a look that said it has no pictures in it.
- Fill a board with Dribbble concepts for an app when shipped screens of comparable products exist, or leave a concept’s gaps unsaid.
- Keep a shot you only saw as a thumbnail.
- Scroll on once two more queries add nothing, or ignore the noise rate.
- Write full card fields for every keep. Full fields are the lead and the `also` cards.
- Write **Read this** with no `ownable` line, or an `ownable` that names no element from the project’s own identity.
- Leave the screen the project is about out of `gaps` because the board never covered it.
- Persist before the proof, unless they said skip it.
- Show the moodboard without looking at it first.
- Caption the lead with `worth taking` when they said why they picked it.
- Put product-page tiles or imagery this look does not use on the moodboard.
- Change a sampled hex with no reason. Same cream, same ink, no adaptation.
- Title the moodboard as the direction, or paint their colours and faces as the brand.
- Paste the leading card’s colour line or type line into **Read this** as the brand. Exact hexes and exact faces go in `leave`, unless they asked to keep them.
- Put a logo, a slogan, or a stat on the moodboard. The script places fields from the cards.
- Write a new `.design/piece.md`.
- Pad the count by lowering the filter, or by keeping pictures you would not put on the page.
- Stop looking at the first page of results, or treat the keep count as the number of candidates you open.
- Scroll or screenshot a candidate into `refs/`. The capture script runs on a keep only. Listing thumbnails and scratch contact sheets are fine; they are not refs.
- Sample colour from a photo, mockup surround, or presentation background when the role is UI ink or accent.
- Write **Read this** colour pairs that have not been through `scripts/contrast.mjs`.
- Keep a typeface whose licence does not cover how this project ships it.
- Narrate candidates, scores, or drops while looking. After the opening line, the next thing said is the short list of the closest, each with its live URL.
- Look in the same turn as the style question, or in the same turn as a piece’s search ideas. Wait for the answer, or for a skip.
- Offer search ideas on a whole look, or on an ideas or check pass.
- Search a piece with ideas they skipped.
- Write a hero that does not say what the control is.
- Treat a short board that does not name each drop as finished direction.
- Take colour or type from a card about another business.
- Copy the leading reference’s exact palette or exact faces into the adaptation.
- Let a card lead because its type is large, when a closer card has the subject’s world in the shot.
- Let a screen card be the primary card on a website, or an award site be the primary card on an application.
- Fill an application board with Awwwards, MaxiBestOf, Recent, Supahero, or Dark Mode Design.
- Raise a keep count because there are more galleries.
- Fill the keep from the first gallery and leave the others unopened.
- File a Supahero crop, a Pinterest pin, or a Muzli card as a Site.
- Open Dark Mode Design when the subject, the register, and the style they asked for are not dark.
