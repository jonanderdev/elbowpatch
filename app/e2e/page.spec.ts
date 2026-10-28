import { expect, test, type Page } from '@playwright/test'
import { saved } from './helpers'

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
  await page.locator('.head .word-button').click()
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
    return r.left >= col.left - 1 && r.right <= col.right + 1 && r.top >= col.top && r.bottom <= col.bottom + 1
  })
  expect(caret).toBe(true)

  await page.keyboard.press('PageUp')
  await expect(page.locator('.page-button')).toHaveText(String(current! - 1))
  await page.keyboard.press('PageDown')
  await expect(page.locator('.page-button')).toHaveText(String(current))

  // Nothing scrolls vertically: the page is what fits the screen.
  const scrolls = await page.evaluate(() => document.querySelector('.pager')!.scrollTop)
  expect(scrolls).toBe(0)
})

test('the title opens page 1 and becomes the running head after it', async ({ page }) => {
  await newEssay(page)
  await fill(page, 8)
  await expect(page.locator('.running-head')).toHaveText('The second draft')
  for (let i = 0; i < 10; i++) await page.keyboard.press('PageUp')
  await expect(page.locator('.page-button')).toHaveText('1')
  await expect(page.locator('.running-head')).toHaveCount(0)
  await expect(page.locator('.title')).toBeInViewport()
})

test("when a save fails the words stay, the page says so, and it recovers", async ({ page }) => {
  await newEssay(page)
  await page.keyboard.type('Before.')
  await saved(page, 'Before.')
  await page.evaluate(() => {
    const w = window as unknown as { __tx: unknown }
    w.__tx = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function () {
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
  await page.locator('.page-button').click()
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
  await page.locator('.page-button').click()
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
  await page.locator('.head .word-button').click()
  await expect(page.locator('.empty-library')).toBeVisible()
  await page.reload()
  await page.goto('./#/')
  await expect(page.locator('.empty-library')).toBeVisible()
})

test('formatting from the selection menu, without Markdown', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones use the writing bar')
  await newEssay(page)
  await page.keyboard.type('Make this word bold, then italic.')
  await page.locator('.body p').first().dblclick({ position: { x: 60, y: 10 } })
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

test('the caret and the pages move together', async ({ page }) => {
  await newEssay(page)
  await fill(page, 8)
  await page.keyboard.type('The end.')
  const lastPage = Number(await page.locator('.page-button').textContent())
  expect(lastPage).toBeGreaterThan(1)

  // Page Up takes the caret along: typing lands where the writer is looking, and stays in view.
  // (A word typed at a line's start may fit on the line before, and the page follows it there.)
  await page.keyboard.press('PageUp')
  await expect(page.locator('.page-button')).toHaveText(String(lastPage - 1))
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
  expect(Number(await page.locator('.page-button').textContent())).toBeGreaterThanOrEqual(lastPage - 2)

  // Arrow keys walk the caret across a page edge, and the page follows.
  for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowDown')
  await expect(page.locator('.page-button')).toHaveText(String(lastPage))
  for (let i = 0; i < 80; i++) await page.keyboard.press('ArrowUp')
  await expect.poll(async () => Number(await page.locator('.page-button').textContent())).toBeLessThan(lastPage)
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
      return page.locator('.page-button').textContent()
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
        page: Number(document.querySelector('.page-button')!.textContent),
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
  await expect(page.locator('.body')).toBeFocused()
})

test('turning back while writing takes the caret to the first line of text, never into the title', async ({ page }) => {
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
      const text = [...document.querySelectorAll('.body p')].flatMap((p) => [...p.getClientRects()])
      const onText = text.some((q) => q.left >= pager.left - 2 && q.right <= pager.right + 2 && r.top >= q.top - 2 && r.bottom <= q.bottom + 2)
      return onText ? 'text' : `off the text at ${Math.round(r.left)},${Math.round(r.top)}`
    })
  // Back page by page: each time on the page's text; on the title page, in the book's title.
  for (let n = Number(await page.locator('.page-button').textContent()); n > 1; n--) {
    await page.keyboard.press('PageUp')
    await expect(page.locator('.page-button')).toHaveText(String(n - 1))
    expect(await caret()).toBe(n - 1 === 1 ? 'book-title' : 'text')
  }
})

test('a piece left while writing opens with the caret where it was, ready to type', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 700, 'on a phone the caret waits for a tap')
  await newEssay(page)
  await fill(page, 3)
  // Into the middle of the second paragraph, and a word there.
  await page.locator('.body p').nth(1).click()
  await page.keyboard.type('HERE')
  await saved(page, 'HERE')
  await page.locator('.head .word-button').click()
  await page.locator('.continue').click()
  await expect(page.locator('.body')).toBeFocused()
  await page.keyboard.type('NOW')
  await expect(page.locator('.body p').nth(1)).toContainText('HERENOW')
})

