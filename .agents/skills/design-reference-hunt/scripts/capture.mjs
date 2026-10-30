#!/usr/bin/env node
// Full-page capture. Unsticks fixed/sticky chrome first so Chrome does not
// repeat the same fold. Node 22+. Uses an installed Chrome/Edge/Chromium.
//
//   node capture.mjs <url> --out .design/refs/name.jpg
//   node capture.mjs <url> --out .design/refs/name.jpg --review /tmp/name-review.jpg
//   node capture.mjs <url> --out .design/refs/name.jpg --clip x,y,w,h
//   node capture.mjs <url> --out .design/refs/name.jpg --clip-selector "main"
//   node capture.mjs file:///abs/path/moodboard.html --out /tmp/moodboard.jpg
//   node capture.mjs file:///abs/path/shot.jpg --out .design/refs/name.jpg --clip x,y,w,h
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const url = args[0];
const outArg = flag("out", "") || "";
const reviewArg = flag("review", "") || "";
const clipArg = flag("clip", "") || "";
const clipSelector = flag("clip-selector", "") || "";
if (!url || !/^(https?|file):\/\//.test(url) || !outArg) {
  console.error(
    'usage: node capture.mjs <https://url | file:///path> --out .design/refs/name.jpg [--review /tmp/name-review.jpg] [--clip x,y,w,h | --clip-selector "css"]',
  );
  process.exit(2);
}
if (clipArg && clipSelector) {
  console.error("pass --clip or --clip-selector, not both");
  process.exit(2);
}

function projectRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch {
    return process.cwd();
  }
}

function resolveOut(path) {
  if (!path) return "";
  if (isAbsolute(path)) return path;
  return resolve(projectRoot(), path);
}

const out = resolveOut(outArg);
const reviewOut = resolveOut(reviewArg);

