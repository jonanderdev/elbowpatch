# Contributing

Not open for contributions yet. This page will say how, once the first version is out.

## Releasing

Versions follow SemVer, where a major release means the writer's data (docs/decisions/0012).

1. In a PR, bump the version: `cd app && npm version 0.1.0 --no-git-tag-version`. Merge it.
2. Tag `main` and push the tag: `git checkout main && git pull && git tag v0.1.0 && git push origin v0.1.0`.
3. The Release workflow checks the tag against `app/package.json`, runs the checks, builds, and publishes a GitHub Release with notes from the merged PRs and the built site as a zip.

A tag with a suffix, like `v0.2.0-rc.1`, is published as a pre-release. Label PRs `enhancement`, `bug`, `accessibility` or `documentation` so they land in the right group of the notes.
