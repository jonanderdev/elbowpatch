import { expect, type Page, test } from '@playwright/test'
import { openTools, saved, write } from './helpers'

const PARAGRAPH =
  'Nobody remembers the first draft. It is written in a hurry, at the kitchen table or on the train, and it is mostly a list of things the writer hopes to say.'

async function newEssay(page: Page, title = 'The second draft') {
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await expect(page.locator('.body')).toBeFocused()
}

async function fill(page: Page, paragraphs: number) {
  for (let i = 0; i < paragraphs; i++) {
    await page.keyboard.insertText(`${i + 1}. ${PARAGRAPH} ${PARAGRAPH}`)
    await page.keyboard.press('Enter')
  }
}

const pageLabel = (page: Page) => page.locator('.page-button').getAttribute('aria-label')
/** The page shown, from the page button's label: it is there on every page, the folio is not (and on desktop only hidden). */
const pageNow = async (page: Page) => Number((await pageLabel(page))?.match(/^Page (\d+) of/)?.[1])
const onPage = (page: Page, n: string | number) => expect(page.locator('.page-button')).toHaveAttribute('aria-label', new RegExp(`^Page ${n} of `))

test('what is typed is there after a reload', async ({ page }) => {
  await newEssay(page)
  await page.keyboard.type('Some *italic* and **bold** words.')
  await expect(page.locator('.body em')).toHaveText('italic')
  await expect(page.locator('.body strong')).toHaveText('bold')
  await saved(page, '**bold**')
  await page.reload()
  await expect(page.locator('.title')).toHaveText('The second draft')
  await expect(page.locator('.body em')).toHaveText('italic')
  await expect(page.locator('.body strong')).toHaveText('bold')
})

test('leaving the page saves at once', async ({ page }) => {
  await newEssay(page)
  await page.keyboard.type('Written just before leaving.')
  await page.locator('.head .home').click()
  await expect(page.locator('.continue')).toContainText('Written just before leaving.')
  await page.reload()
  await page.goto('./#/')
  await expect(page.locator('.continue')).toContainText('Written just before leaving.')
})

test('a long text pages instead of scrolling, and the caret stays in view', async ({ page }) => {
  await newEssay(page)
  await fill(page, 8)
  await page.keyboard.type('The last line.')
  const label = await pageLabel(page)
  const [, current, total] = label!.match(/Page (\d+) of (\d+)/)!.map(Number)
  expect(total).toBeGreaterThan(1)
  expect(current).toBe(total) // typing at the end shows the last page

  // The caret's line is on screen, inside the text column.
  const caret = await page.evaluate(() => {
    const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
    const col = document.querySelector('.pager')!.getBoundingClientRect()
    return r.left >= col.left - 1 && r.right <= col.right + 1 && r.top >= col.top - 1 && r.bottom <= col.bottom + 1
  })
  expect(caret).toBe(true)

  await page.keyboard.press('PageUp')
  await onPage(page, String(current! - 1))
  await page.keyboard.press('PageDown')
  await onPage(page, String(current))

  // Nothing scrolls vertically: the page is what fits the screen.
  const scrolls = await page.evaluate(() => document.querySelector('.pager')!.scrollTop)
  expect(scrolls).toBe(0)
})

test('the title opens page 1 and becomes the running head after it', async ({ page }) => {
  await newEssay(page)
  await fill(page, 8)
  await expect(page.locator('.running-head')).toHaveText('The second draft')
  for (let i = 0; i < 10; i++) await page.keyboard.press('PageUp')
  await onPage(page, '1')
  await expect(page.locator('.running-head')).toHaveCount(0)
  await expect(page.locator('.title')).toBeInViewport()
})

test('when a save fails the words stay, the page says so, and it recovers', async ({ page }) => {
  await newEssay(page)
  await page.keyboard.type('Before.')
  await saved(page, 'Before.')
  await page.evaluate(() => {
    const w = window as unknown as { __tx: unknown }
    w.__tx = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = () => {
      throw new DOMException('The disk is full.', 'QuotaExceededError')
    }
  })
  await page.keyboard.type(' After.')
  await expect(page.getByRole('alert')).toContainText("Can't save right now. Your words are still here.")
  await expect(page.getByRole('button', { name: 'Save a copy' })).toBeVisible()
  await expect(page.locator('.body')).toContainText('Before. After.')
  await page.evaluate(() => {
    IDBDatabase.prototype.transaction = (window as unknown as { __tx: typeof IDBDatabase.prototype.transaction }).__tx
  })
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 8000 })
  await page.reload()
  await expect(page.locator('.body')).toContainText('Before. After.')
})

test('paper and night, remembered', async ({ page }) => {
  await newEssay(page)
  await page.keyboard.type('Words.')
  await openTools(page)
  const toggle = page.getByRole('button', { name: /^(Night|Paper)$/ })
  const before = await page.evaluate(() => document.documentElement.dataset.theme)
  await toggle.click()
  const after = await page.evaluate(() => document.documentElement.dataset.theme)
  expect(after).not.toBe(before)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', after!)
})

