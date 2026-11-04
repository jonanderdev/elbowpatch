# 16. Link previews and search engines

Date: 2026-11-04 · Status: accepted

## Decision

### Link previews
- The page carries a title, a description and a 1200 × 630 picture, so a shared link looks like Elbowpatch. `app/scripts/og-image.mjs` draws the picture.
- A preview needs full addresses, and a build for any host cannot know its own. They come from `SITE_URL`, or from `URL`, which Netlify sets. With neither, the build leaves them out: a self-hosted copy shows no picture rather than pointing at someone else's site.
- The picture is not precached: only link previews fetch it, so no installed copy should download it.

### Search engines
- Until v1 the site stays out of search engines through one switch: the `X-Robots-Tag` header in `app/public/_headers`.
- No `robots.txt` that blocks everything: some link previews obey it, and a search engine that cannot fetch a page never sees its noindex.

## At v1
Delete the `X-Robots-Tag` rule from `_headers`, and keep the cache rule below it.
