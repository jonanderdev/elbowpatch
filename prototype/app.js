// Elbowpatch — paged writing prototype. Not the product: one piece, kept in this browser only.
// The page is a CSS multi-column flow: each column is one page, and the view slides to the
// column that holds the caret. Pages form as you type; nothing scrolls.
(() => {
  const GAP = 96;
  const STORE = "elbowpatch-prototype-3";
  const STORE_OLD = "elbowpatch-prototype-2";
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const svg = (d) => `<svg viewBox="0 0 20 20" aria-hidden="true">${d}</svg>`;
  // One icon language: 20px box, 1.5px stroke, round ends, the title colour.
  const ICON = {
    add: svg('<path d="M10 4.5v11M4.5 10h11"/>'),
    history: svg('<path d="M4 10a6 6 0 1 0 1.8-4.3"/><path d="M4 4.5v3.2h3.2"/><path d="M10 7v3.2l2.2 1.4"/>'),
    moon: svg('<path d="M15.6 12.4A6.2 6.2 0 0 1 7.6 4.4a6.2 6.2 0 1 0 8 8z"/>'),
    sun: svg('<circle cx="10" cy="10" r="3.2"/><path d="M10 2.8v1.4M10 15.8v1.4M2.8 10h1.4M15.8 10h1.4M4.9 4.9l1 1M14.1 14.1l1 1M4.9 15.1l1-1M14.1 5.9l1-1"/>'),
    close: svg('<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>'),
    left: svg('<path d="M4 5.5h12M4 8.5h8M4 11.5h12M4 14.5h7"/>'),
    justify: svg('<path d="M4 5.5h12M4 8.5h12M4 11.5h12M4 14.5h7"/>'),
    quote: svg('<path d="M5 13.5c0-3 1.2-5 3.4-6.2M5 13.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0zM11.2 13.5c0-3 1.2-5 3.4-6.2M11.2 13.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0z"/>'),
    keep: svg('<path d="M6 3.8h8v12.4l-4-2.8-4 2.8z"/>'),
    keyboard: svg('<rect x="3" y="5" width="14" height="8.5" rx="2"/><path d="M6 8h.01M8.7 8h.01M11.3 8h.01M14 8h.01M7 10.8h6M8 15.6l2 1.6 2-1.6"/>'),
    settings: svg('<path d="M4 6.5h7M14.5 6.5H16M4 13.5h1.5M9 13.5h7"/><circle cx="12.7" cy="6.5" r="1.7"/><circle cx="7.2" cy="13.5" r="1.7"/>'),
  };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const wordCount = (html) => {
    const t = html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").trim();
    return t ? t.split(/\s+/).length : 0;
  };
  function when(ms) {
    const d = new Date(ms);
    if (d.toDateString() === new Date().toDateString()) return "Today";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  function blocksToHtml(blocks) {
    return blocks
      .map((b) => (typeof b === "string"
        ? `<p>${esc(b)}</p>`
        : `<blockquote><p>${esc(b.quote)}</p>${b.by ? `<cite>${esc(b.by)}</cite>` : ""}</blockquote>`))
      .join("");
  }
  function load(key = STORE) { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } }
  function save(state) { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* private window: nothing kept */ } }

  const seg = (name, label, items) => `
    <div class="sheet-row">
      <span class="sheet-label">${label}</span>
      <div class="seg" role="group" aria-label="${label}">
        ${items.map(([v, inner, aria]) => `<button type="button" data-${name}="${v}"${aria ? ` aria-label="${aria}"` : ""}>${inner}</button>`).join("")}
      </div>
    </div>`;

  window.EPmount = function mount(root, opts = {}) {
    const sample = window.EP_SAMPLE;
    const saved = opts.persist ? load() : null;
    // The earlier one-piece prototype kept its piece under STORE_OLD; carry it over once.
    const old = opts.persist && !saved ? load(STORE_OLD) : null;
    let pieces = opts.pieces || saved?.pieces || seed();
    let piece = opts.empty
      ? { id: uid(), title: "", html: "", updated: Date.now() }
      : pieces.find((p) => p.id === saved?.openId) || pieces[0] || null;
    const settings = {
      mode: "system", size: "m", measure: "narrow", leading: "normal", align: "left", dropcap: false,
      ...(saved?.settings || old?.settings || {}), ...(opts.settings || {}),
    };

    function seed() {
      const list = [{ id: uid(), title: old?.piece?.title ?? sample.title, html: old?.piece?.html ?? blocksToHtml(sample.blocks), updated: Date.now() }];
      const prev = opts.persist ? load(STORE_OLD + "-previous") : null;
      if (prev && (prev.title || prev.html)) list.push({ id: uid(), title: prev.title, html: prev.html, updated: Date.now() - 86400000 });
      return list;
    }

    root.innerHTML = `
      <div class="ep">
        <button type="button" class="ep-back" data-act="library">Library</button>
        <p class="ep-runhead" hidden aria-hidden="true"><span class="t"></span></p>
        <div class="ep-page">
          <div class="ep-flow" style="--gap:${GAP}px">
            <h1 class="ep-title" contenteditable="plaintext-only" spellcheck="false" aria-label="Title">${esc(piece?.title || "")}</h1>
            <div class="ep-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Body">${piece?.html || ""}</div>
          </div>
        </div>
        <p class="ep-announce" aria-live="polite"></p>
        <div class="ep-dock">
          <div class="ep-bar" role="toolbar" aria-label="Piece">
            <span class="bar-words"></span>
            <span class="bar-sep" aria-hidden="true"></span>
            <button type="button" class="icon" data-act="history" aria-label="Time machine" title="Time machine — not in this prototype">${ICON.history}</button>
            <button type="button" class="icon" data-act="type" aria-label="Text settings" aria-haspopup="dialog" title="Text settings"><span class="aa">Aa</span></button>
            <button type="button" class="icon" data-act="theme"></button>
            <span class="bar-sep" aria-hidden="true"></span>
            <button type="button" class="icon" data-act="close" aria-label="Close tools">${ICON.close}</button>
          </div>
          <button type="button" class="ep-patch" aria-expanded="false">1</button>
        </div>
        <dialog class="ep-sheet" aria-label="Text settings">
          ${seg("size", "Text size", [["s", '<span class="a-s">A</span>', "Small"], ["m", '<span class="a-m">A</span>', "Medium"], ["l", '<span class="a-l">A</span>', "Large"]])}
          ${seg("leading", "Line spacing", [["tight", "Tight"], ["normal", "Normal"], ["loose", "Loose"]])}
          ${seg("align", "Alignment", [["left", ICON.left, "Left"], ["justify", ICON.justify, "Justified"]])}
          ${seg("mode", "Page", [["paper", '<span class="dot paper"></span>Paper'], ["night", '<span class="dot night"></span>Night']])}
          ${seg("measure", "Width", [["narrow", "Narrow"], ["wide", "Wide"]])}
          <div class="sheet-row switch-row">
            <span class="switch-label">Drop cap</span>
            <button type="button" class="switch" role="switch" data-act="dropcap" aria-label="Drop cap"><i></i></button>
          </div>
          <div class="sheet-foot">
            <button type="button" class="text-link" data-act="done" autofocus>Done</button>
          </div>
        </dialog>
        <section class="ep-library" aria-label="Library">
          <div class="lib-inner">
            <header class="lib-head">
              <h2 class="lib-title">Library</h2>
              <button type="button" class="icon" data-act="settings" aria-label="Settings" title="Settings — not in this prototype">${ICON.settings}</button>
            </header>
            <ol class="lib-list"></ol>
            <p class="lib-empty">Nothing written yet.</p>
          </div>
          <div class="ep-dock">
            <button type="button" class="ep-patch" data-act="new" aria-label="New piece" title="New piece">${ICON.add}</button>
          </div>
        </section>
      </div>`;

    const ep = root.querySelector(".ep");
    const page = ep.querySelector(".ep-page");
    const flow = ep.querySelector(".ep-flow");
    const title = ep.querySelector(".ep-title");
    const body = ep.querySelector(".ep-body");
    const runhead = ep.querySelector(".ep-runhead");
    const wordsEl = ep.querySelector(".bar-words");
    const patch = ep.querySelector(":scope > .ep-dock .ep-patch");
    const library = ep.querySelector(".ep-library");
    const list = library.querySelector(".lib-list");
    const backBtn = ep.querySelector(".ep-back");
    const bar = ep.querySelector(".ep-bar");
    const sheet = ep.querySelector(".ep-sheet");
    const themeBtn = ep.querySelector('[data-act="theme"]');
    const dropBtn = sheet.querySelector('[data-act="dropcap"]');
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    if (opts.phone || root.clientWidth <= 600) ep.classList.add("is-phone");

    let current = 0;
    let total = 1;
    let frozenWords = null;
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch {}

    const stride = () => page.clientWidth + GAP;
    const pageOf = (x) => Math.max(0, Math.floor((x - flow.getBoundingClientRect().left + 1) / stride()));
    const isNight = () => settings.mode === "night" || (settings.mode === "system" && dark.matches);

    function applySettings() {
      const theme = isNight() ? "night" : "paper";
      Object.assign(ep.dataset, { theme, size: settings.size, measure: settings.measure, leading: settings.leading, align: settings.align, dropcap: settings.dropcap ? "on" : "off" });
      themeBtn.innerHTML = isNight() ? ICON.sun : ICON.moon;
      themeBtn.setAttribute("aria-label", isNight() ? "Switch to paper" : "Switch to night");
      themeBtn.title = isNight() ? "Paper" : "Night";
      for (const key of ["size", "leading", "align", "measure"]) {
        sheet.querySelectorAll(`[data-${key}]`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[key] === settings[key])));
      }
      sheet.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === theme)));
      dropBtn.setAttribute("aria-checked", String(!!settings.dropcap));
    }

    function count() {
      const r = document.createRange();
      r.selectNodeContents(flow);
      let right = flow.getBoundingClientRect().left;
      for (const rect of r.getClientRects()) if (rect.width) right = Math.max(right, rect.right);
      total = pageOf(right - 1) + 1;
    }

    function caretPage() {
      const sel = window.getSelection();
      if (!sel.rangeCount || !flow.contains(sel.anchorNode)) return current;
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      let rect = range.getClientRects()[0];
      if (!rect) rect = (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).getBoundingClientRect();
      return pageOf(rect.left);
    }

    function words() {
      if (frozenWords !== null) return frozenWords;
      const t = body.innerText.trim();
      return t ? t.split(/\s+/).length : 0;
    }

    function render() {
      flow.style.transform = `translateX(${-current * stride()}px)`;
      runhead.hidden = current === 0;
      runhead.querySelector(".t").textContent = title.textContent.trim() || "Untitled";
      patch.textContent = String(current + 1);
      patch.classList.toggle("is-wide", current + 1 > 99);
      patch.setAttribute("aria-label", `Page ${current + 1} of ${total}. Open tools`);
      const w = words();
      wordsEl.textContent = `${total > 1 ? `${current + 1} of ${total}  ·  ` : ""}${w.toLocaleString("en")} ${w === 1 ? "word" : "words"}`;
      body.classList.toggle("is-empty", !body.textContent.trim());
    }

    let announced = -1;
    function announce() {
      if (current === announced) return;
      announced = current;
      ep.querySelector(".ep-announce").textContent = `Page ${current + 1} of ${total}`;
    }

    // At night, the blocks before the one being written dim.
    function dim() {
      const sel = window.getSelection();
      const node = sel.rangeCount && body.contains(sel.anchorNode) ? sel.anchorNode : null;
      const at = node ? (node.nodeType === 1 ? node : node.parentElement).closest(".ep-body > *") : null;
      let past = !!at;
      for (const block of body.children) {
        if (block === at) past = false;
        block.classList.toggle("is-past", past);
      }
    }

    function turn(n) {
      current = Math.max(0, Math.min(total - 1, n));
      render();
      announce();
    }

    function persist() {
      if (!opts.persist) return;
      if (piece) Object.assign(piece, { title: title.textContent, html: body.innerHTML });
      save({ pieces, openId: piece?.id, settings });
    }

    // Two views: the library (where the app opens) and the page. The other one is inert.
    function showView(v) {
      ep.dataset.view = v;
      library.inert = v !== "library";
      for (const el of [backBtn, runhead, page, patch.parentElement]) el.inert = v === "library";
      ep.classList.remove("is-open");
      patch.setAttribute("aria-expanded", "false");
    }

    function renderLibrary() {
      pieces.sort((a, b) => b.updated - a.updated);
      list.innerHTML = pieces.map((p) => {
        const w = wordCount(p.html);
        return `<li><button type="button" class="lib-item" data-id="${p.id}">
          <span class="lib-name">${esc(p.title.trim() || "Untitled")}</span>
          <span class="lib-meta">${w.toLocaleString("en")} ${w === 1 ? "word" : "words"} · ${when(p.updated)}</span>
        </button></li>`;
      }).join("");
      library.classList.toggle("is-empty", !pieces.length);
    }

    function showLibrary() {
      persist();
      // A piece left with nothing in it is not kept.
      if (piece && !piece.title.trim() && !wordCount(piece.html)) {
        pieces = pieces.filter((p) => p !== piece);
        piece = null;
        persist();
      }
      renderLibrary();
      showView("library");
      if (!opts.static) (list.querySelector("button") || library.querySelector('[data-act="new"]')).focus({ preventScroll: true });
    }

    function openPiece(p) {
      piece = p;
      title.textContent = p.title;
      body.innerHTML = p.html;
      current = 0;
      showView("page");
      count();
      render();
      dim();
      persist();
      if (!p.title && !opts.static) title.focus();
    }

    function onEdit() {
      if (!body.querySelector("p") && body.textContent.trim()) {
        body.innerHTML = `<p>${esc(body.textContent)}</p>`;
        const r = document.createRange();
        r.selectNodeContents(body.firstChild);
        r.collapse(false);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      }
      count();
      current = Math.min(caretPage(), total - 1);
      render();
      announce();
      dim();
      if (piece) piece.updated = Date.now();
      persist();
    }

    function reflow() {
      count();
      current = Math.min(current, total - 1);
      render();
    }

    function setOpen(open) {
      ep.classList.toggle("is-open", open);
      patch.setAttribute("aria-expanded", String(open));
      if (!opts.static) (open ? bar.querySelector("button") : patch).focus({ preventScroll: true });
    }

    function openSheet() {
      if (typeof sheet.showModal === "function" && !opts.static) sheet.showModal();
      else sheet.setAttribute("open", "");
    }

    if (!opts.static) {
      flow.addEventListener("input", onEdit);
      document.addEventListener("selectionchange", () => {
        if (!flow.contains(window.getSelection().anchorNode)) return;
        const p = caretPage();
        if (p !== current) turn(p);
        dim();
      });
      ep.addEventListener("keydown", (e) => {
        if (e.target.closest(".ep-sheet") || ep.dataset.view === "library") return;
        const meta = e.metaKey || e.ctrlKey;
        if (e.key === "Escape" && ep.classList.contains("is-open")) { setOpen(false); return; }
        if (e.key === "PageDown" || (e.altKey && e.key === "ArrowRight")) { e.preventDefault(); turn(current + 1); return; }
        if (e.key === "PageUp" || (e.altKey && e.key === "ArrowLeft")) { e.preventDefault(); turn(current - 1); return; }
        if (meta && e.key === ",") { e.preventDefault(); openSheet(); return; }
        if (e.target.closest(".ep-flow") && !meta && e.key.length === 1) {
          ep.classList.add("is-writing");
          if (ep.classList.contains("is-open")) ep.classList.remove("is-open");
        }
      });
      ep.addEventListener("pointermove", (e) => {
        if (e.pointerType === "mouse" && Math.abs(e.movementX) + Math.abs(e.movementY) > 3) ep.classList.remove("is-writing");
      });
      let start = null;
      page.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") start = { x: e.clientX, y: e.clientY }; });
      page.addEventListener("pointerup", (e) => {
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        start = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) turn(current + (dx < 0 ? 1 : -1));
      });
      patch.addEventListener("click", () => setOpen(true));
      bar.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        const act = b.dataset.act;
        if (act === "close") setOpen(false);
        else if (act === "type") openSheet();
        else if (act === "theme") { settings.mode = isNight() ? "paper" : "night"; applySettings(); persist(); }
      });
      backBtn.addEventListener("click", showLibrary);
      library.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.id) openPiece(pieces.find((p) => p.id === b.dataset.id));
        else if (b.dataset.act === "new") {
          const p = { id: uid(), title: "", html: "", updated: Date.now() };
          pieces.unshift(p);
          openPiece(p);
        }
      });
      sheet.addEventListener("click", (e) => {
        if (e.target === sheet) { sheet.close(); return; }
        const b = e.target.closest("button");
        if (!b) return;
        const d = b.dataset;
        if (d.size) settings.size = d.size;
        else if (d.leading) settings.leading = d.leading;
        else if (d.align) settings.align = d.align;
        else if (d.measure) settings.measure = d.measure;
        else if (d.mode) settings.mode = d.mode;
        else if (d.act === "dropcap") settings.dropcap = !settings.dropcap;
        else if (d.act === "done") { sheet.close(); return; }
        applySettings();
        requestAnimationFrame(() => { reflow(); persist(); });
      });
      dark.addEventListener("change", applySettings);
      new ResizeObserver(reflow).observe(page);
      if (window.visualViewport && opts.fitKeyboard) {
        const fit = () => { root.style.height = `${window.visualViewport.height}px`; };
        window.visualViewport.addEventListener("resize", fit);
        fit();
      }
    }

    if (opts.keyboard) mountKeyboard();
    applySettings();
    renderLibrary();
    showView(opts.view || (opts.persist ? "library" : "page"));

    return document.fonts.ready.then(() => {
      count();
      if (opts.page) current = Math.min(opts.page, total - 1);
      else if (opts.static) freeze();
      render();
      if (opts.open) setOpen(true);
      if (opts.sheet) openSheet();
      if (opts.writing) ep.classList.add("is-writing");
      if (opts.caret) placeCaret();
      if (opts.select) showSelection(opts.select);
      return ep;
    });

    // For still frames: keep only what page one shows, then drop the columns,
    // so a design tool importing the frame sees plain blocks of text.
    function freeze() {
      frozenWords = words();
      const end = flow.getBoundingClientRect().left + page.clientWidth + 1;
      for (const block of [...body.children]) {
        const rects = [...block.getClientRects()];
        if (rects.length && rects[0].left >= end) { block.remove(); continue; }
        const target = block.matches("blockquote") ? block.querySelector("p") : block;
        let guard = 400;
        while (guard-- && [...block.getClientRects()].some((r) => r.right > end)) {
          target.textContent = target.textContent.replace(/\s*\S+\s*$/, "");
        }
      }
      flow.style.columns = "auto";
      if (opts.dimUntil) [...body.children].slice(0, opts.dimUntil).forEach((p) => p.classList.add("is-past"));
    }

    // Still frames only: a caret at the end of the last line, as if mid-sentence.
    function placeCaret() {
      const last = body.lastElementChild;
      if (!last) return;
      const target = last.matches("blockquote") ? last.querySelector("p") : last;
      target.textContent = target.textContent.replace(/[.,;:]?\s*$/, "");
      target.insertAdjacentHTML("beforeend", '<span class="ep-caret" aria-hidden="true"></span>');
    }

    // Still frames only: a selected phrase and the menu that appears on it.
    function showSelection({ block = 0, from, to }) {
      const p = body.children[block];
      if (!p) return;
      const text = p.textContent;
      const i = text.indexOf(from);
      const j = text.indexOf(to, i) + to.length;
      if (i < 0 || j < i) return;
      p.innerHTML = `${esc(text.slice(0, i))}<mark class="ep-sel">${esc(text.slice(i, j))}</mark>${esc(text.slice(j))}`;
      const mark = p.querySelector(".ep-sel");
      const menu = document.createElement("div");
      menu.className = "ep-selmenu";
      menu.setAttribute("role", "toolbar");
      menu.setAttribute("aria-label", "Selection");
      menu.innerHTML = `
        <button type="button" class="icon" aria-label="Bold"><span class="glyph b">B</span></button>
        <button type="button" class="icon" aria-label="Italic"><span class="glyph i">I</span></button>
        <button type="button" class="icon" aria-label="Pull quote">${ICON.quote}</button>
        <span class="bar-sep" aria-hidden="true"></span>
        <button type="button" class="icon" aria-label="Keep this moment">${ICON.keep}</button>`;
      ep.appendChild(menu);
      const er = ep.getBoundingClientRect();
      const mr = mark.getClientRects()[0];
      const w = menu.offsetWidth;
      const x = Math.min(Math.max(mr.left - er.left, 12), er.width - w - 12);
      menu.style.left = `${x}px`;
      menu.style.top = `${mr.top - er.top - menu.offsetHeight - 14}px`;
    }

    // Still frames only: an iOS-like keyboard with a writing bar above it.
    function mountKeyboard() {
      ep.classList.add("has-keyboard");
      const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
      const key = (k) => `<span class="k">${k}</span>`;
      const kb = document.createElement("div");
      kb.className = "ep-kb";
      kb.setAttribute("aria-hidden", "true");
      kb.innerHTML = `
        <div class="kb-suggest"><span>the</span><span>there</span><span>then</span></div>
        <div class="kb-row">${[...rows[0]].map(key).join("")}</div>
        <div class="kb-row r2">${[...rows[1]].map(key).join("")}</div>
        <div class="kb-row"><span class="k mod">⇧</span>${[...rows[2]].map(key).join("")}<span class="k mod">⌫</span></div>
        <div class="kb-row last"><span class="k mod">123</span><span class="k mod">☺</span><span class="k space">space</span><span class="k mod ret">return</span></div>
        <div class="kb-home"></div>`;
      ep.appendChild(kb);
      const tools = document.createElement("div");
      tools.className = "ep-writebar";
      tools.setAttribute("role", "toolbar");
      tools.setAttribute("aria-label", "Writing");
      tools.innerHTML = `
        <button type="button" class="icon" aria-label="Bold"><span class="glyph b">B</span></button>
        <button type="button" class="icon" aria-label="Italic"><span class="glyph i">I</span></button>
        <button type="button" class="icon" aria-label="Pull quote">${ICON.quote}</button>
        <span class="bar-sep" aria-hidden="true"></span>
        <button type="button" class="icon" aria-label="Hide keyboard">${ICON.keyboard}</button>`;
      ep.appendChild(tools);
    }
  };
})();
