# The whole page, not the gallery, not only the hero

A reference is the design from top to bottom. The builder has to take how the **rest** of the page works, not only the first screen.

## Live sites — the script is for a keep

Open as many listings and score pages as the hunt asks. Do not scroll a candidate, and do not screenshot one. **Viewing a listing’s own thumbnails is allowed** — it is not a capture and writes nothing to `refs/`. Use `scripts/contact-sheet.mjs` on a TSV of `label\timageURL` to build labelled grids in a scratch folder (never `.design/`), then open only the shortlist at full size.

Run the capture script only on a URL you are keeping. That run is the only scroll. Do not screenshot the tab by hand. Do not stitch folds. Stitching is what repeats a sticky hero down the file. A file in `.design/refs/` that is not on the board gets deleted, and only during the whole look that owns that folder. A later hunt keeps its own shots in `.design/hunts/<slug>/refs/`. Do not delete those because the board does not cite them. A file in that folder that its note does not cite gets deleted, and only during that hunt. A loading hunt does not delete a board shot. The whole look does not delete a hunt shot.

From the **project root** (relative `--out` resolves against `git rev-parse --show-toplevel`):

```
node <skill>/scripts/capture.mjs https://example.com --out .design/refs/<name>.jpg
```

For a later hunt:

```
node <skill>/scripts/capture.mjs https://example.com --out .design/hunts/<slug>/refs/<name>.jpg
```

Tall captures (thousands of px) shrink when opened whole until body text is illegible. For reading only, add `--review <scratch>/name-review.jpg`. That writes side-by-side columns about 2,800 px tall; the real capture stays the single tall file in `refs/`. Review files stay in temp or session scratch, never `refs/`.

Type specimens (Google Fonts, etc.): use `--clip-selector "<css>"` to clip to an element's box — on `fonts.google.com` the specimen `main` — so the empty rail above it is not in the shot. `--clip x,y,w,h` still works when no element matches the area. Either way the shot is the specimen (name, large sample, text sample). A type shot may be cropped to the specimen — it is material, not a site.

The script opens Chrome, accepts a cookie **button** if the whole label matches (not partial “ok” inside other link text), strips short privacy/cookie dialogs, then scrolls a viewport at a time and pauses so pictures and reveals can finish. If a dismiss click navigates away, it exits non-zero with `navigated away: <url>` — do not keep that file. It pauses motion. It does not turn animations off, because that puts a revealed section back to blank. Then it unsticks `fixed`/`sticky` and takes **one** JPEG of the document. Node 22+. Chrome, Edge, or Chromium must be installed (`CHROME_PATH` if it is not in the usual place). Helpers stay Node with no package dependencies.

Then open the file (use the review sheet when the capture is tall). Write the hero and what is worth taking from it. A line you could have written without opening it does not count. Invalid if:

- the same band of the page appears twice (a stacked face, a repeated headline)
- a cookie dialog is still on it
- it is only the first screen of a long site
- most of the file is empty bands. Run the script once more. If the second file is still empty bands, the page is pinned or a canvas: write `coverage: fold`, keep a single viewport, and delete the tall file.

If it is invalid, delete it and run the script again. If the site will not scroll (WebGL, a locked canvas), say `coverage: fold` on the board, keep a **single** viewport shot, and find another scrolling site. Never glue folds by hand.

## Look at your own moodboard

The capture script takes a `file://` URL too, so the moodboard can be checked before anyone is shown it:

```
node <skill>/scripts/capture.mjs "file://$PWD/.design/moodboard.html" --out <scratch>/moodboard.jpg
```

Open that shot. A caption that states the wrong reason, a face that fell back to the default serif, a tile that is a product page, or a missing picture is fixed on the board, and the moodboard script is run again. The shot stays in scratch, never in `refs/`.

## Open the piece

- Prefer a **live site**. Click through from Awwwards / Godly / Land-book / siteinspire / MaxiBestOf / Recent / Dark Mode Design to the actual URL, then run the script on that URL.
- Supahero: the live site behind a hero, or the hero crop itself when the piece is a hero. Not the grid.
- Muzli: the original URL. Not the Muzli page.
- Dribbble: listing pages are client-rendered; `/shots/...` often returns Human Verification to headless Chrome. Use `scripts/dribbble-cards.mjs` on a popular-search listing URL — it scrolls and prints TSV of `id-slug`, likes, views, image URL, title. Download artwork from `cdn.dribbble.com` (`<url>?resize=1600x1200`). Do not capture `/search`. Run queries one at a time; if a query returns 0 cards, retry after 8 seconds, then after 30 seconds, then record it under drops.
- Pinterest: the pin image only, not the board and not search. If a login wall appears, see [quality.md](quality.md).
- Never capture a search grid, a home feed, or a listing of cards (contact sheets of listing thumbnails are fine; they are not refs).

## Dribbble / Behance / Unsplash / Pinterest — not sites

These are pictures, not pages. Capture the **image** (or the type specimen), no page chrome. An illustration goes under **Material** (`kind: imagery`, `type`, or `mark`). A shot of a real screen goes under **Screens**. Never under Sites. A Pinterest pin follows that same split.

Unsplash and Wikimedia: search the **subject**, not stock category.

**Unsplash:** `/photos/<id>/download` returns an HTML bot page. On the search page, read `figure a[href*="/photos/"] img`, take its `src` up to the `?`, and download `<that>?w=1600&q=80` from `images.unsplash.com`. Keep the photo page URL as the card’s `url:`.

**Wikimedia Commons:** call the API with `-A "<project>-hunt/0.1"`, `prop=imageinfo&iiprop=url&iiurlwidth=1920`, save `thumburl` as the shot, and use `descriptionurl` as the card’s `url:`.

A board entry whose `shot` is a gallery listing, a stitched repeat, or an illustration filed as a website does not count.