test('text settings change the page live', async ({ page }) => {
  await newEssay(page)
  await fill(page, 14)
  const pagesAt = async () => Number((await pageLabel(page))!.match(/of (\d+)/)![1])
  const medium = await pagesAt()
  await openTools(page)
  await page.getByRole('button', { name: 'Text settings' }).click()
  await page.getByRole('radio', { name: 'Large' }).click()
  await page.getByRole('radio', { name: 'Loose' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.keyboard.press('Escape')
  await expect.poll(pagesAt).toBeGreaterThan(medium)
})

test('a new piece left empty is not kept', async ({ page }) => {
  await page.goto('./')
  await page.locator('.start.essay').click()
  await page.locator('.head .home').click()
  await expect(page.locator('.empty-library')).toBeVisible()
  await page.reload()
  await page.goto('./#/')
  await expect(page.locator('.empty-library')).toBeVisible()
})

test('formatting from the selection menu, without Markdown', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones use the writing bar')
  await newEssay(page)
  await page.keyboard.type('Make this word bold, then italic.')
  await page
    .locator('.body p')
    .first()
    .dblclick({ position: { x: 60, y: 10 } })
  const menu = page.getByRole('toolbar', { name: 'Formatting' })
  await expect(menu).toBeVisible()
  await menu.getByRole('button', { name: 'Bold' }).click()
  await expect(page.locator('.body strong')).toHaveCount(1)
  await expect(menu.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
  await menu.getByRole('button', { name: 'Italic' }).click()
  await expect(page.locator('.body strong em, .body em strong')).toHaveCount(1)
  await menu.getByRole('button', { name: 'Pull quote' }).click()
  await expect(page.locator('.body blockquote.pull')).toHaveCount(1)
  // The selection is still there: the menu never took focus from the text.
  expect(await page.evaluate(() => getSelection()!.toString().length)).toBeGreaterThan(0)
  await menu.getByRole('button', { name: 'Keep this moment' }).click()
  await saved(page, '> ')
  await page.reload()
  await expect(page.locator('.body blockquote.pull strong em, .body blockquote.pull em strong')).toHaveCount(1)
})

test('a selection grown back across pages shows where it now ends', async ({ page }) => {
  await newEssay(page)
  await fill(page, 8)
  await page.keyboard.type('The end.')
  expect(await pageNow(page)).toBeGreaterThan(1)
  // Selected to the start: the page turns to it, so nothing selected is out of sight behind the page in view.
  await page.keyboard.press('ControlOrMeta+Shift+ArrowUp')
  expect(await page.evaluate(() => getSelection()!.toString())).toContain('1. Nobody')
  await onPage(page, '1')
})

/** The caret to the text's first letter, on page 1 (again until it holds: the typing may still be settling). */
async function toStart(page: Page) {
  await expect
    .poll(async () => {
      await page.evaluate(() => {
        const r = document.createRange()
        r.setStart(document.querySelector('.body p')!.firstChild!, 0)
        getSelection()!.removeAllRanges()
        getSelection()!.addRange(r)
      })
      return pageNow(page).then(String)
    })
    .toBe('1')
}

test('Alt + Shift + → selects as the system does, and never turns the page', async ({ page }) => {
  await newEssay(page)
  await fill(page, 8)
  await toStart(page)
  await page.keyboard.press('Alt+Shift+ArrowRight')
  await page.keyboard.press('Alt+Shift+ArrowRight')
  await onPage(page, '1')
  // Alone, it still turns.
  await page.keyboard.press('Alt+ArrowRight')
  await onPage(page, '2')
})

test('Shift + ↓ grows a selection on to the next page, and the page turns once with it', async ({ page }) => {
  await newEssay(page)
  await fill(page, 8)
  await toStart(page)
  const seen: number[] = []
  for (let i = 0; i < 80 && !seen.includes(2); i++) {
    await page.keyboard.press('Shift+ArrowDown')
    seen.push(await pageNow(page))
  }
  expect(seen).toContain(2)
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+ArrowDown')
    seen.push(await pageNow(page))
  }
  // Never back to page 1 once on page 2, and the selection still starts at the first letter.
  expect(seen.slice(seen.indexOf(2))).not.toContain(1)
  expect(await page.evaluate(() => getSelection()!.toString())).toMatch(/^1\. Nobody/)
})

test('Shift + Page Down grows a selection to the end of the next page', async ({ page }) => {
  await newEssay(page)
  await fill(page, 8)
  await toStart(page)
  await page.keyboard.press('Shift+PageDown')
  await onPage(page, '2')
  const selected = await page.evaluate(() => getSelection()!.toString())
  expect(selected).toMatch(/^1\. Nobody/)
  // Plain Page Up drops it, as a turn does.
  await page.keyboard.press('PageUp')
  await onPage(page, '1')
  expect(await page.evaluate(() => getSelection()!.isCollapsed)).toBe(true)
  expect(selected.length).toBeGreaterThan(PARAGRAPH.length)
})

test('the caret and the pages move together', async ({ page }) => {
  await newEssay(page)
  await fill(page, 8)
  await page.keyboard.type('The end.')
  const lastPage = await pageNow(page)
  expect(lastPage).toBeGreaterThan(1)

  // Page Up takes the caret along: typing lands where the writer is looking, and stays in view.
  // (A word typed at a line's start may fit on the line before, and the page follows it there.)
  await page.keyboard.press('PageUp')
  await onPage(page, String(lastPage - 1))
  await page.keyboard.type('HERE ')
  const inView = () =>
    page.evaluate(() => {
      const col = document.querySelector('.pager')!.getBoundingClientRect()
      const caret = getSelection()!.getRangeAt(0).getBoundingClientRect()
      const word = [...document.querySelectorAll('.body p')].find((p) => p.textContent!.includes('HERE'))!
      const range = document.createRange()
      const node = [...word.childNodes].find((n) => n.textContent!.includes('HERE'))!
      const at = node.textContent!.indexOf('HERE')
      range.setStart(node, at)
      range.setEnd(node, at + 4)
      const w = range.getBoundingClientRect()
      const inside = (r: DOMRect) => r.left >= col.left - 1 && r.right <= col.right + 1
      return inside(caret) && inside(w)
    })
  expect(await inView()).toBe(true)
  expect(await pageNow(page)).toBeGreaterThanOrEqual(lastPage - 2)

  // Arrow keys walk the caret across a page edge, and the page follows.
  for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowDown')
  await onPage(page, String(lastPage))
  for (let i = 0; i < 80; i++) await page.keyboard.press('ArrowUp')
  await expect.poll(async () => await pageNow(page)).toBeLessThan(lastPage)
})

test('↓ and ↑ walk every line, across pages and back, and the caret is always on the page shown', async ({ page }) => {
  await newEssay(page)
  await fill(page, 6)
  // From the very start of the text (again until it holds: the typing may still be settling).
  await expect
    .poll(async () => {
      await page.evaluate(() => {
        const r = document.createRange()
        r.setStart(document.querySelector('.body p')!.firstChild!, 0)
        getSelection()!.removeAllRanges()
        getSelection()!.addRange(r)
      })
      return pageNow(page).then(String)
    })
    .toBe('1')
  const probe = () =>
    page.evaluate(() => {
      const s = getSelection()!
      const pager = document.querySelector('.pager')!.getBoundingClientRect()
      const range = s.getRangeAt(0).cloneRange()
      const rects = range.getClientRects()
      let r = rects[rects.length - 1] ?? range.getBoundingClientRect()
      if (!r.height) r = (s.focusNode!.nodeType === 1 ? (s.focusNode as Element) : s.focusNode!.parentElement!).getBoundingClientRect()
      return {
        at: `${s.focusNode!.textContent!.slice(0, 3)}${s.focusOffset}`,
        page: Number(
          document
            .querySelector('.page-button')!
            .getAttribute('aria-label')!
            .match(/^Page (\d+)/)![1],
        ),
        top: Math.round(r.top),
        shown: r.left >= pager.left - 2 && r.left <= pager.right + 2 && r.top >= pager.top - 2 && r.bottom <= pager.bottom + 2,
      }
    })
  const pages = new Set<number>()
  for (const key of ['ArrowDown', 'ArrowUp']) {
    let before = await probe()
    for (let i = 0; i < 200; i++) {
      await page.keyboard.press(key)
      const now = await probe()
      expect(now.shown, `${key} ${i}: on the page shown`).toBe(true)
      if (now.at === before.at) break // the end of the text that way
      // A line further that way: lower on the same page, or the next page.
      if (now.page === before.page) expect(key === 'ArrowDown' ? now.top > before.top : now.top < before.top, `${key} ${i}: one line`).toBe(true)
      else expect(now.page - before.page, `${key} ${i}: one page`).toBe(key === 'ArrowDown' ? 1 : -1)
      pages.add(now.page)
      before = now
    }
    // Down to the last page, up to the first letter.
    if (key === 'ArrowDown') expect(await page.locator('.page-button').getAttribute('aria-label')).toBe(`Page ${before.page} of ${before.page}. Open tools`)
    else expect(before.at).toBe('1. 0')
  }
  expect(pages.size).toBeGreaterThan(1)
  // From the right edge, ↓ aims past the ends of shorter lines. It never stops after a line's last
  // space where the line wraps, placed on that line: it is also the next line's start, and Firefox
  // paints it there.
  const first = (await page.locator('.body p').first().boundingBox())!
  await page.mouse.click(first.x + first.width - 2, first.y + 8)
  const atWrap = () =>
    page.evaluate(() => {
      const s = getSelection()!
      const t = s.focusNode!
      const o = s.focusOffset
      if (t.nodeType !== 3 || o === 0 || o >= t.textContent!.length || !/\s/.test(t.textContent![o - 1] ?? '')) return false
      const r = document.createRange()
      r.setStart(t, o - 1)
      r.setEnd(t, o)
      const a = r.getBoundingClientRect()
      r.setStart(t, o)
      r.setEnd(t, o + 1)
      const b = r.getBoundingClientRect()
      if (Math.abs(a.top - b.top) < 4 && Math.abs(a.left - b.left) < 600) return false
      // Where the browser places it: on the line before (a wrap's end), or the next (its start).
      const rects = s.getRangeAt(0).getClientRects()
      const caret = rects[rects.length - 1]
      return !!caret && Math.abs(caret.top - a.top) < 4 && Math.abs(caret.left - a.right) < 8
    })
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('ArrowDown')
    expect(await atWrap(), `↓ ${i} from the right edge`).toBe(false)
  }
  await expect(page.locator('.body')).toBeFocused()
})

