# Keep the strong ones

A nominee is not a reference. Open the score (or the shot) and drop anything weak before it hits the board. The keep count is the board. Looking goes past it. A weak pass means fewer keeps, not a lower bar.

## Awwwards

Look at the **Awwwards site page**, not the listing card.

Keep:

- Site of the Day, Site of the Month, Developer Award, or Site of the Year, **or**
- Honorable Mention / Nominee only if **overall ≥ 7.5** and **Design ≥ 7.5** (scores are /10).

Drop:

- Overall or Design at **6 or below**, and anything with **4s** on Design, Usability, or Creativity.
- Nominee-only with no SOTD/HM and a soft score.
- Gates, password walls, or a hero you cannot actually see.
- A high score whose offer only makes sense for another type of business. Keep that page only when a layout or a component still works once this topic’s pictures and words are in the frame. Do not take its type or its colours.

Quote jury lines only from that page, and only for sites you kept.

## Godly, Land-book, siteinspire

Curated, not scored. Keep a site if the **live page** has a clear idea (a crop, a component, one arrangement). From another business, that idea has to be a layout or a component that still works on this topic. Drop their type and their colours. Drop generic SaaS: centred headline, three icon cards, soft gradient, Inter.

## MaxiBestOf, Recent, Dark Mode Design

Same test. The **live page** has a clear idea. Click through. The gallery card is not the shot. These galleries do not raise the keep. They are more places to open before you choose.

- **MaxiBestOf** (maxibestof.one/websites). Prefer MaxiBestof Picks. Sections (maxibestof.one/sections) are pieces — a hero, a pricing block, a footer — not Sites. Fonts can be the type slot when you can name the pairing.
- **Recent** (recent.design/websites). Open the source URL on the item. The poster, the icons, the OG images, and the tools are not sites.
- **Dark Mode Design** (darkmodedesign.com). Open it only when the subject, the register, or the style they asked for is dark. A dark site kept so a light subject has a colour is the wrong card. Drop it.

## Supahero

supahero.io is hero crops. A crop can be the shot for a hero piece when the control is in the frame. For a site, open the live page behind the crop. The grid is not a shot. A crop is never a Site.

## Muzli

muz.li collects other people’s work. Open the original. That page still has to pass its own gate: Awwwards needs the score, Dribbble needs the votes, a live site needs a clear idea. Do not capture the Muzli card or the feed.

## Pinterest

Pins on pinterest.com are pictures, never sites. Keep one when it is a single real page or screen and you can name what is worth taking. Prefer this year when the pin shows a date. A photograph of this subject can be imagery. Drop mood boards, collages, AI mush, and anything you would drop on Dribbble. Do not capture a board or a search grid.

If Pinterest shows a login wall, write `Pinterest: login wall` under the board’s drops and continue. That counts as the pass.

## Dribbble / Behance

Listing pages are client-rendered (WebFetch returns empty). Shot pages (`/shots/...`) often hit Human Verification in headless Chrome. Use `scripts/dribbble-cards.mjs` on a popular-search listing; take artwork from `cdn.dribbble.com`. Run queries one at a time. A 0-card query is retried after 8 seconds, then after 30 seconds; if it is still 0, write `<query>: 0 cards (rate limit?)` under the board's drops. An empty search and a rate limit look the same from one try.

**Query for the form, not the word.** A search for the subject’s word returns things that share the word and not the idea: for “writing app”, print-on-demand tees, CV services, tracing worksheets, essay mills, posters, AI assistants. Use a category path and add the form — `/search/shots/popular/product-design?q=writing+app+ui`, `/mobile?q=text+editor+screen`, `/web-design?q=…`.

**Negative list.** `scripts/dribbble-cards.mjs` drops these by whole word in the slug and title before a thumbnail is fetched, and prints the noise rate on stderr: `t-shirt, tee, merch, apparel, hoodie, resume, cv, cover letter, essay, worksheet, tracing, handwriting practice, alphabet, halloween, christmas, valentine, logo, logotype, branding, brand identity, packaging, poster, book cover, sticker, mockup, chatbot, mood tracker, habit tracker`. A project extends it with `--drop "a,b"` and relaxes it with `--keep "a,b"` (a font hunt keeps `logotype`; a product about moods keeps `mood tracker`). Put the noise rate under the board’s drops. A high rate means the query is wrong: fix the query, do not scroll more. Words that may be the subject itself, like “ai” and “illustration”, are judged on the shot, not filtered on the title.

