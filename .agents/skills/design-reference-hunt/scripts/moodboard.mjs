#!/usr/bin/env node
// A moodboard of the references: every card with a shot, its name, its
// tagline, and a link to its source. The layout is this file. It shows what
// we saw. It does not paint a brand, a logo, a line, or a stat.
//
//   node moodboard.mjs .design/board.md --out .design/moodboard.html
//   node moodboard.mjs .design/hunts/pricing/board.md --out .design/hunts/pricing/moodboard.html
//
// A card with `slot: product` stays off: a product page cropped into a tile is noise.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const outArg = outAt === -1 ? "" : (args.splice(outAt, 2)[1] ?? "");
const boardArg = args[0];
if (!boardArg || !outArg || args.length !== 1) {
  console.error("usage: node moodboard.mjs .design/board.md --out .design/moodboard.html");
  process.exit(2);
}

function projectRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return process.cwd();
  }
}

const root = projectRoot();
const resolvePath = (path) => (isAbsolute(path) ? path : resolve(root, path));
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

function fieldsOf(text) {
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^- ([a-z][a-z /-]*):\s*(.*)$/i);
    if (m) fields[m[1].toLowerCase()] = m[2].trim();
  }
  return fields;
}

const md = readFileSync(boardPath, "utf8");
const cards = md
  .split(/^### /m)
  .slice(1)
  .map((chunk) => {
    const nl = chunk.indexOf("\n");
    const name = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    return { name, ...fieldsOf((nl === -1 ? "" : chunk.slice(nl + 1)).split(/^## /m)[0]) };
  });

const tiles = [];
for (const card of cards) {
  if (!card.shot || /product/i.test(card.slot || "")) continue;
  const abs = resolvePath(card.shot.trim());
  if (!existsSync(abs)) {
    console.error(`moodboard: missing shot ${card.shot.trim()}`);
    continue;
  }
  let src = relative(dirname(outPath), abs).split("\\").join("/");
  if (!src.startsWith(".")) src = `./${src}`;
  // A seed shared in chat has no URL, so its tile has no link.
  const url = (card.url || "").trim().split(/\s+/)[0];
  const img = `<img src="${esc(src)}" alt="${esc(card.name)}" loading="lazy">`;
  const frame = /^https?:\/\//i.test(url)
    ? `<a class="frame" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${img}</a>`
    : `<div class="frame">${img}</div>`;
  const line = card.tagline ? `<p class="line">${esc(card.tagline)}</p>` : "";
  tiles.push(`<figure class="tile">${frame}<figcaption><p class="name">${esc(card.name)}</p>${line}</figcaption></figure>`);
}

if (!tiles.length) {
  console.error("moodboard: no card on the board has a shot");
  process.exit(1);
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moodboard</title>
<style>
  :root { --canvas: #e4e4e2; --paper: #ffffff; --ink: #1c1c1a; --muted: #6f6f6a; }
  * { box-sizing: border-box; }
  html { color-scheme: light; }
  body {
    margin: 0;
    background: var(--canvas);
    color: var(--ink);
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 1200px; margin: 0 auto; padding: 52px 28px 80px; }
  h1 {
    margin: 0 0 20px 2px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 22px; }
  .tile { margin: 0; display: flex; flex-direction: column; background: var(--paper); border-radius: 22px; overflow: hidden; }
  /* The picture sits inside a square frame, so a tall shot cannot stretch its tile. */
  .frame { position: relative; display: block; aspect-ratio: 1; overflow: hidden; background: #141414; }
  .frame img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
  figcaption { flex: 1; padding: 16px 18px 18px; }
  .name { margin: 0; font-size: 15px; line-height: 1.3; }
  .line { margin: 4px 0 0; font-size: 13px; line-height: 1.4; color: var(--muted); }
  @media (max-width: 600px) { main { padding: 28px 16px 48px; } .grid { gap: 16px; } }
</style>
</head>
<body>
<main>
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