test('turning back while writing takes the caret to the end of the text on the page, never into the title', async ({ page }) => {
  await page.goto('./')
  await page.locator('.start.book').click()
  await expect(page.locator('.book-title')).toBeFocused()
  await page.keyboard.type('The Long Winter')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(page.locator('.chapter-opening')).toBeFocused()
  await page.keyboard.type('Salt')
  await page.keyboard.press('Enter')
  await expect(page.locator('.body')).toBeFocused()
  await fill(page, 8)
  const caret = () =>
    page.evaluate(() => {
      const s = getSelection()!
      if (!document.querySelector('.body')!.contains(s.focusNode)) return document.activeElement!.className
      // Where a line wraps the caret's position has two boxes, the line's end and the next one's
      // start; it is drawn at the last.
      const rects = s.getRangeAt(0).getClientRects()
      const r = rects[rects.length - 1] ?? (s.focusNode as Element).parentElement!.getBoundingClientRect()
      const pager = document.querySelector('.pager')!.getBoundingClientRect()
      // The page's text, line by line: the caret is on its last line.
      const lines = [...document.querySelectorAll('.body p')].flatMap((p) => {
        const range = document.createRange()
        range.selectNodeContents(p)
        // (a line's last space may hang past the column's edge)
        return [...range.getClientRects()].filter((q) => q.left >= pager.left - 2 && q.left <= pager.right)
      })
      const last = Math.max(...lines.map((q) => q.bottom))
      const onLast = r.left >= pager.left - 2 && r.left <= pager.right + 2 && r.bottom >= last - 2 && r.top < last
      return onLast ? 'end' : `not at the end, at ${Math.round(r.left)},${Math.round(r.top)} (last line ends ${Math.round(last)})`
    })
  // Back page by page: each time at the end of the page's text; on the title page, in the book's title.
  for (let n = await pageNow(page); n > 1; n--) {
    await page.keyboard.press('PageUp')
    await onPage(page, String(n - 1))
    expect(await caret()).toBe(n - 1 === 1 ? 'book-title' : 'end')
  }
})