test('→ at the last letter of a page turns to the next, and ← turns back', async ({ page }) => {
  await newEssay(page)
  await fill(page, 8)
  for (let i = 0; i < 6; i++) await page.keyboard.press('PageUp')
  await expect(page.locator('.page-button')).toHaveText('1')
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
    if ((await page.locator('.page-button').textContent()) === '2') turned = true
  }
  expect(turned).toBe(true)
  await expect.poll(caretInView).toBe(true)
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.page-button')).toHaveText('1')
  await expect.poll(caretInView).toBe(true)
})

test('a book opens on its title page; chapter 1 begins on the next', async ({ page }) => {
  await page.goto('./')
  await page.locator('.start.book').click()
  await expect(page.locator('.book-title')).toBeFocused()
  // Both fields say what they are while empty.
  for (const [field, word] of [['.book-title', 'Untitled'], ['.subtitle', 'Subtitle']] as const) {
    const shown = await page.locator(field).evaluate((el) => {
      const before = getComputedStyle(el, '::before')
      return before.content.replace(/"/g, '') + '|' + before.visibility
    })
    expect(shown).toBe(`${word}|visible`)
  }
  await expect(page.locator('.page-button')).toHaveText('1')
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
  await expect(page.locator('.page-button')).toHaveText('2')
  // Chapter 1 is on its own page, not under the book's title.
  const [b, c] = await Promise.all([page.locator('.book-title').boundingBox(), page.locator('.chapter-opening').boundingBox()])
  expect(Math.abs(b!.x - c!.x)).toBeGreaterThan(100)
  await page.keyboard.type('Salt on the windows')
  await page.keyboard.press('Enter')
  await page.keyboard.type('The boats came in.')
  // No running head on the title page or the chapter's opening page.
  await expect(page.locator('.running-head')).toHaveCount(0)
  await saved(page, 'The boats came in.')
  await page.locator('.head .word-button').click()
  await expect(page.locator('.row', { hasText: 'The Long Winter' })).toContainText('1 chapter')
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
  await expect(page.locator('.page-button')).toHaveText('2')
  await page.keyboard.type('I dreamt of the sea.')
  await saved(page, 'I dreamt of the sea.')
  await page.locator('.head .word-button').click()
  await expect(page.locator('.row', { hasText: 'Dream journal' })).toBeVisible()
})

test('"Your tools are here" until the tools are first opened, then never again', async ({ page }) => {
  await newEssay(page)
  await page.keyboard.type('Words.')
  const wayIn = page.getByText('Your tools are here')
  await expect(wayIn).toBeVisible()
  await page.locator('.page-button').click()
  await expect(wayIn).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(wayIn).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.page-button')).toBeVisible()
  await expect(wayIn).toHaveCount(0)
})

test('Library and the page button: text edge on a phone, frame corners on desktop', async ({ page, isMobile }) => {
  await newEssay(page)
  await page.keyboard.type('Words.')
  const width = page.viewportSize()!.width
  const library = (await page.locator('.head .word-button .word').boundingBox())!
  const button = (await page.locator('.page-button').boundingBox())!
  const text = (await page.locator('.pager').boundingBox())!
  if (width < 700) {
    expect(Math.round(library.x)).toBe(Math.round(text.x))
  } else {
    const frame = Math.max(0, (width - 2560) / 2)
    expect(Math.round(library.x)).toBe(Math.round(frame + 20))
    expect(Math.round(width - (button.x + button.width))).toBe(Math.round(frame + 20))
  }
  // At an iMac 27" (2560 wide) they are at the edges; on anything wider, within the frame.
  for (const [w, apart] of [[2560, 2560 - 40], [3440, 2560 - 40]] as const) {
    await page.setViewportSize({ width: w, height: 1200 })
    await page.waitForTimeout(100)
    const l = (await page.locator('.head .word-button .word').boundingBox())!
    const b = (await page.locator('.page-button').boundingBox())!
    expect(Math.round(b.x + b.width - l.x)).toBe(apart)
  }
})

test('a click in the margin turns the page, but not beside the text', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 700, 'desktop margins')
  await newEssay(page)
  await fill(page, 12)
  const before = Number(await page.locator('.page-button').textContent())
  const col = (await page.locator('.pager').boundingBox())!
  // On the last page: the pointer shows the way back, and nothing on; a click there is
  // swallowed, leaving the caret where it was.
  const turn = () => page.locator('.page-screen').getAttribute('data-turn')
  await page.mouse.move(col.x + col.width + 200, col.y + 200)
  expect(await turn()).toBe('')
  const caret = await page.evaluate(() => getSelection()!.focusOffset)
  await page.mouse.click(col.x + col.width + 200, col.y + 200)
  await expect(page.locator('.page-button')).toHaveText(String(before))
  await expect(page.locator('.body')).toBeFocused()
  expect(await page.evaluate(() => getSelection()!.focusOffset)).toBe(caret)
  await page.mouse.move(col.x - 200, col.y + 200)
  expect(await turn()).toBe('back')
  // Just beside the text: nothing turns.
  await page.mouse.click(col.x - 30, col.y + 200)
  await expect(page.locator('.page-button')).toHaveText(String(before))
  // Well into the margin: back a page.
  await page.mouse.click(col.x - 200, col.y + 200)
  await expect(page.locator('.page-button')).toHaveText(String(before - 1))
  // A drag in the margin is not a click to turn.
  await page.mouse.move(col.x - 200, col.y + 100)
  await page.mouse.down()
  await page.mouse.move(col.x - 150, col.y + 300)
  await page.mouse.up()
  await expect(page.locator('.page-button')).toHaveText(String(before - 1))
})

test('a piece opens straight at the place it was left, with no frame of page 1 first', async ({ page }) => {
  await newEssay(page, 'Long one')
  await fill(page, 12)
  await saved(page, PARAGRAPH.slice(0, 20))
  const left = await page.locator('.page-button').textContent()
  expect(Number(left)).toBeGreaterThan(1)
  await page.locator('.head .word-button').click()
  await page.getByRole('button', { name: 'New piece' }).click()
  await page.getByRole('toolbar', { name: 'New piece' }).getByRole('button', { name: 'Essay' }).click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('Short one')
  await page.keyboard.press('Enter')
  await page.keyboard.type('A line.')
  await saved(page, 'A line.')
  await page.locator('.head .word-button').click()
  await expect(page.locator('.page-screen')).toHaveAttribute('aria-hidden', 'true')
  // Every frame from the click on, once the page is in view: the piece and the page shown.
  await page.evaluate(() => {
    const w = window as unknown as { shown: string[] }
    w.shown = []
    const t0 = performance.now()
    const tick = () => {
      if (document.querySelector('.page-screen')?.getAttribute('aria-hidden') === 'false')
        w.shown.push(`${document.querySelector('.title')?.textContent} ${document.querySelector('.page-button')?.textContent}`)
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
