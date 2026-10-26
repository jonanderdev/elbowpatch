#!/usr/bin/env node
// A moodboard of the references. The layout is this file.
// It shows what we saw. It does not paint a brand, a logo, a line, or a stat.
//
// Before the pick (so they choose by looking):
//   node moodboard.mjs .design/board.md --out .design/moodboard.html
//
// After the pick (marks the lead, keeps the rest):
//   node moodboard.mjs .design/board.md --out .design/moodboard.html \
//     --leads "<card name>" --also "<card name>,<card name>" --why "<their reason>"
//
// --also takes every card they also liked. --count is how many references
// they asked to see. --imagery adds the board's imagery tiles; leave it off
// when the look has no pictures in it.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return "";
  const v = args[i + 1] ?? "";
  args.splice(i, 2);
  return v;
};
const has = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};

const outArg = flag("out");
const leadsArg = flag("leads");
const alsoArg = flag("also");
const whyArg = flag("why");
const countArg = flag("count");
const showImagery = has("imagery");
const boardArg = args[0];
if (!boardArg || !outArg || args.length !== 1) {
  console.error(
    'usage: node moodboard.mjs .design/board.md --out .design/moodboard.html [--leads "Name"] [--also "A,B"] [--why "their reason"] [--count 12] [--imagery]',
  );
  process.exit(2);
}

function projectRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch {
    return process.cwd();
  }
}

function resolvePath(path) {
  if (!path) return "";
  if (isAbsolute(path)) return path;
  return resolve(projectRoot(), path);
}

const boardPath = resolvePath(boardArg);
const outPath = resolvePath(outArg);
if (!existsSync(boardPath)) {
  console.error(`moodboard: no board at ${boardArg}`);
  process.exit(1);
}

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");

function fieldsOf(text) {
  const fields = {};
  let key = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^- ([a-z][a-z /-]*):\s*(.*)$/i);
    if (m) {
      key = m[1].toLowerCase();
      fields[key] = m[2].trim();
      continue;
    }
    if (key && /^\s+\S/.test(line)) fields[key] = `${fields[key]} ${line.trim()}`.trim();
  }
  return fields;
}

