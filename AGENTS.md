<!-- longbeard:start -->
# Long Beard

The project's own code, conventions, and DESIGN.md win.

Load only what the task needs. Leave the rest unread.

A marketing site is the page a person lands on to understand or choose. An application is the tool they come back to. Official look wins: DESIGN.md, then Figma, then the board. Hunt finds references and proposes an adaptation; it does not code the page. Open the moodboard before they pick, mark the lead after, say what we take, change, and leave, then ask once to write or update DESIGN.md — only on yes. Code the page only when they asked to build. Direction-only stops after persist. A site hunts live pages; an application hunts screen shots. With a direction already, hunt only the piece.

- Building or fixing: ponytail. The smallest change that finishes the job. Leave validation, error handling, security, and accessibility in place.
- A diff: ponytail-review. Read it like someone who gets paged.
- The whole repo: ponytail-audit. That same pass, over every file.
- Shortcuts you meant to come back to: ponytail-debt. Collect the limits you marked.
- Something is broken, throwing, failing, or slow — a hard bug: diagnosing-bugs. Build a tight feedback loop first, then localize, reduce, fix, and guard.
- A change that touches data, money, jobs, or what a person sees: premortem. Name where it can break before you write. A small change gets a short answer.
- They asked to grill a plan or design, or the ask is underspecified: grill-me. Interview until every branch of the design tree is resolved. Uses grilling.
- Stress-testing a plan, decision, or idea: grilling. The interview primitive behind grill-me. Relentless questions until branches are closed.
- No official look, or they asked to hunt / define direction / find references: design-reference-hunt. Does not code the page. Talk first, one round, then search small. Whole look writes `.design/board.md` and `.design/moodboard.html` of those references, open before they pick and marked again after. A later pass writes `.design/hunts/<slug>/` and does not replace the moodboard. Narrow on the moodboard, show the proof, say the adaptation (take, change, leave, ownable, gaps, adapted colour and type), then ask to write or update `DESIGN.md` via design-md as its own message — once more, first, if they move on without answering — only on yes. Direction-only stops there. Build only if they also asked to build.
- They asked to build or code a page or screen: design-taste-frontend. Do not deal this skill’s references, and do not run draw. Prefer `DESIGN.md` when it exists; else wait for `.design/board.md` and build from those cards. Direction-only or hunt-only is not this skill. The control a card describes is the control. Do not add a filled button the card does not show. Inspect still.
- They asked to animate a control or a transition: animate. A page design-taste-frontend is building keeps that skill’s motion. Decide this one move, then build it.
- A Figma file or link: figma-design-to-code. A designer handed it over. Needs the Figma connection. Reuse this project's components.
- A UI review you asked for: web-design-guidelines. Accessibility and interface rules.
- They asked to jury, score, judge, or roast the design (or a live URL / local build): jury. Blind evidence scorecard. Do not redesign. Fixes stay on the board, DESIGN.md, or Figma. Do not run after every build unless they asked.
- They asked to hand off to another agent or session: handoff. Compact the conversation into a handoff document another agent can pick up.
- The look of this project, or they confirmed writing or updating DESIGN.md: design-md. Follow DESIGN.md when it exists. Write or update it from the board or a hunt note only when they confirm — expand colour, type, control, layout principles, leave. Do not invent. Missing file plus design or define direction is hunt first.

A normal change can be ponytail and a short premortem. That is still a small set.

Write so a person can use the reply in one read. End with what you did not check.
<!-- longbeard:end -->

# Public repository

This repo is public and open source (MIT). Everything committed is published.

- No secrets, tokens or `.env` files, no personal notes, and no feedback notes written for other tools.
- Docs speak in our own words: no names of other products, competitors or designers.
- Other people's images, fonts or text go in only when their licence allows it, with credit.

Check `git diff --cached` against this list before committing. Mention it only if something is wrong.
