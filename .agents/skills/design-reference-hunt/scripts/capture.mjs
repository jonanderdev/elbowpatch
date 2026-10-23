#!/usr/bin/env node
// Full-page capture. Unsticks fixed/sticky chrome first so Chrome does not
// repeat the same fold. Node 22+. Uses an installed Chrome/Edge/Chromium.
//
//   node capture.mjs <url> --out .design/refs/name.jpg
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const url = args[0];
const out = resolve(flag("out", "") || "");
if (!url || !/^https?:\/\//.test(url) || !out) {
  console.error("usage: node capture.mjs <https://url> --out .design/refs/name.jpg");
  process.exit(2);
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
await page("Page.navigate", { url }, 40000);
await sleep(2500);

await page("Runtime.evaluate", {
  expression: `(() => {
    const labels = /accept|agree|ok|got it|allow|i understand|acepto|aceptar/i;
    for (const el of document.querySelectorAll("button, [role=button], a")) {
      const t = (el.innerText || el.textContent || "").trim();
      if (t.length < 40 && labels.test(t)) { el.click(); break; }
    }
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
await sleep(800);

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

const metrics = await page("Page.getLayoutMetrics");
const size = metrics.cssContentSize || metrics.contentSize;
const width = Math.max(1, Math.ceil(size.width || 1440));
const height = Math.max(1, Math.min(Math.ceil(size.height || 900), 14000));
const { data } = await page(
  "Page.captureScreenshot",
  {
    format: "jpeg",
    quality: 70,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  },
  60000,
);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(data, "base64"));
console.log(out);
drop();
process.exit(0);
