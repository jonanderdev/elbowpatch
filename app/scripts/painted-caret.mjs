// Where is the caret PAINTED? Headless checks read where the browser says the caret is; a browser
// can paint it elsewhere (Firefox did, at a page's top, at a page break). This walks the caret
// through pages and compares, at every step, the caret it paints with the caret it reports.
//
//   node scripts/painted-caret.mjs [chromium|webkit|firefox|all] [width] [height]
//
// Runs against the dev server (npm run dev, port 5173). Chromium and WebKit: two screenshots,
// the caret shown and hidden. Firefox leaves the caret out of its screenshots, so on macOS it
// opens a window and captures it from the screen (Terminal needs Screen Recording permission, and
// the screen must stay awake: run it under caffeinate). Firefox's storage pop-up, which holds the
// focus and hides the page's caret while open, is answered up front.
import { chromium, webkit, firefox } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [which = 'all', w = '1440', h = '900'] = process.argv.slice(2)
const tmp = mkdtempSync(join(tmpdir(), 'caret-'))
const P = 'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. '

// Firefox: the id of its window, found by a unique page title, so a covered window still captures.
let winid = ''
function windowId(title) {
  if (!winid) {
    const src = join(tmp, 'winid.swift')
    writeFileSync(src, 'import CoreGraphics\nimport Foundation\nlet want = CommandLine.arguments[1]\nfor w in CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]] { if let n = w[kCGWindowName as String] as? String, n.contains(want), let id = w[kCGWindowNumber as String] as? Int { print(id); exit(0) } }\nexit(1)\n')
    winid = join(tmp, 'winid')
    execFileSync('swiftc', ['-O', src, '-o', winid], { stdio: 'ignore' })
  }
  return execFileSync(winid, [title]).toString().trim()
}

async function run(engine) {
  const ff = engine === 'firefox'
  const browser = await { chromium, webkit, firefox }[engine].launch(ff ? { headless: false, firefoxUserPrefs: { 'ui.caretBlinkTime': -1, 'dom.storageManager.prompt.testing': true, 'dom.storageManager.prompt.testing.allow': true } } : {})
  const page = await browser.newPage({ viewport: { width: +w, height: +h } })
  const decoder = ff ? null : await browser.newPage()
  let id = ''
  // Two images, the caret shown and made transparent: what differs is the painted caret.
  const diff = async (a, b) =>
    (decoder ?? page).evaluate(async ([a, b]) => {
      const load = async (s) => { const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob()); const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height) }
      const A = await load(a), B = await load(b)
      let x0 = 1e9, y0 = 1e9, y1 = -1
      for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) { const i = (y * A.width + x) * 4; if (Math.abs(A.data[i] - B.data[i]) > 60) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) } }
      return y1 < 0 ? null : { x: x0, y: y0 }
    }, [a, b])
  const painted = async () => {
    if (ff) {
      if (!id) { await page.evaluate(() => (document.title = 'caret-' + Date.now())); await page.waitForTimeout(300); id = windowId(await page.title()) }
      const shot = (n) => { execFileSync('screencapture', ['-x', '-o', `-l${id}`, join(tmp, n)]); return readFileSync(join(tmp, n)).toString('base64') }
      const a = shot('a.png')
      const style = await page.addStyleTag({ content: '* { caret-color: transparent !important }' })
      await page.waitForTimeout(150)
      const b = shot('b.png')
      await style.evaluate((s) => s.remove())
      const d = await diff(a, b)
      const top = await page.evaluate(() => outerHeight - innerHeight)
      return d && { x: Math.round(d.x / 2), y: Math.round(d.y / 2 - top) }
    }
    for (let i = 0; i < 6; i++) {
      const d = await diff((await page.screenshot({ caret: 'initial' })).toString('base64'), (await page.screenshot({ caret: 'hide' })).toString('base64'))
      if (d) return d
      await page.waitForTimeout(200)
    }
    return null
  }
  // Where the browser says the caret is; in an empty line or field, at that element's start.
  const reported = () => page.evaluate(() => {
    const s = getSelection(); if (!s.rangeCount) return null
    const rs = s.getRangeAt(0).getClientRects(); let r = rs[rs.length - 1]
    if (!r || (!r.width && !r.height)) {
      // After an element's last text (a title's end): just after that text's last letter.
      const n = s.focusNode, last = n.nodeType === 1 ? n.childNodes[s.focusOffset - 1] : null
      if (last?.nodeType === 3 && last.length) { const q = document.createRange(); q.setStart(last, last.length - 1); q.setEnd(last, last.length); const b = q.getBoundingClientRect(); r = { left: b.right, top: b.top } }
      else r = (n.nodeType === 1 ? n : n.parentElement).getBoundingClientRect()
    }
    return { x: Math.round(r.left), y: Math.round(r.top), page: document.querySelector('.page-button')?.textContent }
  })

  let checks = 0
  const bad = []
  for (const kind of ['essay', 'book']) {
    await page.goto('http://localhost:5173/#/'); await page.waitForTimeout(800)
    if (await page.locator(`.start.${kind}`).count()) await page.locator(`.start.${kind}`).click()
    else {
      await page.getByRole('button', { name: 'New piece' }).click()
      await page.getByRole('toolbar', { name: 'New piece' }).getByRole('button', { name: kind === 'book' ? 'Book' : 'Essay' }).click()
    }
    await page.waitForTimeout(400)
    if (kind === 'book') { await page.keyboard.type('The Orchid'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter') }
    await page.keyboard.type('The first days'); await page.keyboard.press('Enter')
    for (let i = 0; i < 4; i++) { await page.keyboard.insertText(P.repeat(3) + (i % 2 ? 'sdfde wf2332ef fhhhgd' : '')); await page.keyboard.press('Enter') }
    await page.keyboard.insertText(P)
    await page.waitForTimeout(400)
    // To the end of page 1's text, then each step.
    for (let i = 0; i < 8; i++) await page.keyboard.press('PageUp')
    const steps = ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'PageDown', 'ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp']
    for (const key of steps) {
      await page.keyboard.press(key)
      await page.waitForTimeout(150)
      const [p, r] = [await painted(), await reported()]
      checks++
      if (!p || !r || Math.abs(p.x - r.x) > 8 || Math.abs(p.y - r.y) > 8) bad.push(`${kind} step ${steps.indexOf(key)} ${key}: painted ${JSON.stringify(p)}, reported ${JSON.stringify(r)}`)
    }
  }
  await browser.close()
  console.log(`${engine} ${w}x${h}: ${checks} steps, ${bad.length} painted elsewhere`)
  for (const b of bad) console.log('  ' + b)
  return bad.length
}

let failed = 0
for (const engine of which === 'all' ? ['chromium', 'webkit', 'firefox'] : [which]) failed += await run(engine)
process.exit(failed ? 1 : 0)
