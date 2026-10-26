#!/usr/bin/env node
// List Dribbble search/popular cards from a listing URL.
// Headless Chrome; prints TSV: id-slug\tlikes\tviews\timageURL\ttitle
// Counts come from the card's own stat elements. A column it cannot read
// stays empty. It never guesses a count from the title.
//
// Off-topic cards (merch, resumes, worksheets, posters) are dropped by slug
// and title before anything is fetched, and the noise rate goes to stderr.
//
//   node dribbble-cards.mjs "https://dribbble.com/search/shots/popular/product-design?q=writing+app&timeframe=year" --scrolls 4
//   node dribbble-cards.mjs "<url>" --drop "mood,habit" --keep "font,illustration"
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const has = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};
const url = args[0];
const scrolls = Math.max(0, Number(flag("scrolls", "3")) || 3);
const noFilter = has("no-filter");
const words = (s) =>
  String(s || "")
    .toLowerCase()
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
// The shared negative list. These sell the word, not the form: a search for
// "writing app" returns tees, CV services and tracing worksheets.
const OFF_TOPIC = [
  "t-shirt", "tshirt", "tee", "merch", "apparel", "hoodie",
  "resume", "cv", "cover letter", "essay",
  "worksheet", "tracing", "handwriting practice", "alphabet",
  "halloween", "christmas", "valentine",
  "logo", "logotype", "branding", "brand identity", "packaging",
  "poster", "book cover", "sticker", "mockup",
  "chatbot", "mood tracker", "habit tracker",
];
const keep = words(flag("keep", ""));
const dropWords = [...OFF_TOPIC.filter((w) => !keep.includes(w)), ...words(flag("drop", ""))];
if (!url || !/^https?:\/\/(www\.)?dribbble\.com\//i.test(url)) {
  console.error(
    'usage: node dribbble-cards.mjs "https://dribbble.com/search/..." [--scrolls 4] [--drop "a,b"] [--keep "a,b"] [--no-filter]',
  );
  process.exit(2);
}