test('on desktop a turn always leaves the caret ready to type, even while reading', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 700, 'on a phone a swipe does not raise the keyboard')
  await newEssay(page)
  await fill(page, 10)
  for (const key of ['PageUp', 'PageUp', 'PageDown']) {
    // Reading: the text not focused.
    await page.evaluate(() => (document.activeElement as HTMLElement).blur())
    const before = await pageNow(page)
    await page.keyboard.press(key)
    await onPage(page, String(before + (key === 'PageDown' ? 1 : -1)))
    await expect(page.locator('.body')).toBeFocused()
    // A letter typed at once lands on the page shown, which stays: a full last line must not
    // wrap it on to the next page. Measured from the letter, not the caret, which Firefox gives
    // no box in an empty paragraph.
    await page.keyboard.type('Q')
    await onPage(page, String(before + (key === 'PageDown' ? 1 : -1)))
    const shown = await page.evaluate(() => {
      const s = getSelection()!
      const range = document.createRange()
      // The letter before the caret: in its text node, or the last letter of the node before it.
      let t: Node | undefined = s.focusNode!
      let at = s.focusOffset
      if (t.nodeType !== 3) {
        t = t.childNodes[at - 1]
        at = t?.textContent?.length ?? 0
      }
      if (t?.nodeType !== 3 || at < 1 || t.textContent![at - 1] !== 'Q') return 'no Q before the caret'
      range.setStart(t, at - 1)
      range.setEnd(t, at)
      const r = range.getBoundingClientRect()
      const col = document.querySelector('.pager')!.getBoundingClientRect()
      return r.left >= col.left - 2 && r.right <= col.right + 2 ? 'shown' : `at ${Math.round(r.left)} of ${Math.round(col.left)}-${Math.round(col.right)}`
    })
    expect(shown).toBe('shown')
    await page.keyboard.press('Backspace')
  }
})