function lum(hex) {
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(hex.slice(i + 1, i + 3), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function expand(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  return `#${full.toLowerCase()}`;
}

function swatches(colour) {
  const found = [];
  const re = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?:\s*(?:→|->)\s*#([0-9a-fA-F]{6}|[0-9a-fA-F]{3}))?/g;
  let m;
  while ((m = re.exec(colour))) found.push({ index: m.index, end: re.lastIndex, hex: expand(m[2] || m[1]) });
  const out = [];
  for (let i = 0; i < found.length; i++) {
    const end = i + 1 < found.length ? found[i + 1].index : colour.length;
    const label = colour
      .slice(found[i].end, end)
      .replace(/^[\s,;:–\-."']+|[\s,;:–\-."']+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!out.some((s) => s.hex === found[i].hex)) out.push({ hex: found[i].hex, label });
  }
  return out.slice(0, 8);
}

// `faces:` is a list of names. `type:` is prose, so it is only a fallback and
// anything that reads like a sentence is dropped rather than shown as a face.
function facesOf(card) {
  const listed = (card.faces || "")
    .split(/,|\s+and\s+|\s+&\s+|\s+\+\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (listed.length) return listed.filter(isFaceName).slice(0, 3);
  return (card.type || "")
    .split(/,|\s+and\s+|\s+&\s+|\s+\+\s+/i)
    .map((s) => s.replace(/\s+for\s+.*/i, "").replace(/^(a pairing of|pairing of|the)\s+/i, "").trim())
    .filter(isFaceName)
    .slice(0, 2);
}

function isFaceName(name) {
  const words = name.split(/\s+/);
  return (
    /^[\p{L}\p{N}][\p{L}\p{N} .'’&-]*$/u.test(name) &&
    words.length <= 4 &&
    !/^(body|headline|display|serif|sans|sans-serif|mono|monospace|text|titles?|labels?)$/i.test(name)
  );
}

function isSans(name) {
  return /sans|grotesk|grotesque|gothic|america|aeonik|inter|helvetica|neue|haas|sohne|söhne|geist|satoshi|switzer|untitled/i.test(
    name,
  );
}

function cssFamily(name) {
  const serif = "'Iowan Old Style', Palatino, 'Palatino Linotype', Georgia, serif";
  if (!name) return serif;
  // Single quotes, so the value is safe inside a style="" attribute once escaped.
  const safe = name.replace(/['"\\<>;{}]/g, "").slice(0, 80);
  const fallback = isSans(name) ? "'Helvetica Neue', Helvetica, Arial, sans-serif" : serif;
  return `'${safe}', ${fallback}`;
}

// Optimistic: a face that is on Google Fonts renders for real, one that is not
// falls back. No axes are requested, so a family without 500 still resolves.
function fontsHref(names) {
  const families = names
    .filter((n) => /^[A-Za-z0-9][A-Za-z0-9 ]*$/.test(n))
    .map((n) => `family=${n.trim().replace(/\s+/g, "+")}`);
  if (!families.length) return "";
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

function webPath(fromFile, absTarget) {
  let rel = relative(dirname(fromFile), absTarget).split("\\").join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

function shotSrc(shot) {
  if (!shot) return "";
  const abs = resolvePath(shot.trim());
  if (!existsSync(abs)) {
    console.error(`moodboard: missing shot ${shot.trim()}`);
    return "";
  }
  return webPath(outPath, abs);
}

function href(url) {
  const value = (url || "").trim().split(/\s+/)[0] || "";
  return /^https?:\/\//i.test(value) ? value : "";
}

const md = readFileSync(boardPath, "utf8");
const readSlice = md.match(/## Read this\s*\n([\s\S]*?)(?=\n## |\n### |\n- kind:|$)/);
const read = readSlice ? fieldsOf(readSlice[1]) : {};

const cards = [];
const chunks = md.split(/^### /m).slice(1);
for (const chunk of chunks) {
  const nl = chunk.indexOf("\n");
  const name = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
  const body = nl === -1 ? "" : chunk.slice(nl + 1);
  const cut = body.search(/^- kind:/m);
  cards.push({ name, ...fieldsOf((cut === -1 ? body : body.slice(0, cut)).split(/^## /m)[0]) });
}

const leadsName = leadsArg || read.leads || read.primary || "";
const primary = leadsName ? cards.find((c) => norm(c.name) === norm(leadsName)) : null;
if (leadsName && !primary) {
  console.error(`moodboard: no card named ${leadsName}`);
  process.exit(1);
}
// --also takes every card they said they liked, not only one.
const alsoNames = (alsoArg || (read.also && !/^none$/i.test(read.also.trim()) ? read.also : ""))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const alsoCards = [];
for (const name of alsoNames) {
  const card = cards.find((c) => norm(c.name) === norm(name));
  if (card) alsoCards.push(card);
  else console.error(`moodboard: no card named ${name}`);
}
const also = alsoCards[0] || null;

const imagery = [];
{
  let inCard = false;
  let cur = null;
  const push = () => {
    if (cur?.kind === "imagery" && cur.shot) imagery.push(cur);
    cur = null;
  };
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith("### ")) {
      inCard = true;
      push();
      continue;
    }
    if (line.startsWith("## ")) {
      inCard = false;
      push();
      continue;
    }
    const m = line.match(/^- ([a-z][a-z /-]*):\s*(.*)$/i);
    if (m && m[1].toLowerCase() === "kind") {
      inCard = false;
      push();
      cur = { kind: m[2].trim().toLowerCase() };
      continue;
    }
    if (inCard) continue;
    if (cur && m) cur[m[1].toLowerCase()] = m[2].trim();
    else if (cur && line.trim() === "") push();
  }
  push();
}

// Screens and sites close to this subject. A product page cropped into a tile
// reads as noise, and a `form` card is a layout note, not a picture to feel.
// --count is how many references they said they wanted to see.
const MAX_PICTURES = Math.max(2, Math.min(24, Number(countArg) || 12));
const boardHasSlots = cards.some((c) => c.slot);
function showable(card) {
  if (!card.shot) return false;
  if (boardHasSlots && /product/i.test(card.slot || "")) return false;
  if (/^form$/i.test((card.fit || "").trim())) return false;
  return true;
}

const chosen = [];
const add = (card, role) => {
  if (!card || chosen.some((c) => c.card === card)) return;
  chosen.push({ card, role });
};
if (primary) add(primary, "leads");
for (const card of alsoCards) add(card, "also");
for (const card of cards) {
  if (chosen.length >= MAX_PICTURES) break;
  if (showable(card)) add(card, "");
}
const pictures = chosen
  .filter((c) => c.role || showable(c.card))
  .flatMap(({ card, role }) => {
    const src = shotSrc(card.shot);
    if (!src) return [];
    const caption = role === "leads" && whyArg.trim() ? whyArg.trim() : (card.tagline || "").trim();
    return [{ src, role, name: card.name, caption, url: href(card.url) }];
  })
  .slice(0, MAX_PICTURES);

if (showImagery && imagery.length > 4) console.error(`moodboard: showing 4 of ${imagery.length} imagery`);
const picturesOfPlace = showImagery
  ? imagery.slice(0, 4).flatMap((item) => {
      const src = shotSrc(item.shot);
      return src ? [{ src, caption: (item.shows || "").trim(), url: href(item.url) }] : [];
    })
  : [];

// Before the pick there is no lead yet, so the type and the colour tiles read
// the cards on show instead.
const onShow = pictures.map((pic) => cards.find((c) => c.name === pic.name)).filter(Boolean);
const colourCards = [];
if (primary?.colour) colourCards.push({ name: primary.name, colours: swatches(primary.colour).slice(0, 6) });
else {
  const from = onShow.find((c) => c.colour);
  if (from) colourCards.push({ name: from.name, colours: swatches(from.colour).slice(0, 6), show: true });
}
// The night palette often comes from the `also` card. Show it, or the picture
// and the adaptation disagree.
if (also?.colour && /^register$/i.test((also.fit || "").trim())) {
  colourCards.push({ name: also.name, colours: swatches(also.colour).slice(0, 4) });
}
const colourCount = colourCards.reduce((n, c) => n + c.colours.length, 0);

const seenFaces = [];
const faceCards = primary ? [primary, also && !/^form$/i.test((also.fit || "").trim()) ? also : null] : onShow;
for (const card of faceCards) {
  if (!card) continue;
  for (const face of facesOf(card)) {
    if (!seenFaces.some((f) => norm(f) === norm(face))) seenFaces.push(face);
  }
}
const faces = seenFaces.slice(0, 3);
const family = cssFamily(faces[0] || "");
const fonts = fontsHref(faces);
const ink = "#1c1c1a";

const tiles = [];
if (faces.length) {
  const names = faces
    .map((face) => `<p class="face" style="font-family:${esc(cssFamily(face))}">${esc(face)}</p>`)
    .join("");
  tiles.push(`<article class="tile type span-${colourCount ? 2 : 6}">
      <p class="kicker">Type we saw</p>
      <p class="aa">Aa</p>
      <div class="faces">${names}</div>
    </article>`);
}
if (colourCount) {
  const span = faces.length ? 4 : 6;
  const rows = colourCards
    .filter((group) => group.colours.length)
    .map((group, i) => {
      const chips = group.colours
        .map((s) => {
          const edge = lum(s.hex) > 0.86 ? " chip-edge" : "";
          return `<div class="swatch"><div class="chip${edge}" style="background:${esc(s.hex)}"></div><p class="hex">${esc(s.hex)}</p>${s.label ? `<p class="role">${esc(s.label)}</p>` : ""}</div>`;
        })
        .join("");
      const label = i === 0 && !group.show ? "" : `<p class="from">${esc(group.name)}</p>`;
      return `${label}<div class="swatches">${chips}</div>`;
    })
    .join("");
  tiles.push(`<article class="tile colour span-${span}"><p class="kicker">Colour we saw</p><div class="rows">${rows}</div></article>`);
}
for (const pic of pictures) {
  const span = pic.role ? 3 : 2;
  const kicker = pic.role === "leads" ? "Leads" : pic.role === "also" ? "Also" : "";
  const img = `<img src="${esc(pic.src)}" alt="${esc(pic.name)}" loading="lazy">`;
  const frame = pic.url
    ? `<a class="frame" href="${esc(pic.url)}" target="_blank" rel="noopener noreferrer">${img}</a>`
    : `<div class="frame">${img}</div>`;
  tiles.push(`<figure class="tile shot span-${span}${pic.role ? " marked" : ""}">${frame}<figcaption>${kicker ? `<p class="kicker">${esc(kicker)}</p>` : ""}<p class="name">${esc(pic.name)}</p>${pic.caption ? `<p class="line">${esc(pic.caption)}</p>` : ""}</figcaption></figure>`);
}
for (const pic of picturesOfPlace) {
  const img = `<img src="${esc(pic.src)}" alt="${esc(pic.caption || "Imagery")}" loading="lazy">`;
  const frame = pic.url
    ? `<a class="frame" href="${esc(pic.url)}" target="_blank" rel="noopener noreferrer">${img}</a>`
    : `<div class="frame">${img}</div>`;
  tiles.push(`<figure class="tile shot picture span-2">${frame}<figcaption><p class="kicker">Imagery</p>${pic.caption ? `<p class="line">${esc(pic.caption)}</p>` : ""}</figcaption></figure>`);
}

if (!tiles.length) {
  console.error("moodboard: nothing on the board to show");
  process.exit(1);
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moodboard</title>
${fonts ? `<link rel="stylesheet" href="${esc(fonts)}">\n` : ""}<style>
  :root {
    --display: ${family};
    --ink: ${ink};
    --paper: #ffffff;
    --canvas: #e4e4e2;
    --muted: #6f6f6a;
    --ui: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  html { color-scheme: light; }
  body {
    margin: 0;
    min-height: 100vh;
    background: var(--canvas);
    color: var(--ink);
    font-family: var(--ui);
    -webkit-font-smoothing: antialiased;
  }
  .sheet { max-width: 1200px; margin: 0 auto; padding: 52px 28px 80px; }
  h1 {
    margin: 0 0 20px 2px;
    font-family: var(--ui);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 22px; align-items: stretch; }
  .tile { background: var(--paper); border-radius: 22px; overflow: hidden; min-width: 0; }
  .span-2 { grid-column: span 2; }
  .span-3 { grid-column: span 3; }
  .span-4 { grid-column: span 4; }
  .span-6 { grid-column: span 6; }
  .kicker {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .type, .colour { padding: 26px 28px 24px; }
  .type {
    display: flex;
    flex-direction: column;
    min-height: 280px;
    background: #171717;
    color: #f6f5f2;
  }
  .type .kicker { color: rgba(255, 255, 255, 0.55); }
  .aa {
    margin: 24px 0 0;
    font-family: var(--display);
    font-size: 104px;
    line-height: 0.78;
    letter-spacing: -0.045em;
    font-weight: 500;
    color: #f6f5f2;
  }
  .faces { margin-top: 24px; }
  .face {
    margin: 0;
    font-size: 22px;
    line-height: 1.25;
    letter-spacing: -0.03em;
    color: #f6f5f2;
  }
  .face + .face { margin-top: 4px; font-size: 17px; color: rgba(255, 255, 255, 0.68); }
  .colour { display: flex; flex-direction: column; min-height: 280px; }
  .rows { margin-top: auto; padding-top: 24px; display: grid; gap: 18px; }
  .from {
    margin: 0 0 8px;
    font-size: 12px;
    letter-spacing: 0.02em;
    color: var(--muted);
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
    gap: 12px 14px;
  }
  .chip { height: 92px; border-radius: 14px; }
  .chip-edge { box-shadow: inset 0 0 0 1px rgba(28, 28, 26, 0.14); }
  .hex {
    margin: 8px 0 0;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.02em;
    color: #3c3c39;
  }
  .role { margin: 3px 0 0; font-size: 12px; line-height: 1.35; color: var(--muted); }
  .shot { margin: 0; display: flex; flex-direction: column; }
  .frame {
    display: block;
    background: #141414;
    aspect-ratio: 1;
  }
  .shot img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
  }
  .shot figcaption { flex: 1; padding: 16px 18px 18px; background: var(--paper); color: var(--ink); }
  .shot .name { margin: 6px 0 0; font-size: 15px; line-height: 1.3; letter-spacing: -0.01em; }
  .shot .line { margin: 4px 0 0; font-size: 13px; line-height: 1.4; color: var(--muted); }
  .shot figcaption .kicker + .name { margin-top: 6px; }
  .marked .frame { aspect-ratio: 4 / 3; }
  .marked .name { font-family: var(--display); font-size: 22px; letter-spacing: -0.02em; }
  .marked .line { font-size: 15px; color: #3a3a38; }
  @media (max-width: 900px) {
    .sheet { padding: 28px 16px 48px; }
    .grid { gap: 16px; }
    .tile, .span-2, .span-3, .span-4, .span-6 { grid-column: 1 / -1; }
    .aa { font-size: 84px; }
  }
</style>
</head>
<body>
<main class="sheet">
  <h1>Moodboard</h1>
  <div class="grid">
    ${tiles.join("\n    ")}
  </div>
</main>
</body>
</html>
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
console.log(outArg);
