#!/usr/bin/env node
// Build labelled contact sheets from a TSV of label\timageURL.
// Writes JPEG grids (~36 per sheet) into an output directory (scratch, not .design/).
// Viewing listing thumbnails is allowed; this is not a capture.
//
//   node contact-sheet.mjs candidates.tsv --out /tmp/hunt-sheets
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const tsvPath = args[0];
const outDir = resolve(flag("out", "") || "");
const perSheet = Math.max(1, Number(flag("per", "36")) || 36);
if (!tsvPath || !outDir) {
  console.error("usage: node contact-sheet.mjs candidates.tsv --out /tmp/hunt-sheets [--per 36]");
  process.exit(2);
}

const lines = readFileSync(tsvPath, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    // label\timageURL, and any columns after that (a listing URL) are ignored.
    const cols = l.split("\t").map((c) => c.trim());
    if (cols.length === 1) return { label: l, url: l };
    return { label: cols[0], url: cols[1] };
  })
  .filter((r) => /^https?:\/\//i.test(r.url));

if (!lines.length) {
  console.error("no label\timageURL rows found");
  process.exit(1);
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

const dir = mkdtempSync(join(tmpdir(), "hunt-sheet-"));
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
    "--window-size=1600,1200",
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
  width: 1600,
  height: 1200,
  deviceScaleFactor: 1,
  mobile: false,
});

mkdirSync(outDir, { recursive: true });
const sheets = [];
for (let i = 0; i < lines.length; i += perSheet) {
  sheets.push(lines.slice(i, i + perSheet));
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

for (let s = 0; s < sheets.length; s++) {
  const cells = sheets[s]
    .map(
      (r) =>
        `<figure><img src="${esc(r.url)}" loading="eager"><figcaption>${esc(r.label)}</figcaption></figure>`,
    )
    .join("\n");
  const html = `<!doctype html><meta charset=utf-8>
<style>
  body { margin: 16px; background: #1a1a1a; color: #eee; font: 11px/1.2 system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
  figure { margin: 0; background: #2a2a2a; border-radius: 4px; overflow: hidden; }
  img { display: block; width: 100%; height: 140px; object-fit: cover; background: #111; }
  figcaption { padding: 6px 8px; word-break: break-word; max-height: 2.4em; overflow: hidden; }
</style>
<div class="grid">${cells}</div>
<script>
Promise.all([...document.images].map((img) => img.decode().catch(() => {}))).then(() => {
  document.title = "ready";
});
</script>`;
  const htmlPath = join(dir, `sheet-${s + 1}.html`);
  writeFileSync(htmlPath, html);
  await page("Page.navigate", { url: `file://${htmlPath}` }, 30000);
  await sleep(500);
  for (let i = 0; i < 60; i++) {
    const title = (
      await page("Runtime.evaluate", { expression: "document.title", returnByValue: true })
    ).result.value;
    if (title === "ready") break;
    await sleep(150);
  }
  await sleep(400);
  const metrics = await page("Page.getLayoutMetrics");
  const size = metrics.cssContentSize || metrics.contentSize;
  const width = Math.max(1, Math.ceil(size.width || 1600));
  const height = Math.max(1, Math.min(Math.ceil(size.height || 1200), 8000));
  const { data } = await page(
    "Page.captureScreenshot",
    {
      format: "jpeg",
      quality: 80,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    },
    60000,
  );
  const outPath = join(outDir, `sheet-${String(s + 1).padStart(2, "0")}.jpg`);
  writeFileSync(outPath, Buffer.from(data, "base64"));
  console.log(outPath);
}

drop();
process.exit(0);