test("← and → across a page break never leave the caret where it is painted at the page's top", async ({ page }) => {
  await newEssay(page)
  await fill(page, 10)
  // The caret is wrong when it sits where a page breaks mid-paragraph, after the earlier page's
  // last space, and is drawn on that earlier page: Firefox paints it at the page's top there.
  const atBadBreak = () =>
    page.evaluate(() => {
      const s = getSelection()!
      const t = s.focusNode
      if (t?.nodeType !== 3 || s.focusOffset === 0 || s.focusOffset >= t.textContent!.length) return false
      if (!/\s/.test(t.textContent![s.focusOffset - 1] ?? '')) return false
      const r = document.createRange()
      const page = (x: number) => Math.floor((x - document.querySelector('.flow')!.getBoundingClientRect().left + 40) / innerWidth)
      r.setStart(t, s.focusOffset - 1)
      r.setEnd(t, s.focusOffset)
      const before = page(r.getBoundingClientRect().left)
      r.setStart(t, s.focusOffset)
      r.setEnd(t, s.focusOffset + 1)
      if (before === page(r.getBoundingClientRect().left)) return false
      const rects = s.getRangeAt(0).getClientRects()
      const caret = rects[rects.length - 1]
      return !!caret && page(caret.left) === before
    })
  // To page 2's first letter, from the end of page 1, a letter at a time, and back.
  for (let i = 0; i < 12; i++) await page.keyboard.press('PageUp')
  await onPage(page, '1')
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageUp') // the end of page 1's text
  // The page the letter before the caret is on, counted from the text's first.
  const letterPage = () =>
    page.evaluate(() => {
      const s = getSelection()!
      const r = document.createRange()
      r.setStart(s.focusNode!, Math.max(s.focusOffset - 1, 0))
      r.setEnd(s.focusNode!, s.focusOffset)
      return Math.floor((r.getBoundingClientRect().left - document.querySelector('.flow')!.getBoundingClientRect().left + 40) / innerWidth)
    })
  const start = await letterPage()
  // That end may be a word back, where the last line is full: enough steps to cross either way.
  for (const [key, steps, to] of [
    ['ArrowRight', 12, start + 1],
    ['ArrowLeft', 14, start],
  ] as const) {
    for (let i = 0; i < steps; i++) {
      await page.keyboard.press(key)
      await expect.poll(atBadBreak, { message: `after ${key}` }).toBe(false)
    }
    expect(await letterPage(), `${key} crosses the break`).toBe(to)
  }
})

test('a piece left while writing opens with the caret where it was, ready to type', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 700, 'on a phone the caret waits for a tap')
  await newEssay(page)
  await fill(page, 3)
  // Into the second paragraph's first line, on page 1 (it may run on to the next page), and a word there.
  for (let i = 0; i < 3; i++) await page.keyboard.press('PageUp')
  const first = await page
    .locator('.body p')
    .nth(1)
    .evaluate((p) => p.getClientRects()[0]!.toJSON())
  await page.mouse.click(first.left + 60, first.top + 10)
  await page.keyboard.type('HERE')
  await saved(page, 'HERE')
  await page.locator('.head .home').click()
  await page.locator('.continue').click()
  await expect(page.locator('.body')).toBeFocused()
  await page.keyboard.type('NOW')
  await expect(page.locator('.body p').nth(1)).toContainText('HERENOW')
})

test('→ at the last letter of a page turns to the next, and ← turns back', async ({ page }) => {
  await newEssay(page)
  await fill(page, 8)
  for (let i = 0; i < 6; i++) await page.keyboard.press('PageUp')
  await onPage(page, '1')
  // Walk right until the caret leaves page 1: the page must go with it.
  // Where the caret is drawn: at a soft line break the range has two rects, the line's end
  // and the next line's start; the caret is drawn at the latter.
  const caretInView = () =>
    page.evaluate(() => {
      const rects = getSelection()!.getRangeAt(0).getClientRects()
      const r = rects[rects.length - 1] ?? getSelection()!.getRangeAt(0).getBoundingClientRect()
      const col = document.querySelector('.pager')!.getBoundingClientRect()
      return r.left >= col.left - 1 && r.left <= col.right + 1
    })
  let turned = false
  for (let i = 0; i < 3000 && !turned; i++) {
    await page.keyboard.press('ArrowRight')
    // The page follows on the next frame, once the caret is drawn.
    await expect.poll(caretInView, { timeout: 1000 }).toBe(true)
    if ((await pageNow(page).then(String)) === '2') turned = true
  }
  expect(turned).toBe(true)
  await expect.poll(caretInView).toBe(true)
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
  await onPage(page, '1')
  await expect.poll(caretInView).toBe(true)
})