Sort this year by **popular** (`timeframe=year`). There is no “most saved/liked” sort on the listing. `scripts/dribbble-cards.mjs` prints `id-slug`, **likes**, **views**, image URL, and title, each count read from the card's own stat element. A count it cannot read is empty — it never guesses one from the title. `score:` uses whichever counts came back: `score: 39 likes, 6k views`, or `score: 5.4k views (likes unavailable)`. Do not put a number on a card that the helper left empty. `timeframe=year` is not strict — older shots appear; when the slug or shot ID reveals a year, record it on the card so an old shot is visible as old.

A Pinterest pass does not replace this sort. Look through that sort, then the page type, the component, and the element, including other subjects. A whole-look board keeps up to 20 that pass this filter. On a website they lose to a kept live site. On an application they outweigh award sites. A piece hunt keeps 10 after it has opened at least 30. Open more than you keep. The keep does not rise because another gallery was added. If the pass is weak, the board stays short. Do not lower the filter to finish the count.

Keep if you can name what is worth taking in one line (a crop, a type pairing, a palette, a component, a screen). The shot has to be one people actually saved (or viewed, when that is the only signal).

Drop: AI mush, fake browser chrome around a 3-card landing, purple gradient on dark, Inter-everywhere, emoji icons, melted type, a shot whose only job is “bakery website mockup.”

A Dribbble drawing is **imagery**, never a site.

## Shipped, or a concept

A Dribbble shot of a screen is usually a mockup with a few short, curated sample texts. It has never faced a long essay, a phone keyboard, Markdown, empty or error states, or the product’s key feature. Mark every app card `shipped: yes | concept`. Shipped sources first for an app: the product’s own in-app screenshots (App Store listings, press kits, help docs) and shipped-screen galleries such as Mobbin or Refero, which may need the person’s login — write `Mobbin: login wall` under drops and go on. When the lead is a concept, **Read this** says what it does not show (`not shown`).

For a typography-first brief, a register source outside screens is allowed: book design, publishers, editorial typography. Say on the card why it is the register.

## A seed

A picture the person gave you is a seed. It is not scored, not dropped for being off-gallery, and it is shown on the moodboard like any other tile. It steers queries (“more like this”) and it ranks candidates on the contact sheet.

## Unsplash / Wikimedia

Search **this** subject, not a stock category name. Drop posed lifestyle and fake product. One real place or material beats a pile of similar ones. Download routes: see [shots.md](shots.md).

A file counts when you can point at a crop where that principle is the subject. If the thing you would leave is what the frame is about, drop it or write the crop. Do not keep ten near-misses to fill a count. The page may use fewer.

If a pass across these galleries cannot fill the count without lowering these gates, the board stays short. Do not fill it with 4s.

## Colour and contrast

Hexes come from a kept shot, sampled from a **crop of the element** they name — never from a photograph, mockup frame, or presentation background unless that is the role. On the card: `#2c2824 body text`, `#b0563a active-tab dot`.

Every adapted hex needs a reason: contrast, the `change` twist, this subject's own pictures, or a brand colour they already have. A generic sampled hex — cream paper, warm ink — may be kept exactly as it was sampled when it is not the reference's identity. Moving `#f6f1e7` to `#f4efe4` is the same cream on screen; it is a change nobody can see, not an adaptation. `leave` lists their identity: a brand accent, a licensed face. It is not every hex on the card.

Before the persist ask, run every adapted text/background pair through `scripts/contrast.mjs` (`"#fg on #bg"`, optional `:large` or `:mark` for 3:1). Body and small text need 4.5:1; large text and non-text marks need 3:1. List each pair with ratio and verdict under **Read this**. A failing colour is adjusted; keep both hexes as `sampled → used`. Card hexes stay what we saw. They are not the brand.

## Type licence

A type pick needs a `licence:` line that covers how this project ships it (bundled in app, self-hosted web, default UI). If it does not cover that use, drop it and name it under drops.
