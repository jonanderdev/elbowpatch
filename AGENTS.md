<!-- longbeard:start -->
# Long Beard

The project's own code, conventions, and DESIGN.md win. Load only what the task needs.

| Stage | Starts when | Skills | Writes |
|---|---|---|---|
| Idea | No docs/brief.md, or the product changes | idea | docs/brief.md |
| Direction | A brief with UI | design-direction | design-exploration/<slug>/direction.md |
| Design | A direction, no DESIGN.md | design → figma-generate-library → figma-generate-design | DESIGN.md, Ready Figma frames |
| Architecture | No GLOSSARY.md yet | grill-with-docs | GLOSSARY.md, ADRs |
| Plan | A flow or feature to build | setup-matt-pocock-skills → to-spec → to-tickets | specs, tickets |
| Build | Tickets | implement-spec → design-check → pr | one PR per spec |

Each stage offers the next; start it on yes. No UI: skip Direction and Design. A feature with a brief: grill-with-docs for new terms, else grilling, then Plan.

UI tickets link their Ready Figma frame. UI work follows DESIGN.md and that frame. A mismatch with the frame is a bug.

- A hard bug: diagnosing-bugs
- Test-first, when asked: tdd
- Handing off, when asked: handoff
- Before any use_figma call: figma-use
- A Figma link to build: figma-design-to-code
- They asked to animate a control or a transition: animate. Read DESIGN.md's decisions first. Decide this one move, then build it.
- They asked to jury, score, judge, or roast the design (or a live URL / local build): jury. Blind evidence scorecard. Do not redesign. Fixes go to DESIGN.md or Figma. Only when asked.
- A UI review you asked for: web-design-guidelines. Accessibility and interface rules.

Add-ons, offered once when needed (`npx longbeard update --skill <name>`): security-audit, image-to-code (from a picture). At Architecture, a framework skill.

Write so a person can use the reply in one read. End with what you did not check.
<!-- longbeard:end -->

# Product rules

Read docs/brief.md and MANIFESTO.md before changing anything. When in doubt, choose the quieter, simpler option.

- A feature belongs only if it makes the page quieter, the history more trustworthy, or the writing more the writer's own.
- Add nothing to the writing view without a reason.
- No network call carries writing unless the writer connected a place.
- Keep the bundle small, and justify every dependency.
- Data loss is the worst bug: test snapshots, restore, import, export and sync edge cases.
- Human language in everything the writer sees. No Git words.
- Record decisions in `docs/decisions/`.
- Keep commits small and the app runnable at every step.

# Public repository

This repo is public and open source (MIT). Everything committed is published.

- No secrets, tokens or `.env` files, no personal notes, and no feedback notes written for other tools.
- Docs speak in our own words: no names of other products, competitors or designers.
- Other people's images, fonts or text go in only when their licence allows it, with credit.

Check `git diff --cached` against this list before committing. Mention it only if something is wrong.

# Versions and releases

Versions and releases follow `docs/decisions/0012-versioning-and-releases.md`. Change `SCHEMA_VERSION` or `FORMAT_VERSION` only with a migration and its test. Bump the app version or push a release tag only when asked. Write PR titles for someone who uses the app, since they become the release notes.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, handled with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single context: one `GLOSSARY.md` at the root, and decision records in `docs/decisions/`. See `docs/agents/domain.md`.