test('a book opens on its title page; chapter 1 begins on the next', async ({ page }) => {
  await page.goto('./')
  await page.locator('.start.book').click()
  await expect(page.locator('.book-title')).toBeFocused()
  // Both fields say what they are while empty.
  for (const [field, word] of [
    ['.book-title', 'Untitled'],
    ['.subtitle', 'Subtitle'],
  ] as const) {
    const shown = await page.locator(field).evaluate((el) => {
      const before = getComputedStyle(el, '::before')
      return `${before.content.replace(/"/g, '')}|${before.visibility}`
    })
    expect(shown).toBe(`${word}|visible`)
  }
  await onPage(page, '1')
  await expect(page.locator('.book-title')).toBeInViewport()
  await page.keyboard.type('The Long Winter')
  await page.keyboard.press('Enter')
  // The subtitle, under the title.
  await expect(page.locator('.subtitle')).toBeFocused()
  // Typed and deleted, it says what it is again (browsers leave a <br> behind).
  await page.keyboard.type('a no')
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace')
  expect(await page.locator('.subtitle').evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"Subtitle"')
  await page.keyboard.type('a novel in four seasons')
  await page.keyboard.press('Enter')
  await expect(page.locator('.chapter-opening')).toBeFocused()
  await onPage(page, '2')
  // Chapter 1 is on its own page, not under the book's title.
  const [b, c] = await Promise.all([page.locator('.book-title').boundingBox(), page.locator('.chapter-opening').boundingBox()])
  expect(Math.abs(b!.x - c!.x)).toBeGreaterThan(100)
  await page.keyboard.type('Salt on the windows')
  await page.keyboard.press('Enter')
  await page.keyboard.type('The boats came in.')
  // No running head on the title page or the chapter's opening page.
  await expect(page.locator('.running-head')).toHaveCount(0)
  await saved(page, 'The boats came in.')
  await page.locator('.head .home').click()
  // The title page and chapter 1's: the pages as laid out on this kind of screen.
  await expect(page.locator('.row', { hasText: 'The Long Winter' })).toContainText('1 chapter · 2 pages')
  await page.reload()
  await page.goto('./#/')
  await page.locator('.row', { hasText: 'The Long Winter' }).click()
  await expect(page.locator('.book-title')).toHaveText('The Long Winter')
  await expect(page.locator('.subtitle')).toHaveText('a novel in four seasons')
  await expect(page.locator('.chapter-opening')).toHaveText('Salt on the windows')
  // Centred across the page, in its upper third (measured on the title page itself, whichever page is in view).
  const placed = await page.evaluate(() => {
    const tp = document.querySelector('.title-page')!.getBoundingClientRect()
    const t = document.querySelector('.book-title')!
    const r = t.getBoundingClientRect()
    return { centred: getComputedStyle(t).textAlign === 'center' && Math.abs(r.width - tp.width) < 2, top: (r.top - tp.top) / tp.height }
  })
  expect(placed.centred).toBe(true)
  expect(placed.top).toBeGreaterThan(0.1)
  expect(placed.top).toBeLessThan(0.4)
})

test('a journal opens on its title page, named there; the first day begins on the next', async ({ page }) => {
  await page.goto('./')
  await page.locator('.start.journal').click()
  // Called "Journal" until named: selected, so typing names it.
  await expect(page.locator('.book-title')).toBeFocused()
  await expect(page.locator('.book-title')).toHaveText('Journal')
  await page.keyboard.type('Dream journal')
  await page.keyboard.press('Enter')
  await expect(page.locator('.subtitle')).toBeFocused()
  await page.keyboard.press('Enter')
  // The day's date is its title, not a field: Return goes on to the text.
  await expect(page.locator('.body')).toBeFocused()
  await onPage(page, '2')
  await page.keyboard.type('I dreamt of the sea.')
  await saved(page, 'I dreamt of the sea.')
  await page.locator('.head .home').click()
  await expect(page.locator('.row', { hasText: 'Dream journal' })).toBeVisible()
})

test('the folio says the page, and stands aside while the tools bar says it', async ({ page }) => {
  await newEssay(page)
  await page.keyboard.type('Words.')
  await expect(page.locator('.folio')).toHaveText('1')
  await expect(page.getByText('Your tools are here')).toHaveCount(0)
  test.skip(page.viewportSize()!.width >= 700, 'the tools bar is a phone’s')
  await openTools(page)
  await expect(page.locator('.folio')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.folio')).toHaveText('1')
})

test('§ and the tools: text edge on a phone, the head within the frame on desktop', async ({ page }) => {
  await newEssay(page)
  await page.keyboard.type('Words.')
  const width = page.viewportSize()!.width
  const home = (await page.locator('.head .home span').boundingBox())!
  const text = (await page.locator('.pager').boundingBox())!
  if (width < 700) {
    expect(Math.abs(home.x - text.x)).toBeLessThan(3)
    await expect(page.locator('.page-button')).toBeVisible()
    await expect(page.locator('.head-tools')).toBeHidden()
    return
  }
  await expect(page.locator('.page-button')).toBeHidden()
  const tools = page.locator('.head-tools')
  const t = (await tools.boundingBox())!
  const frame = Math.max(0, (width - 2560) / 2)
  expect(Math.abs(home.x - (frame + 20))).toBeLessThan(3)
  // The last icon's box ends 10px in, its ink 18px, as in the Figma frames.
  expect(Math.round(width - (t.x + t.width))).toBe(Math.round(frame + 10))
  // At an iMac 27" (2560 wide) they are at the edges; on anything wider, within the frame.
  for (const w of [2560, 3440]) {
    await page.setViewportSize({ width: w, height: 1200 })
    await page.waitForTimeout(100)
    const h = (await page.locator('.head .home').boundingBox())!
    const b = (await tools.boundingBox())!
    expect(Math.round(b.x + b.width - (h.x + 10))).toBe(2560 - 30)
  }
})

test('scrolling never turns the page', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 700, 'desktop wheel')
  await newEssay(page)
  await fill(page, 12)
  for (let i = 0; i < 12; i++) await page.keyboard.press('PageUp')
  await onPage(page, '1')
  const col = (await page.locator('.pager').boundingBox())!
  await page.mouse.move(col.x + col.width / 2, col.y + 200)
  // Down, up and sideways, short and long.
  for (const [dx, dy] of [
    [0, 40],
    [0, 600],
    [0, -300],
    [300, 0],
    [-300, 0],
  ] as const)
    await page.mouse.wheel(dx, dy)
  await page.waitForTimeout(300)
  await onPage(page, '1')
  expect(await page.locator('.pager').evaluate((el) => el.scrollLeft)).toBe(0)
})

