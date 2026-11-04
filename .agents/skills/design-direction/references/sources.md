# Sources: what to keep, and how to get the shot

A nominee is not a reference. Open it full size and drop anything weak before it goes on the board. A weak pass means fewer keeps, not a lower bar.

## Galleries

- **Awwwards.** Open the site page, not the listing card. Keep Site of the Day, Month, or Year, or an Honorable Mention with overall and Design ≥ 7.5. Drop any 4s, and any gate or password wall.
- **siteinspire, Recent** (recent.design/websites). These are curated, not scored. Keep a live page with one clear idea: a crop, a component, or an arrangement. Drop generic SaaS (centred headline, three icon cards, soft gradient, Inter). On Recent, open the source URL on the item.
- **Dark Mode Design.** Only when the look is dark.
- **Muzli.** Only a way to reach the original, which then has to pass its own test.

## Dribbble

Listing pages render in the browser, and shot pages hit human verification. Use the script on a popular listing for this year:

```
node <skill>/scripts/dribbble-cards.mjs "https://dribbble.com/search/shots/popular/product-design?q=text+editor+screen&timeframe=year" --scrolls 4
```

It prints `id-slug`, likes, views, image URL, and title. It drops merch, CVs, worksheets, posters, logos, and tool ads by slug and title. Extend that list with `--drop "a,b"` and relax it with `--keep "a,b"`. Download artwork from `cdn.dribbble.com` (`<url>?resize=1600x1200`).

- Use a category path and the form, not the word: `/product-design?q=…`, `/mobile?q=…`, `/web-design?q=…`.
- If most of what gets through is off-form, the query is wrong. Fix the query rather than scrolling further.
- A product's category can be swamped by stores. Query the thing people do with it, and `--drop` what the brief rules out.
- A thin query ignores `timeframe=year`: the shot ids show it. An old shot is fine when its idea still holds.
- Run one query at a time. If a query returns 0 cards, retry after 8 s, then 30 s. If it is still 0, note it under `Sources:` as a possible rate limit.
- Keep a shot when you can name what is worth taking in one line, and people actually saved it. Drop AI mush, fake browser chrome, purple-on-dark gradients, Inter everywhere, and emoji icons.
- A Dribbble illustration is imagery, never a site.

## Cropping a downloaded image

To crop a picture you already have (a screen inside a marketing frame, a type specimen):

```
node <skill>/scripts/capture.mjs "file://<abs path to image>" --out design-exploration/<slug>/refs/<name>.jpg --clip x,y,w,h
```

`--clip` is in the image's own pixels.

## Imagery

Search the subject, not a stock category. One real place or material beats a pile of similar ones. Zero imagery is a complete answer.

- **Wikimedia Commons.** Query the API with `-A "<project>-hunt/0.1"`, `prop=imageinfo&iiprop=url&iiurlwidth=1920`. Save `thumburl`. `descriptionurl` is the `link`.

## Contact sheets

Viewing listing thumbnails is fine. It is not a capture. Build labelled grids in scratch, never under `design-exploration/`:

```
node <skill>/scripts/contact-sheet.mjs candidates.tsv --out <scratch>/sheets   # TSV: label<TAB>imageURL
```

## Capture a live page

Only for a keep, run from the project root:

```
node <skill>/scripts/capture.mjs <url> --out design-exploration/<slug>/refs/<name>.jpg
```

The script dismisses cookie banners, scrolls so reveals load, unsticks fixed headers, and takes one full-page JPEG. Node 22+ and an installed Chrome are required (set `CHROME_PATH` if Chrome is somewhere unusual). Options:

- `--review <scratch>/x.jpg` writes a readable side-by-side version of a tall page.
- `--clip-selector "main"` or `--clip x,y,w,h` crops to a type specimen.

Open the file. Delete it and run again if it repeats a band, still shows a cookie dialog, or is mostly empty. If a page will not scroll (WebGL, a locked canvas), keep one viewport and say so on the card. Never stitch screenshots.
