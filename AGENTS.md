<!-- longbeard:start -->
# Long Beard

The project's own code, conventions, and DESIGN.md win.

Load only what the task needs. Leave the rest unread.

A marketing site is the page a person lands on to understand or choose. An application is the tool they come back to. Official look wins: DESIGN.md, then Figma, then the board. Hunt finds references and proposes an adaptation; it does not code the page. Open the moodboard before they pick, say what we take, change, and leave, then ask to write or update DESIGN.md as its own message — once more, first, if they move on without answering — only on yes. Code the page only when they asked to build. Direction-only stops after the next-step offer. A site hunts live pages; an application hunts screen shots. With a direction already, hunt only the piece.

- Building or fixing: ponytail. The smallest change that finishes the job. Leave validation, error handling, security, and accessibility in place.
- A diff: ponytail-review. Read it like someone who gets paged.
- The whole repo: ponytail-audit. That same pass, over every file.
- Shortcuts you meant to come back to: ponytail-debt. Collect the limits you marked.
- Something is broken, throwing, failing, or slow — a hard bug: diagnosing-bugs. Build a tight feedback loop first, then localize, reduce, fix, and guard.
- They asked for TDD, test-first, or red-green-refactor: tdd. Red before green, one slice at a time, tests at seams you agreed. Only on request; ponytail stays the default for building.
- They asked to grill a plan or design, or the ask is underspecified: grill-me. Interview until every branch of the design tree is resolved. Uses grilling.
- Stress-testing a plan, decision, or idea: grilling. The interview primitive behind grill-me. Relentless questions until branches are closed.
- They want an idea built through a spec and tickets: Matt Pocock's flow. In his order: grill-with-docs, to-spec, to-tickets, then implement per ticket or implement-spec for all of them. setup-matt-pocock-skills runs once first and picks the tracker (GitHub Issues or local files). Inside the flow its own steps win: implement calls tdd and code-review; do not swap in ponytail-review. ask-matt names the next step.
- A throwaway prototype of logic or state: prototype. A page or screen goes to design-taste-frontend.
- Deepening modules or the shape of the code: improve-codebase-architecture. Bugs, load, and bloat across the repo stay ponytail-audit.
- They asked to hand off to another agent or session: handoff. Compact the conversation into a handoff document another agent can pick up.
- A change that touches data, money, jobs, or what a person sees: premortem. Name where it can break before you write. A small change gets a short answer.
- No official look, or they asked to hunt / define direction / find references: design-reference-hunt. Does not code the page. Talk first, one round, then search small. Pick on `.design/moodboard.html`, say the adaptation, then ask to write or update `DESIGN.md` via design-md as its own message — once more, first, if they move on without answering — only on yes. Then offer the next step: prototype the gaps, hunt one, or stop. A later hunt for one piece writes `.design/hunts/<slug>/`. `.design/` is scratch, out of git.
- They asked to build, code, or prototype a page or screen: design-taste-frontend. With DESIGN.md it builds and checks; it does not art-direct: no draw, no dealt references, palette, or type. Else build from the `.design/board.md` cards. Run `inspect.mjs` (`--app` and its app-screen house rules for an app screen). Report a warning about something DESIGN.md decides as per DESIGN.md; contrast, focus, and tap-target failures still get fixed. Direction-only or hunt-only is not this skill. The control a card describes is the control; add no filled button it does not show.
- They asked to animate a control or a transition: animate. Read the Behaviour section of DESIGN.md first. A page design-taste-frontend is building keeps that skill’s motion. Decide this one move, then build it.
- A Figma file or link: figma-design-to-code. A designer handed it over. Needs the Figma connection. Reuse this project's components.
- A UI review you asked for: web-design-guidelines. Accessibility and interface rules.
- They asked to jury, score, judge, or roast the design (or a live URL / local build): jury. Blind evidence scorecard. Do not redesign. Fixes stay on the board, DESIGN.md, or Figma. Do not run after every build unless they asked.
- The look of this project, or they confirmed writing or updating DESIGN.md: design-md. Follow DESIGN.md when it exists. Write or update it only on confirm: from the hunt's adaptation, or from decisions approved on a rendered prototype, with reason, date, and contrast. Ideas, not sources: no reference names or `.design/` paths. Do not invent. Missing file plus design or define direction is hunt first.

A normal change can be ponytail and a short premortem. That is still a small set.

Write so a person can use the reply in one read. End with what you did not check.
<!-- longbeard:end -->

# Public repository

This repo is public and open source (MIT). Everything committed is published.

- No secrets, tokens or `.env` files, no personal notes, and no feedback notes written for other tools.
- Docs speak in our own words: no names of other products, competitors or designers.
- Other people's images, fonts or text go in only when their licence allows it, with credit.

Check `git diff --cached` against this list before committing. Mention it only if something is wrong.

# Versions and releases

Versions and releases follow `docs/decisions/0012-versioning-and-releases.md`. Change `SCHEMA_VERSION` or `FORMAT_VERSION` only with a migration and its test. Bump the app version or push a release tag only when asked. Write PR titles for someone who uses the app, since they become the release notes.