test('a click in the margin turns the page, but not beside the text', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 700, 'desktop margins')
  await newEssay(page)
  await fill(page, 12)
  const before = await pageNow(page)
  const col = (await page.locator('.pager').boundingBox())!
  // On the last page: the pointer shows the way back, and nothing on; a click there is
  // swallowed, leaving the caret where it was.
  const turn = () => page.locator('.page-screen').getAttribute('data-turn')
  await page.mouse.move(col.x + col.width + 200, col.y + 200)
  expect(await turn()).toBe('')
  const caret = await page.evaluate(() => getSelection()!.focusOffset)
  await page.mouse.click(col.x + col.width + 200, col.y + 200)
  await onPage(page, String(before))
  await expect(page.locator('.body')).toBeFocused()
  expect(await page.evaluate(() => getSelection()!.focusOffset)).toBe(caret)
  await page.mouse.move(col.x - 200, col.y + 200)
  expect(await turn()).toBe('back')
  // Just beside the text: nothing turns.
  await page.mouse.click(col.x - 30, col.y + 200)
  await onPage(page, String(before))
  // Well into the margin: back a page.
  await page.mouse.click(col.x - 200, col.y + 200)
  await onPage(page, String(before - 1))
  // A drag in the margin is not a click to turn.
  await page.mouse.move(col.x - 200, col.y + 100)
  await page.mouse.down()
  await page.mouse.move(col.x - 150, col.y + 300)
  await page.mouse.up()
  await onPage(page, String(before - 1))
  // Held down, and moved a hair as a hand does, the arrow stays; let go, it is a click.
  await page.mouse.move(col.x - 200, col.y + 200)
  expect(await turn()).toBe('back')
  await page.mouse.down()
  await page.mouse.move(col.x - 201, col.y + 201)
  expect(await turn()).toBe('back')
  await page.mouse.up()
  await onPage(page, String(before - 2))
})