function parseClip(s) {
  if (!s) return null;
  const parts = s.split(",").map((n) => Number(n.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    console.error("clip must be x,y,w,h (non-negative numbers)");
    process.exit(2);
  }
  const [x, y, w, h] = parts;
  if (w < 1 || h < 1) {
    console.error("clip width and height must be >= 1");
    process.exit(2);
  }
  return { x, y, width: w, height: h, scale: 1 };
}

const clip = parseClip(clipArg);

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

const dir = mkdtempSync(join(tmpdir(), "hunt-chrome-"));
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
// Chrome centres an image file and shrinks it to the window. A page that holds
// it at full size from 0,0 makes --clip x,y,w,h the image's own pixels.
let target = url;
if (/^file:\/\/.*\.(png|jpe?g|webp|gif)$/i.test(url)) {
  target = `file://${join(dir, "image.html")}`;
  writeFileSync(join(dir, "image.html"), `<!doctype html><body style="margin:0;background:#000"><img src="${url.replace(/"/g, "%22")}" style="display:block">`);
}
await page("Page.navigate", { url: target }, 40000);
await sleep(2500);

const beforeHref = (
  await page("Runtime.evaluate", {
    expression: "location.href",
    returnByValue: true,
  })
).result.value;

await page("Runtime.evaluate", {
  expression: `(() => {
    const labels = /^(accept( all)?( cookies)?|agree|ok|okay|got it|allow( all)?|i understand|acepto|aceptar)$/i;
    const clickable = document.querySelectorAll("button, [role=button]");
    for (const el of clickable) {
      const t = (el.innerText || el.textContent || "").trim().replace(/\\s+/g, " ");
      if (t.length < 40 && labels.test(t)) { el.click(); break; }
    }
    // Strip short privacy/cookie dialogs (e.g. Google Fonts "×" banner).
    const privacy = /uses cookies|privacy and google fonts|cookie settings/i;
    for (const el of [...document.querySelectorAll("div, section, aside, dialog")]) {
      const t = (el.innerText || el.textContent || "").trim();
      if (t.length > 0 && t.length < 300 && privacy.test(t) && el.children.length < 12) {
        el.remove();
      }
    }
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
await sleep(800);

const afterHref = (
  await page("Runtime.evaluate", {
    expression: "location.href",
    returnByValue: true,
  })
).result.value;

if (afterHref !== beforeHref) {
  console.error(`navigated away: ${afterHref}`);
  drop();
  process.exit(1);
}

await page(
  "Runtime.evaluate",
  {
    expression: `(() => new Promise((done) => {
    (async () => {
      for (const img of document.images) {
        if (img.loading === "lazy") img.loading = "eager";
      }
      const dwell = (ms) => new Promise((r) => setTimeout(r, ms));
      const step = Math.max(480, Math.round(window.innerHeight * 0.65));
      const limit = Math.min(
        Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
        14000
      );
      let y = 0;
      while (y < limit) {
        y = Math.min(limit, y + step);
        window.scrollTo(0, y);
        await dwell(600);
      }
      await Promise.race([
        Promise.all([...document.images].map((img) => img.decode().catch(() => {}))),
        dwell(8000),
      ]);
      window.scrollTo(0, 0);
      await dwell(700);
      done();
    })().catch(() => done());
  }))()`,
    awaitPromise: true,
    returnByValue: true,
  },
  90000,
);

await page("Runtime.evaluate", {
  expression: `(() => {
    const style = document.createElement("style");
    style.textContent = \`
      html, body { height: auto !important; max-height: none !important; overflow: visible !important; }
      * { animation-play-state: paused !important; transition: none !important; scroll-behavior: auto !important; }
    \`;
    document.head.appendChild(style);
    for (const el of document.querySelectorAll("*")) {
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") {
        el.style.setProperty("position", "relative", "important");
        el.style.setProperty("top", "auto", "important");
        el.style.setProperty("bottom", "auto", "important");
      }
    }
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
await sleep(400);

// --clip-selector takes the element's box in document coordinates, measured
// after the unstick pass so the numbers match what the capture sees.
let selected = null;
if (clipSelector) {
  const { result } = await page("Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(clipSelector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, Math.round(r.left + window.scrollX)),
        y: Math.max(0, Math.round(r.top + window.scrollY)),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    })()`,
    returnByValue: true,
  });
  selected = result?.value || null;
  if (!selected) {
    console.error(`no element matches ${clipSelector}`);
    drop();
    process.exit(1);
  }
  if (selected.width < 1 || selected.height < 1) {
    console.error(`${clipSelector} has no box (width ${selected.width}, height ${selected.height})`);
    drop();
    process.exit(1);
  }
}

const metrics = await page("Page.getLayoutMetrics");
const size = metrics.cssContentSize || metrics.contentSize;
const fullWidth = Math.max(1, Math.ceil(size.width || 1440));
const fullHeight = Math.max(1, Math.min(Math.ceil(size.height || 900), 14000));
const clipBox = clip || (selected ? { ...selected, scale: 1 } : null);
const shotClip = clipBox
  ? {
      x: Math.min(clipBox.x, fullWidth - 1),
      y: Math.min(clipBox.y, fullHeight - 1),
      width: Math.min(clipBox.width, fullWidth - Math.min(clipBox.x, fullWidth - 1)),
      height: Math.min(clipBox.height, fullHeight - Math.min(clipBox.y, fullHeight - 1)),
      scale: 1,
    }
  : { x: 0, y: 0, width: fullWidth, height: fullHeight, scale: 1 };

// The file is what its name says, so a reader that trusts the extension is right.
const format = /\.png$/i.test(out) ? "png" : /\.webp$/i.test(out) ? "webp" : "jpeg";
const { data } = await page(
  "Page.captureScreenshot",
  {
    format,
    ...(format === "png" ? {} : { quality: 70 }),
    captureBeyondViewport: true,
    clip: shotClip,
  },
  60000,
);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(data, "base64"));
console.log(out);

if (reviewOut) {
  // Side-by-side columns ~2800 px tall so a tall capture stays readable.
  // Real capture stays the single tall file; review is scratch only.
  const reviewHtml = `<!doctype html><meta charset=utf-8>
<canvas id=c></canvas>
<script>
const src = "data:image/${format};base64,${data}";
const img = new Image();
img.onload = () => {
  const colH = 2800;
  const gap = 20;
  const cols = Math.max(1, Math.ceil(img.height / colH));
  const c = document.getElementById("c");
  c.width = cols * img.width + (cols - 1) * gap;
  c.height = Math.min(colH, img.height);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < cols; i++) {
    const sy = i * colH;
    const sh = Math.min(colH, img.height - sy);
    ctx.drawImage(img, 0, sy, img.width, sh, i * (img.width + gap), 0, img.width, sh);
  }
  document.title = "ready";
};
img.src = src;
</script>`;
  const reviewPage = join(dir, "review.html");
  writeFileSync(reviewPage, reviewHtml);
  await page("Page.navigate", { url: `file://${reviewPage}` }, 20000);
  await sleep(400);
  for (let i = 0; i < 40; i++) {
    const title = (
      await page("Runtime.evaluate", { expression: "document.title", returnByValue: true })
    ).result.value;
    if (title === "ready") break;
    await sleep(100);
  }
  const { result: sizeResult } = await page("Runtime.evaluate", {
    expression: `(() => {
      const c = document.getElementById("c");
      return { w: c.width, h: c.height };
    })()`,
    returnByValue: true,
  });
  const { data: reviewData } = await page(
    "Page.captureScreenshot",
    {
      format: /\.png$/i.test(reviewOut) ? "png" : "jpeg",
      quality: 75,
      clip: { x: 0, y: 0, width: sizeResult.value.w, height: sizeResult.value.h, scale: 1 },
      captureBeyondViewport: true,
    },
    60000,
  );
  mkdirSync(dirname(reviewOut), { recursive: true });
  writeFileSync(reviewOut, Buffer.from(reviewData, "base64"));
  console.log(reviewOut);
}

drop();
process.exit(0);