// Whole words only, so "ai" does not swallow "detail" and "cv" does not
// swallow "cvs". A hyphen in a slug counts as a space.
function offTopic(text) {
  const hay = ` ${String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  return dropWords.find((word) => hay.includes(` ${word.replace(/[^a-z0-9]+/g, " ")} `)) || "";
}

function findChrome() {
  const env = process.env.CHROME_PATH;
  if (env && existsSync(env)) return env;
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const local = process.env.LOCALAPPDATA || "";
  const pf = process.env.PROGRAMFILES || "C:\\Program Files";
  const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  const candidates = [
    join(pf, "Google/Chrome/Application/chrome.exe"),
    join(pf86, "Google/Chrome/Application/chrome.exe"),
    join(local, "Google/Chrome/Application/chrome.exe"),
    join(pf, "Microsoft/Edge/Application/msedge.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((path) => path && existsSync(path)) || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChrome();
if (!exe) {
  console.error("No Chrome/Edge/Chromium found. Install one or set CHROME_PATH.");
  process.exit(1);
}
if (typeof WebSocket === "undefined") {
  console.error("Node 22+ is required.");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "hunt-dribbble-"));
let proc;
const drop = () => {
  try {
    if (proc?.pid) process.kill(proc.pid, "SIGKILL");
  } catch {}
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
};
process.once("exit", drop);

proc = spawn(
  exe,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${dir}`,
    "--no-first-run",
    "--hide-scrollbars",
    "--mute-audio",
    "--force-color-profile=srgb",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

let buf = "";
const wsUrl = await new Promise((resolveWs, reject) => {
  const t = setTimeout(() => reject(new Error("Chrome did not start")), 20000);
  proc.stderr.on("data", (d) => {
    buf += d.toString();
    const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (m) {
      clearTimeout(t);
      resolveWs(m[1]);
    }
  });
  proc.on("exit", (code) => {
    clearTimeout(t);
    reject(new Error(`Chrome exited ${code}`));
  });
});

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error("CDP socket failed"));
});
let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve: ok, reject: bad } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) bad(new Error(msg.error.message));
    else ok(msg.result);
  }
};
const send = (method, params = {}, sessionId, timeoutMs = 30000) => {
  const id = nextId++;
  return new Promise((resolveSend, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolveSend(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
};

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const page = (method, params, timeoutMs) => send(method, params, sessionId, timeoutMs);

await page("Page.enable");
await page("Runtime.enable");
await page("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await page("Page.navigate", { url }, 40000);
await sleep(3000);

for (let i = 0; i < scrolls; i++) {
  await page("Runtime.evaluate", {
    expression: "window.scrollBy(0, Math.round(window.innerHeight * 0.9))",
    returnByValue: true,
  });
  await sleep(900);
}

const { result } = await page("Runtime.evaluate", {
  expression: `(() => {
    const rows = [];
    const seen = new Set();
    const tidy = (t) => (t || "").replace(/\\s+/g, "");
    const isCount = (t) => /^[\\d][\\d.,]*[kKmM]?$/.test(t);
    const hints = (el) =>
      ["aria-label", "title", "class", "data-type", "data-test"]
        .map((name) => el.getAttribute(name) || "")
        .join(" ");
    // A counter labelled as likes or views: its own text, or the one
    // descendant that is nothing but a count.
    const labelled = (li, word) => {
      const re = new RegExp(word, "i");
      for (const el of li.querySelectorAll("*")) {
        if (!re.test(hints(el))) continue;
        const own = tidy(el.textContent);
        if (isCount(own)) return own;
        for (const kid of el.querySelectorAll("*")) {
          const t = tidy(kid.textContent);
          if (isCount(t)) return t;
        }
      }
      return "";
    };
    // Fallback: leaf elements whose whole text is a count, in DOM order.
    // Dribbble prints likes first, then views. Free text is never read.
    const leafCounts = (li) => {
      const out = [];
      for (const el of li.querySelectorAll("*")) {
        if (el.children.length) continue;
        const t = tidy(el.textContent);
        if (isCount(t)) out.push(t);
      }
      return out;
    };
    for (const li of document.querySelectorAll("li")) {
      const a = li.querySelector('a[href*="/shots/"]');
      if (!a) continue;
      const m = (a.getAttribute("href") || "").match(/\\/shots\\/([^/?#]+)/);
      if (!m) continue;
      const idSlug = m[1];
      if (seen.has(idSlug)) continue;
      const img = li.querySelector("img");
      if (!img) continue;
      const raw = img.getAttribute("data-src") || img.currentSrc || img.src || "";
      const imageURL = raw.replace(/\\?.*$/, "");
      if (!imageURL) continue;
      seen.add(idSlug);
      let likes = labelled(li, "like");
      let views = labelled(li, "view");
      if (!likes && !views) {
        const counts = leafCounts(li);
        likes = counts[0] || "";
        views = counts[1] || "";
      }
      const title = (img.getAttribute("alt") || a.getAttribute("title") || idSlug).replace(/\\t/g, " ").trim();
      rows.push([idSlug, likes, views, imageURL, title].join("\\t"));
    }
    return rows.join("\\n");
  })()`,
  returnByValue: true,
});

const tsv = result?.value || "";
if (!tsv.trim()) {
  console.error(
    "0 cards (empty listing or rate limit — retry after 8s, then after 30s; if it is still 0, record it under the board's drops as `<query>: 0 cards (rate limit?)`)",
  );
  drop();
  process.exit(1);
}

const all = tsv.split("\n").filter(Boolean);
const reasons = new Map();
const kept = noFilter
  ? all
  : all.filter((row) => {
      const [idSlug, , , , title = ""] = row.split("\t");
      const word = offTopic(`${idSlug} ${title}`);
      if (!word) return true;
      reasons.set(word, (reasons.get(word) ?? 0) + 1);
      return false;
    });
const cut = all.length - kept.length;
if (cut > 0) {
  const top = [...reasons.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word, n]) => `${word} ${n}`)
    .join(", ");
  // The noise rate belongs under the board's drops. A high one means the
  // query is wrong, not that there is more scrolling to do.
  console.error(
    `${kept.length} of ${all.length} cards kept, ${Math.round((cut / all.length) * 100)}% off-topic (${top})`,
  );
}
if (!kept.length) {
  console.error("every card was off-topic — query the form, not the word (add \"ui\", \"screen\", or a category path)");
  drop();
  process.exit(1);
}
console.log(kept.join("\n"));
drop();
process.exit(0);