test('a piece opens straight at the place it was left, with no frame of page 1 first', async ({ page }) => {
  await newEssay(page, 'Long one')
  await fill(page, 12)
  // A last line with words: an empty one is not kept, and could be a page of its own.
  await page.keyboard.type('The end.')
  await saved(page, 'The end.')
  const left = await pageNow(page).then(String)
  expect(Number(left)).toBeGreaterThan(1)
  await page.locator('.head .home').click()
  await write(page, 'Essay')
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('Short one')
  await page.keyboard.press('Enter')
  await page.keyboard.type('A line.')
  await saved(page, 'A line.')
  await page.locator('.head .home').click()
  await expect(page.locator('.page-screen')).toHaveAttribute('aria-hidden', 'true')
  // Every frame from the click on, once the page is in view: the piece and the page shown.
  await page.evaluate(() => {
    const w = window as unknown as { shown: string[] }
    w.shown = []
    const t0 = performance.now()
    const tick = () => {
      if (document.querySelector('.page-screen')?.getAttribute('aria-hidden') === 'false')
        w.shown.push(`${document.querySelector('.title')?.textContent} ${document.querySelector('.folio')?.textContent}`)
      if (performance.now() - t0 < 800) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.locator('.row', { hasText: 'Long one' }).click()
  await page.waitForTimeout(900)
  const shown = await page.evaluate(() => (window as unknown as { shown: string[] }).shown)
  expect(shown.length).toBeGreaterThan(0)
  expect(new Set(shown)).toEqual(new Set([`Long one ${left}`]))
})

test('in a window smaller than the smallest phone the page keeps its size, and the window scrolls', async ({ page }) => {
  await newEssay(page)
  await fill(page, 4)
  await page.setViewportSize({ width: 240, height: 280 })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const screen = document.querySelector('.page-screen')!.getBoundingClientRect()
        const column = document.querySelector('.pager')!.getBoundingClientRect()
        const root = document.scrollingElement!
        return {
          screen: [Math.round(screen.width), Math.round(screen.height)],
          column: Math.round(column.width),
          scrolls: root.scrollWidth > root.clientWidth && root.scrollHeight > root.clientHeight,
        }
      }),
    )
    .toEqual({ screen: [320, 658], column: 256, scrolls: true })
  // And the wheel scrolls it.
  await page.mouse.move(100, 150)
  await page.mouse.wheel(0, 200)
  await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBeGreaterThan(0)
})

test('a desktop window less than 765 tall keeps the page at its least scale, and scrolls', async ({ page }) => {
  await newEssay(page)
  await page.setViewportSize({ width: 1200, height: 500 })
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('.page-screen')!.getBoundingClientRect().height))).toBe(765)
})

test('the page holds the same words at any window size of its kind: only its scale changes', async ({ page }) => {
  await newEssay(page)
  await fill(page, 8)
  await page.keyboard.type('The end.')
  const count = () => page.locator('.page-button').getAttribute('aria-label')
  const first = await count()
  const phone = page.viewportSize()!.width < 700
  for (const size of phone
    ? [
        { width: 375, height: 667 },
        { width: 430, height: 932 },
      ]
    : [
        { width: 1920, height: 1080 },
        { width: 1280, height: 700 },
      ]) {
    await page.setViewportSize(size)
    await expect.poll(count).toBe(first)
  }
})

test('at a normal size nothing scrolls the window, and the library covers the page whole', async ({ page }) => {
  await newEssay(page)
  await fill(page, 2)
  const fits = () =>
    page.evaluate(() => {
      const r = document.scrollingElement!
      return r.scrollHeight <= r.clientHeight && r.scrollWidth <= r.clientWidth
    })
  expect(await fits()).toBe(true)
  // The head's count: on desktop the library draws nothing where it was (its own icons sit further right).
  const head = (await page.locator('.head-tools .count').boundingBox())!
  await page.locator('.head .home').click()
  await expect(page.locator('.library')).toBeVisible()
  expect(await fits()).toBe(true)
  // Nothing of the page shows through: on desktop, where its tools were, the library has
  // only its background. (Checked by pixels: the covered page is inert, so hit-testing skips it.)
  if (page.viewportSize()!.width < 700) return
  await page.waitForTimeout(300)
  const shot = await page.screenshot({ clip: head, animations: 'disabled' })
  const flat = await page.evaluate(async (b64) => {
    const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const c = new OffscreenCanvas(bm.width, bm.height).getContext('2d')!
    c.drawImage(bm, 0, 0)
    const d = c.getImageData(0, 0, bm.width, bm.height).data
    for (let i = 4; i < d.length; i += 4) if (Math.abs(d[i]! - d[0]!) + Math.abs(d[i + 1]! - d[1]!) + Math.abs(d[i + 2]! - d[2]!) > 24) return false
    return true
  }, shot.toString('base64'))
  expect(flat, "the page's tools show through the library").toBe(true)
})

test('in a window smaller than the page, the head stands on its strip and the folio scrolls with the page', async ({ page }) => {
  const width = page.viewportSize()!.width
  await page.setViewportSize({ width, height: width < 700 ? 480 : 640 })
  await newEssay(page)
  await fill(page, 3)
  await expect(page.locator('.head')).not.toHaveAttribute('data-scrolled')
  // The folio sits under the text, at the page's foot, not over it at the window's.
  const text = (await page.locator('.pager').boundingBox())!
  const folio = (await page.locator('.folio').boundingBox())!
  expect(folio.y).toBeGreaterThanOrEqual(text.y + text.height)
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight))
  await expect(page.locator('.head')).toHaveAttribute('data-scrolled')
  // The library scrolls itself: the window under it does not, so there is one scrollbar, not two.
  await page.locator('.head .home').click()
  await expect(page.locator('.library')).toBeVisible()
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= document.scrollingElement!.clientHeight)).toBe(true)
})
