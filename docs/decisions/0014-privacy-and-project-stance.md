# 14. Privacy, analytics and project stance

Date: 2026-11-04 · Status: accepted

These rules were in the old project notes. Nothing is built for analytics yet.

## Decision

### Privacy
- Writing never leaves the device, except to a place the writer connects.
- No cookies, no fingerprinting and no tracking in the editor.
- A short, plain About & privacy page says this, says the app is provided as-is with no warranty, and says that a connected place holds the writer's data under its own terms.

### Analytics
- Optional, page-level and cookieless only.
- Loaded only if an environment variable is set, so self-hosters get no analytics by default.
- No custom events from inside the editor: we count visits, never words.

### Project stance
- The maintainer hosts a main instance on a best-effort basis. Self-hosting must always stay a real option.
- Donations are optional and never shown in the writing view.
- The repo does not talk about pricing or subscriptions.
