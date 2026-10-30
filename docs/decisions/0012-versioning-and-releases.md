# 12. Versioning and releases

Date: 2026-10-30 · Status: accepted

## Context
The app had no version (`0.0.0`), no tags and no releases. It is not on npm and nobody calls its code: what people rely on is their writing, stored in the database and carried in the export. A release should say what changed and promise what still reads.

## Decision

### Three numbers, each with one job
| Number | Where | Changes when |
|---|---|---|
| App release | `app/package.json` `version`, git tag `vX.Y.Z` | A release is made |
| Database schema | `SCHEMA_VERSION` in `app/src/adapters/idb-store.ts` | The database needs a migration (0010) |
| Export format | `FORMAT_VERSION` in `app/src/domain/archive.ts` | The shape of `index.json` changes (0007) |

The schema and export numbers move only with a migration and its test, never just because a release is cut.

### The app version is SemVer, and major means the writer's data
- **Major**: a release that cannot read an older export, or that asks the writer to act to keep their words. Almost never.
- **Minor**: something new a writer can see, or a stored-format change older exports survive. A new `FORMAT_VERSION` is at least a minor.
- **Patch**: fixes only.
- `0.x` while it is dogfooded; `1.0.0` when a stranger can trust it with a journal. From 1.0, every 1.x reads every export a 1.x wrote.

### A release is a GitHub Release
- The version bump is its own PR that changes `app/package.json` (and its lockfile).
- Pushing a `vX.Y.Z` tag on `main` runs `.github/workflows/release.yml`: it checks the tag matches `app/package.json`, runs lint, typecheck and tests, builds, and publishes a release with the built site as a zip for self-hosters.
- Release notes are generated from merged PRs, grouped by label (`.github/release.yml`). There is no CHANGELOG file: the releases are the changelog.
- A tag with a suffix (`v0.2.0-rc.1`) is published as a pre-release.

## Consequences
- Cutting a release is four steps: bump in a PR, merge, tag `main`, push the tag (CONTRIBUTING.md).
- PR titles become release notes, so they are written for a reader of the app, and a PR gets a label (`enhancement`, `bug`, `accessibility`, `documentation`) to land in the right group.
- Not decided yet: whether the hosted instance deploys from release tags or from `main`, and where the app shows its own version.
