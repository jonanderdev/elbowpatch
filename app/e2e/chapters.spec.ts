import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, saved } from './helpers'

// Contents: a sheet on a phone (#55), the rail on desktop (#57).
const onDesktop = (page: Page) => page.viewportSize()!.width >= 700
/** A flow that is the phone's alone: the running head, the sheet, the keyboard. */
const phoneOnly = (page: Page) => test.skip(onDesktop(page), 'on desktop Contents is the rail')
const desktopOnly = (page: Page) => test.skip(!onDesktop(page), 'the rail is on desktop')

const PARAGRAPH =
  'The windows of the shop had been salted white by the first storm of November, and Ana scraped a small square clear each morning before she unlocked the door.'
const long = (paragraphs: number) => Array.from({ length: paragraphs }, (_, i) => `${i + 1}. ${PARAGRAPH}`).join('\n\n')

/** The name an imported book takes from its file. */
const BOOK = 'harbour'

const TWO = '# One\n\nFirst chapter.\n\n# Two\n\nSecond.\n'
/** Long enough that each chapter has later pages, and with them a running head. */
const THREE = `# One\n\n${long(12)}\n\n# Two\n\n${long(12)}\n\n# Three\n\nThe end.\n`

/** Nothing is measured off screen, so only the chapters opened have a count. */
const measureNothing = (page: Page) =>
  page.addInitScript(() => {
    window.requestIdleCallback = () => 0
  })

/** Imports a Markdown file as a book and opens it. */
async function importBook(page: Page, markdown: string) {
  await page.goto('./#/settings/export')
  await page.locator('input[type=file]').evaluate((el: HTMLInputElement, text) => {
    const files = new DataTransfer()
    files.items.add(new File([text], 'harbour.md', { type: 'text/markdown' }))
    el.files = files.files
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, markdown)
  const sheet = page.getByRole('dialog', { name: 'Import' })
  await sheet.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByText('1 piece added.')).toBeVisible()
  await page.goto('./#/')
  await page.locator('.row', { hasText: 'harbour' }).click()
  await expect(page.locator('.book-title')).toHaveText('harbour')
}

/** The caret at the end of the open chapter, once this window is the one writing. */
async function writeHere(page: Page) {
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await caretToEnd(page)
}

const contents = (page: Page) => (onDesktop(page) ? page.getByRole('navigation', { name: 'Contents' }) : page.getByRole('dialog', { name: 'Contents' }))
/** A chapter's row, by its title: its name for a screen reader also carries its start page. */
const chapter = (page: Page, name: string) =>
  contents(page)
    .locator('.contents-row')
    .filter({ has: page.locator('.contents-title', { hasText: new RegExp(`^${name}$`) }) })
const runningHead = (page: Page) => page.locator('.running-control')
const rows = (page: Page) => contents(page).locator('.contents-row')
/** The book's pages, as Contents says them. */
const total = (page: Page) => contents(page).locator('.contents-pages')

/** On a phone, from a page with no running head: the page button, then the count. On desktop the rail is open. */
async function contentsFromCount(page: Page) {
  if (onDesktop(page)) return expect(contents(page)).toBeVisible()
  await page.locator('.page-button').click()
  await page.locator('.tools .count').click()
  await expect(contents(page)).toBeVisible()
}

/** Chooses a chapter, from any page, and waits for it to open. */
async function openChapter(page: Page, name: string) {
  await contentsFromCount(page)
  await chapter(page, name).click()
  await expect(page.locator('.title')).toHaveText(name)
}

/** The writer's place as stored: which chapter's title it is in. */
const placeIn = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | undefined>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const db = open.result
          const all = db.transaction('pieces').objectStore('pieces').getAll()
          all.onsuccess = () => {
            db.close()
            const piece = (all.result as { place?: { sectionId: string }; sections: { sectionId: string; title: string }[] }[])[0]
            done(piece?.sections.find((s) => s.sectionId === piece.place?.sectionId)?.title)
          }
        }
      }),
  )

test("an imported book's second chapter opens from Contents", async ({ page }) => {
  await importBook(page, TWO)
  await contentsFromCount(page)
  await chapter(page, 'Two').click()
  await expect(page.locator('.title')).toHaveText('Two')
  await expect(page.locator('.body')).toHaveText('Second.')
  await expect(page.locator('.title')).toBeInViewport()
  // The sheet closes behind it; the rail stays, on the chapter just opened.
  if (onDesktop(page)) await expect(chapter(page, 'Two')).toHaveAttribute('aria-current', 'true')
  else await expect(contents(page)).toHaveCount(0)
})

test('the running head carries ⌄ and opens Contents; pressed again, or pressed outside, it closes', async ({ page }) => {
  phoneOnly(page)
  await importBook(page, THREE)
  await openChapter(page, 'Two')
  // A chapter's opening page carries its title: the head names the book, and still opens Contents.
  await expect(runningHead(page)).toContainText(BOOK)
  await runningHead(page).click()
  await expect(contents(page).locator('.contents-name')).toHaveText(BOOK)
  await runningHead(page).click()
  await expect(contents(page)).toHaveCount(0)
  await page.keyboard.press('PageDown')
  await expect(runningHead(page)).toContainText('Two')
  await expect(runningHead(page).locator('.icon')).toBeVisible()

  await runningHead(page).click()
  await expect(contents(page)).toBeVisible()
  await expect(runningHead(page)).toHaveAttribute('aria-expanded', 'true')
  await runningHead(page).click()
  await expect(contents(page)).toHaveCount(0)

  await runningHead(page).click()
  await expect(contents(page)).toBeVisible()
  await page.mouse.click(195, 780)
  await expect(contents(page)).toHaveCount(0)

  await runningHead(page).click()
  await contents(page).getByRole('button', { name: 'Done' }).click()
  await expect(contents(page)).toHaveCount(0)
})

test('a chapter opens at its opening page, the one on screen too', async ({ page }) => {
  phoneOnly(page)
  await importBook(page, THREE)
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await runningHead(page).click()
  await chapter(page, 'One').click()
  await expect(contents(page)).toHaveCount(0)
  await expect(page.locator('.title')).toBeInViewport()
  await expect(runningHead(page)).toContainText(BOOK)
  // The second page of the section: a title page stands before chapter 1.
  await expect(page.locator('.page-button')).toHaveAttribute('aria-label', /^Page 2 of /)
  // The title page shows the book's name already, large: it has no running head.
  await page.keyboard.press('PageUp')
  await expect(page.locator('.page-button')).toHaveAttribute('aria-label', /^Page 1 of /)
  await expect(runningHead(page)).toHaveCount(0)
})

test('the running head’s arrow points down when Contents is closed, up while it is open, and tapped again it closes', async ({ page }) => {
  phoneOnly(page)
  await importBook(page, THREE)
  await openChapter(page, 'Two')
  await page.keyboard.press('PageDown')
  await expect(runningHead(page)).toContainText('Two')
  const arrow = () =>
    runningHead(page)
      .locator('.icon')
      .evaluate((el) => (getComputedStyle(el).transform === 'none' ? 'down' : 'up'))
  expect(await arrow()).toBe('down')
  await runningHead(page).click()
  await expect(contents(page)).toBeVisible()
  expect(await arrow()).toBe('up')
  await runningHead(page).click()
  await expect(contents(page)).toHaveCount(0)
  expect(await arrow()).toBe('down')
})

test('Contents lists each chapter, says Untitled for one with no title, and marks the current one', async ({ page }) => {
  await importBook(page, 'Before any heading.\n\n# Two\n\nSecond.\n\n# Three\n\nThird.\n')
  await contentsFromCount(page)
  await expect(rows(page).locator('.contents-title')).toHaveText(['Untitled', 'Two', 'Three'])
  await expect(rows(page).nth(0)).toHaveAttribute('aria-current', 'true')
  await expect(rows(page).nth(1)).not.toHaveAttribute('aria-current')
  const tint = (n: number) =>
    rows(page)
      .nth(n)
      .evaluate((el) => getComputedStyle(el).backgroundColor)
  await expect.poll(() => tint(0)).toBe('rgb(233, 233, 229)')
  await chapter(page, 'Three').click()
  await expect(page.locator('.title')).toHaveText('Three')
  await contentsFromCount(page)
  await expect(rows(page).nth(2)).toHaveAttribute('aria-current', 'true')
})

test('start pages and the total show only once they are known; nothing is guessed', async ({ page }) => {
  await measureNothing(page)
  await importBook(page, THREE)
  await contentsFromCount(page)
  const pages = rows(page).locator('.contents-page')
  // Only chapter 1 has been laid out: chapter 2's start is known, chapter 3's is not, nor the total.
  await expect(pages).toHaveCount(2)
  await expect(pages.nth(0)).toHaveText('1')
  await expect(total(page)).toHaveCount(0)
  const second = Number(await pages.nth(1).textContent())
  expect(second).toBeGreaterThan(2)

  await chapter(page, 'Two').click()
  await expect(page.locator('.title')).toHaveText('Two')
  await openChapter(page, 'Three')
  await contentsFromCount(page)
  await expect(pages).toHaveCount(3)
  const third = Number(await pages.nth(2).textContent())
  expect(third).toBeGreaterThan(second)
  // Chapter 3 is one page.
  await expect(total(page)).toHaveText(`${third} pages`)
})

test('Contents works by keyboard, Escape gives the focus back, and a screen reader hears the current chapter', async ({ page }) => {
  phoneOnly(page)
  await importBook(page, THREE)
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await runningHead(page).focus()
  await page.keyboard.press('Enter')
  await expect(contents(page)).toBeVisible()
  await expect(rows(page).nth(0)).toBeFocused()
  await expect(chapter(page, 'One')).toHaveAttribute('aria-current', 'true')

  await page.keyboard.press('Escape')
  await expect(contents(page)).toHaveCount(0)
  await expect(runningHead(page)).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(rows(page).nth(0)).toBeFocused()
  await rows(page).nth(1).focus()
  const start = Number(await rows(page).nth(1).locator('.contents-page').textContent())
  await page.keyboard.press('Enter')
  await expect(page.locator('.title')).toHaveText('Two')
  // The focus is not left on nothing, and the chapter is said.
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
  await expect(page.locator('.chapter-said')).toHaveText('Two')
  // And a turn after it is still said.
  await page.keyboard.press('PageDown')
  await expect(page.locator('.page-screen > [aria-live]')).toHaveText(new RegExp(`^Page ${start + 1}( of \\d+)?$`))
})

test('a long Contents scrolls inside itself, and its foot stays in reach', async ({ page }) => {
  phoneOnly(page)
  const many = Array.from({ length: 40 }, (_, i) => `# Chapter ${i + 1}\n\nWords.`).join('\n\n')
  await importBook(page, many)
  await contentsFromCount(page)
  const list = contents(page).locator('.contents-list')
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await expect(contents(page).getByRole('button', { name: 'Done' })).toBeInViewport({ ratio: 1 })
  await chapter(page, 'Chapter 40').scrollIntoViewIfNeeded()
  await chapter(page, 'Chapter 40').click()
  await expect(page.locator('.title')).toHaveText('Chapter 40')
  // Reopened, the list starts where the writer is.
  await contentsFromCount(page)
  await expect(chapter(page, 'Chapter 40')).toBeInViewport()
})

test('Contents opens with the keyboard up, and the writer stays in the text', async ({ page }) => {
  phoneOnly(page)
  await importBook(page, THREE)
  await openChapter(page, 'Two')
  await writeHere(page)
  await expect(runningHead(page)).toBeVisible()
  await page.setViewportSize({ width: 390, height: 500 })
  await expect(page.locator('.writing-bar')).toBeVisible()

  await runningHead(page).click()
  await expect(contents(page)).toBeVisible()
  await expect(page.locator('.body')).toBeFocused()
  const sheet = (await contents(page).boundingBox())!
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(500)

  await contents(page).getByRole('button', { name: 'Done' }).click()
  await expect(contents(page)).toHaveCount(0)
  await expect(page.locator('.body')).toBeFocused()

  // Going to another chapter keeps the keyboard, the bar and the caret.
  await runningHead(page).click()
  await chapter(page, 'Three').click()
  await expect(page.locator('.title')).toHaveText('Three')
  await expect(page.locator('.page-screen')).toHaveAttribute('data-keyboard')
  await expect(page.locator('.body')).toBeFocused()
  await expect(page.locator('.writing-bar')).toBeVisible()
})

const FIELDS = '.body, .title, .book-title, .subtitle'
/** The caret's colours in the page's fields, as the browser reads them: one, when all agree. */
const carets = async (page: Page) => [...new Set(await page.locator(FIELDS).evaluateAll((all) => all.map((field) => getComputedStyle(field).caretColor)))]
const NONE = 'rgba(0, 0, 0, 0)'

test('a sheet over the page hides the caret and keeps the focus; closing it brings the caret back', async ({ page }) => {
  phoneOnly(page)
  await importBook(page, THREE)
  // The first chapter: its page holds the title page's fields too.
  await openChapter(page, 'One')
  await writeHere(page)
  await page.setViewportSize({ width: 390, height: 500 })
  await expect(page.locator('.writing-bar')).toBeVisible()
  await expect(page.locator(FIELDS)).toHaveCount(4)
  const shown = await carets(page)
  expect(shown).toHaveLength(1)
  expect(shown).not.toContain(NONE)

  // Every field, with the focus left where it was, in the text and then in the title.
  await runningHead(page).click()
  await expect(contents(page)).toBeVisible()
  expect(await carets(page)).toEqual([NONE])
  await expect(page.locator('.body')).toBeFocused()
  await contents(page).getByRole('button', { name: 'Done' }).click()
  await expect(contents(page)).toHaveCount(0)
  expect(await carets(page)).toEqual(shown)
  await expect(page.locator('.body')).toBeFocused()

  await page.locator('.title').focus()
  await runningHead(page).click()
  await expect(contents(page)).toBeVisible()
  await expect(page.locator('.title')).toHaveCSS('caret-color', NONE)
  await expect(page.locator('.title')).toBeFocused()
  // Chosen, a chapter closes the sheet as Done does.
  await chapter(page, 'Three').click()
  await expect(page.locator('.title')).toHaveText('Three')
  expect(await carets(page)).toEqual(shown)

  // Text settings and export take the focus into themselves, under the same rule.
  await page.locator('.body').focus()
  await page.locator('.page-button').click()
  for (const sheet of ['Text settings', 'Export']) {
    await page.locator('.tools').getByRole('button', { name: sheet }).click()
    await expect(page.getByRole('dialog', { name: sheet })).toBeVisible()
    expect(await carets(page)).toEqual([NONE])
    await page.getByRole('dialog', { name: sheet }).getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('dialog', { name: sheet })).toHaveCount(0)
    expect(await carets(page)).toEqual(shown)
  }
})

test('a sheet from the desktop head leaves the caret alone, for the writer typing beside it', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, TWO)
  await openChapter(page, 'Two')
  await writeHere(page)
  const shown = await carets(page)
  await page.locator('.head-tools').getByRole('button', { name: 'Text settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Text settings' })).toBeVisible()
  await page.locator('.body').click()
  await expect(page.locator('.body')).toBeFocused()
  await expect(page.getByRole('dialog', { name: 'Text settings' })).toBeVisible()
  expect(await carets(page)).toEqual(shown)
})

/** More chapters than a list shows at once. */
const MANY = Array.from({ length: 40 }, (_, i) => `# Chapter ${i + 1}\n\nWords.\n`).join('\n')

test('the focus ring on a Contents row stands whole outside it, at the top, the sides and the end of a long list', async ({ page, browserName }) => {
  await importBook(page, MANY)
  await contentsFromCount(page)
  // The sheet takes the focus just after it shows, from the count that had it: it must not land mid-test.
  // (On desktop the rail takes none, and in WebKit the count never had it.)
  if (!onDesktop(page) && browserName !== 'webkit') await expect(rows(page).first()).toBeFocused()
  const list = contents(page).locator('.contents-list')
  /** How far the focused row's ring, 4px round the row, stands inside what the list shows. Never less than 0. */
  const room = () =>
    list.evaluate((el) => {
      const row = document.activeElement!.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      return Math.min(row.top - 4 - box.top, box.bottom - row.bottom - 4, row.left - 4 - box.left, box.right - row.right - 4)
    })
  await list.evaluate((el) => {
    el.scrollTop = 0
  })
  // A key first, so the ring shows. (Not in WebKit, whose Tab passes over buttons: there the room alone is read.)
  await page.keyboard.press('Shift')
  await rows(page).nth(1).focus()
  await rows(page).first().focus()
  if (browserName !== 'webkit') {
    await expect(rows(page).first()).toHaveCSS('outline-offset', '2px')
    await expect(rows(page).first()).toHaveCSS('outline-width', '2px')
  }
  expect(await room()).toBeGreaterThanOrEqual(-0.5)
  // A row below the fold: the list scrolls to it, and the ring stays whole.
  await rows(page).nth(25).focus()
  expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  expect(await room()).toBeGreaterThanOrEqual(-0.5)
  await rows(page).last().focus()
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  expect(await room()).toBeGreaterThanOrEqual(-0.5)
})

test('a long title wraps in the rail, whole, with the page number on its first line', async ({ page }) => {
  desktopOnly(page)
  const unbroken = 'Unbroken'.repeat(12)
  const spaced = 'The windows of the shop had been salted white by the first storm of November'
  await importBook(page, `# One\n\nFirst.\n\n# ${unbroken}\n\nSecond.\n\n# ${spaced}\n\nThird.\n`)
  await expect(rows(page).nth(2).locator('.contents-page')).toBeVisible()

  const short = (await rows(page).first().boundingBox())!
  expect(short.height).toBe(36)
  expect(short.width).toBe(296)
  for (const n of [1, 2]) {
    const row = rows(page).nth(n)
    const box = (await row.boundingBox())!
    expect(box.height).toBeGreaterThan(36)
    expect(box.width).toBe(296)
    // Nothing cut: the title is as tall as it needs, and no wider than its place.
    const title = row.locator('.contents-title')
    expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth && getComputedStyle(el).whiteSpace !== 'nowrap')).toBe(true)
    const line = (await title.boundingBox())!
    const number = (await row.locator('.contents-page').boundingBox())!
    // On the first line, not the middle of the row.
    expect(number.y - box.y).toBe((await rows(page).first().locator('.contents-page').boundingBox())!.y - short.y)
    expect(number.y).toBeLessThan(line.y + 23)
  }
})

test('a long name runs downwards in the path to three lines, then cuts, and the rail makes room', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, TWO)
  const home = page.locator('.head .home')
  const toggle = page.locator('.rail-toggle')
  const crumbs = page.locator('.head .crumbs')
  const line = page.locator('.rail-line')
  const onTheLine = (await home.boundingBox())!.y
  const toggleOnTheLine = (await toggle.boundingBox())!.y
  await expect.poll(async () => (await line.boundingBox())!.y).toBe(76)

  const named = async (name: string) => {
    await page.locator('.book-title').evaluate((el, text) => {
      el.textContent = text
      el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }, name)
    await expect(crumbs).toContainText(name)
  }

  // Two lines fit above the rail, which stays where it is on every other piece.
  await named('The windows of the shop')
  expect((await crumbs.boundingBox())!.height).toBe(48)
  await expect.poll(async () => (await line.boundingBox())!.y).toBe(76)

  for (const name of ['The windows of the shop had been salted white by the first storm of November', 'Unbroken'.repeat(12)]) {
    await named(name)
    const box = (await crumbs.boundingBox())!
    expect(box.height).toBe(68)
    expect((await home.boundingBox())!.y).toBe(onTheLine)
    expect((await toggle.boundingBox())!.y).toBe(toggleOnTheLine)
    await expect.poll(async () => (await line.boundingBox())!.y).toBe(96)
    expect(box.y + box.height).toBeLessThan(96)
    // Nothing runs past the block, under the toggle or out of the rail.
    expect(await crumbs.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  }

  // Shortened again, the rail goes back.
  await named('Harbour')
  await expect.poll(async () => (await line.boundingBox())!.y).toBe(76)
})

test('a failed save stands in the rail, above + New chapter, with every word and every chapter in reach', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, MANY)
  await openChapter(page, 'Chapter 2')
  await writeHere(page)
  const add = page.getByRole('button', { name: 'New chapter' })
  const before = (await add.boundingBox())!
  await page.evaluate(() => {
    IDBDatabase.prototype.transaction = () => {
      throw new DOMException('The disk is full.', 'QuotaExceededError')
    }
  })
  await page.keyboard.type(' Not stored.')
  const line = page.getByRole('alert')
  await expect(line).toHaveText("Can't save right now. Your words are still here.Save a copy")

  const box = (await line.boundingBox())!
  expect(box.x).toBe(20)
  expect(box.x + box.width).toBeLessThanOrEqual(316)
  // Whole, wrapped rather than cut.
  expect(await line.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true)
  await expect(line.getByRole('button', { name: 'Save a copy' })).toBeInViewport({ ratio: 1 })
  // + New chapter stands where it stood, 12px under the line, and can be pressed.
  const after = (await add.boundingBox())!
  expect(after).toEqual(before)
  expect(after.y - (box.y + box.height)).toBeGreaterThanOrEqual(12)
  await add.click({ trial: true })

  // The last chapter scrolls clear of the line.
  const list = contents(page).locator('.contents-list')
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  const last = (await rows(page).last().boundingBox())!
  expect(last.y + last.height).toBeLessThanOrEqual(box.y)
})

test('a short book keeps its chapters and + New chapter where they stood when a save fails', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, TWO)
  await openChapter(page, 'Two')
  await writeHere(page)
  const add = page.getByRole('button', { name: 'New chapter' })
  const before = (await add.boundingBox())!
  await page.evaluate(() => {
    IDBDatabase.prototype.transaction = () => {
      throw new DOMException('The disk is full.', 'QuotaExceededError')
    }
  })
  await page.keyboard.type(' Not stored.')
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await add.boundingBox()).toEqual(before)
  await page.getByRole('button', { name: 'Contents' }).click()
  // Folded, there is no + New chapter to clear: the line goes down to the foot, and keeps its width.
  const box = (await page.getByRole('alert').boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(316)
  expect(box.y + box.height).toBe(900 - 20)
})

test('words typed just before a jump are there after a reload, in their own chapter', async ({ page }) => {
  await importBook(page, TWO)
  await writeHere(page)
  await page.keyboard.type(' Typed at the last moment.')
  await expect(page.locator('.body')).toContainText('Typed at the last moment.')
  await openChapter(page, 'Two')
  await page.reload()
  // The words are stored, or kept in the unsaved journal, before the chapter opens. The place is saved
  // after the closing save of the page left, so a reload this soon lands on either chapter; wherever it
  // lands, the words are in their own chapter and nowhere else.
  await expect(page.locator('.title')).toHaveText(/^(One|Two)$/)
  await openChapter(page, 'One')
  await expect(page.locator('.body')).toHaveText('First chapter. Typed at the last moment.')
  // A phone's Contents closes; on desktop it is the rail, and Escape would leave the page.
  if (!onDesktop(page)) await page.keyboard.press('Escape')
  await openChapter(page, 'Two')
  await expect(page.locator('.body')).toHaveText('Second.')
})

test('going there and back at once finds the words just typed', async ({ page }) => {
  await importBook(page, TWO)
  await writeHere(page)
  await page.keyboard.type(' Typed.')
  await openChapter(page, 'Two')
  await openChapter(page, 'One')
  await expect(page.locator('.body')).toHaveText('First chapter. Typed.')
})

test('a failed save on leaving keeps the words under their own chapter, and they come back with it', async ({ page }) => {
  await importBook(page, TWO)
  await writeHere(page)
  await page.evaluate(() => {
    ;(window as unknown as { __put: unknown }).__put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('The disk is full.', 'QuotaExceededError')
    }
  })
  await page.keyboard.type(' Not stored.')
  await openChapter(page, 'Two')
  await expect(page.locator('.body')).toHaveText('Second.')

  const kept = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('elbowpatch.unsaved.'))
      .map((k) => JSON.parse(localStorage.getItem(k)!) as { markdown: string }),
  )
  expect(kept.map((k) => k.markdown)).toEqual(['First chapter. Not stored.'])

  await page.evaluate(() => {
    IDBObjectStore.prototype.put = (window as unknown as { __put: typeof IDBObjectStore.prototype.put }).__put
  })
  await openChapter(page, 'One')
  await expect(page.locator('.body')).toHaveText('First chapter. Not stored.')
  await saved(page, 'Not stored.')
})

test('with nothing able to read or write, the writer stays on the chapter and the words are kept', async ({ page }) => {
  await importBook(page, TWO)
  await writeHere(page)
  await page.evaluate(() => {
    IDBDatabase.prototype.transaction = () => {
      throw new DOMException('The disk is full.', 'QuotaExceededError')
    }
  })
  await page.keyboard.type(' Not stored.')
  await contentsFromCount(page)
  await chapter(page, 'Two').click()
  await expect(page.getByRole('alert')).toContainText("Can't save right now")
  await expect(page.locator('.body')).toHaveText('First chapter. Not stored.')
  const kept = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('elbowpatch.unsaved.')).length)
  expect(kept).toBe(1)
})

test('a reload opens the chapter the writer was last in, and Where you left off names it', async ({ page }) => {
  await importBook(page, TWO)
  await openChapter(page, 'Two')
  await expect.poll(() => placeIn(page)).toBe('Two')
  await page.reload()
  await expect(page.locator('.title')).toHaveText('Two')
  await page.locator('.head .home').click()
  await expect(page.locator('.continue')).toContainText('Two')
  await page.locator('.continue').click()
  await expect(page.locator('.title')).toHaveText('Two')
})

test('a window that is not writing can still open chapters, and stays there on Write here', async ({ page, context }) => {
  await importBook(page, TWO)
  const second = await context.newPage()
  await second.goto(page.url())
  await expect(second.getByRole('status').filter({ hasText: 'Open in another window' })).toBeVisible()
  await openChapter(second, 'Two')
  await expect(second.locator('.body')).toHaveText('Second.')
  await expect(second.locator('.body')).toHaveAttribute('contenteditable', 'false')
  // Reading writes nothing: the writer's place is the writing window's.
  await expect.poll(() => placeIn(second)).not.toBe('Two')

  await second.getByRole('button', { name: 'Write here' }).click()
  await expect(second.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await expect(second.locator('.title')).toHaveText('Two')
})

test('an essay is unchanged: no control on the running head, and the count opens nothing', async ({ page }) => {
  phoneOnly(page)
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('An essay')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText(long(12))
  await page.keyboard.press('PageUp')
  await expect(page.locator('.running-head')).toHaveText('An essay')
  await expect(runningHead(page)).toHaveCount(0)
  await page.locator('.page-button').click()
  await expect(page.locator('.tools span.count')).toBeVisible()
  await expect(page.locator('.tools button.count')).toHaveCount(0)
})

const toggle = (page: Page) => page.locator('.head').getByRole('button', { name: 'Contents' })

test('the rail says the size of the book, and lists what the sheet lists', async ({ page }) => {
  await measureNothing(page)
  desktopOnly(page)
  await importBook(page, TWO)
  const line = contents(page).locator('.rail-line')
  await expect(line).toHaveText('2 chapters')
  await openChapter(page, 'Two')
  await expect(line).toHaveText(/^2 chapters · \d+ pages$/)
  await expect(rows(page).locator('.contents-title')).toHaveText(['One', 'Two'])
  await expect(rows(page).nth(0).locator('.contents-page')).toHaveText('1')
})

test('the rail folds and opens, is remembered on this device, and the text centres in what it leaves', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, THREE)
  const column = async () => (await page.locator('.pager').boundingBox())!
  const open = await column()
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
  // Right of the rail, centred in the width it leaves: 336px, then the window's other 1104.
  expect(open.x + open.width / 2).toBeCloseTo(336 + (1440 - 336) / 2, 0)

  await toggle(page).click()
  await expect(contents(page)).toBeHidden()
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(async () => (await column()).x).toBeCloseTo(open.x - 168, 0)
  expect((await column()).width).toBeCloseTo(open.width, 1)

  await page.reload()
  await expect(page.locator('.title')).toHaveText('One')
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(contents(page)).toBeHidden()

  await toggle(page).click()
  await expect(contents(page)).toBeVisible()
  await chapter(page, 'Two').click()
  await expect(page.locator('.title')).toHaveText('Two')
  await expect(contents(page)).toBeVisible()
  await expect.poll(async () => (await column()).x).toBeCloseTo(open.x, 1)
})

test('folding the rail keeps the book on the same page, with the same words on it', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, THREE)
  const count = page.locator('.head-tools .count')
  await expect(count).toContainText(' of ')
  const before = await count.textContent()
  await toggle(page).click()
  await expect(contents(page)).toBeHidden()
  await expect(count).toHaveText(before!)
})

test('in a window with no room beside the text the rail opens over it and the text stays', async ({ page }) => {
  desktopOnly(page)
  await page.setViewportSize({ width: 1000, height: 900 })
  await importBook(page, THREE)
  const column = async () => (await page.locator('.pager').boundingBox())!
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
  const folded = await column()
  await toggle(page).click()
  await expect(contents(page)).toBeVisible()
  expect(await column()).toEqual(folded)
})

test('the Time Machine opens with the page where it stood, beside the rail', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, THREE)
  const before = (await page.locator('.pager').boundingBox())!
  await page.getByRole('button', { name: 'Time Machine' }).click()
  const pager = page.locator('.time-machine .pager')
  await expect(pager).toBeVisible()
  await expect.poll(async () => (await pager.boundingBox())!.x).toBeCloseTo(before.x, 1)
})

test('the path says where § goes, and Escape goes there, keeping the words and the place', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, THREE)
  await expect(page.locator('.head .path .home-word')).toBeVisible()
  await writeHere(page)
  await page.keyboard.type(' still warm')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('navigation', { name: 'Library' })).toBeVisible()
  await page
    .getByRole('button', { name: /harbour/ })
    .first()
    .click()
  await expect(page.locator('.body')).toContainText('still warm')
})

test('Escape closes a sheet first, and only the next one leaves the page', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, THREE)
  await page.getByRole('button', { name: 'Text settings' }).click()
  await expect(page.locator('.sheet')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.sheet')).toBeHidden()
  await expect(page.locator('.page-screen')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('navigation', { name: 'Library' })).toBeVisible()
})

test('Escape closes the tools and leaves the caret in the text', async ({ page }) => {
  phoneOnly(page)
  await importBook(page, THREE)
  await page.locator('.page-button').click()
  await expect(page.locator('.tools')).toBeVisible()
  await page.locator('.body').click()
  await expect(page.locator('.body')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.tools')).toBeHidden()
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  await expect(page.locator('.body')).toBeFocused()
})

test('Escape with words selected stays on the page', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, THREE)
  await writeHere(page)
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  await expect(page.locator('.page-screen')).toBeVisible()
})

test('Escape in the rail gives the focus back to the toggle and stays on the page', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, THREE)
  await rows(page).first().focus()
  await page.keyboard.press('Escape')
  await expect(toggle(page)).toBeFocused()
  await expect(page.locator('.page-screen')).toBeVisible()
})

test('a rail opened again shows the current chapter, however far the list was scrolled while it was folded away', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, MANY)
  const list = contents(page).locator('.contents-list')
  await expect(rows(page).first()).toHaveAttribute('aria-current', 'true')
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await expect(rows(page).first()).not.toBeInViewport()
  await toggle(page).click()
  await expect(contents(page)).toBeHidden()
  await toggle(page).click()
  await expect(rows(page).first()).toBeInViewport({ ratio: 1 })
})

test('folding the rail leaves the caret in the text', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, TWO)
  await writeHere(page)
  await toggle(page).click()
  await expect(page.locator('.body')).toBeFocused()
})

test('a click on the bare rail turns no page, and the count on desktop opens nothing', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, THREE)
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  // The page, not the whole count: the book's total fills in by itself.
  const here = page.locator('.page-button')
  await expect(here).toHaveAttribute('aria-label', /^Page 3 of /)
  await page.mouse.click(100, 700)
  await expect(page.locator('.page-screen')).not.toHaveAttribute('data-turn', /./)
  await expect(here).toHaveAttribute('aria-label', /^Page 3 of /)
  await expect(page.locator('.head-tools button.count')).toHaveCount(0)
})

test('the chapter on screen, chosen in the rail, goes back to its opening page', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, THREE)
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await chapter(page, 'One').click()
  await expect(page.locator('.title')).toBeInViewport()
  // The second page of the section: a title page stands before chapter 1.
  await expect(page.locator('.head-tools .count .visually-hidden')).toHaveText(/^Page 2 of /)
})

test('the rail works by keyboard, is named for a screen reader, and Escape leaves it', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, TWO)
  await toggle(page).focus()
  await page.keyboard.press('Tab')
  await expect(rows(page).nth(0)).toBeFocused()
  await expect(rows(page).nth(0)).toHaveAttribute('aria-current', 'true')

  await page.keyboard.press('Escape')
  await expect(toggle(page)).toBeFocused()
  await expect(contents(page)).toBeVisible()

  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(rows(page).nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.title')).toHaveText('Two')
  await expect(page.locator('.chapter-said')).toHaveText('Two')
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)

  // Folded, the keyboard passes it by.
  await toggle(page).focus()
  await page.keyboard.press('Enter')
  await expect(contents(page)).toBeHidden()
  await page.keyboard.press('Tab')
  await expect(page.locator('.contents-row:focus')).toHaveCount(0)
})

test('a window that is not writing lands on the chapter in the rail, not on nothing', async ({ page, context }) => {
  desktopOnly(page)
  await importBook(page, TWO)
  const second = await context.newPage()
  await second.goto(page.url())
  await expect(second.getByRole('status').filter({ hasText: 'Open in another window' })).toBeVisible()
  await rows(second).nth(1).focus()
  await second.keyboard.press('Enter')
  await expect(second.locator('.title')).toHaveText('Two')
  await expect(rows(second).nth(1)).toBeFocused()
})

test('a long rail scrolls inside itself, and starts at the current chapter', async ({ page }) => {
  desktopOnly(page)
  const many = Array.from({ length: 40 }, (_, i) => `# Chapter ${i + 1}\n\nWords.`).join('\n\n')
  await importBook(page, many)
  const list = contents(page).locator('.contents-list')
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await chapter(page, 'Chapter 40').scrollIntoViewIfNeeded()
  await chapter(page, 'Chapter 40').click()
  await expect(page.locator('.title')).toHaveText('Chapter 40')
  await expect(chapter(page, 'Chapter 40')).toBeInViewport()
})

test('where the window has no room for it beside the text, the rail starts folded and opens over the text', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, TWO)
  await page.setViewportSize({ width: 1000, height: 800 })
  await expect(contents(page)).toBeHidden()
  await toggle(page).click()
  await expect(contents(page)).toBeVisible()
  await chapter(page, 'Two').click()
  await expect(page.locator('.title')).toHaveText('Two')
  await expect(contents(page)).toBeHidden()
  // Wide again, it is as the writer left it.
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(contents(page)).toBeVisible()
})

test('just wide enough for the rail, a chapter opens with the rail standing still', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, TWO)
  await page.setViewportSize({ width: 1220, height: 900 })
  await expect(contents(page)).toBeVisible()
  await page.evaluate(() => {
    new MutationObserver(() => {
      if (document.querySelector('.contents-rail[data-folded]')) document.body.dataset.railSlid = 'yes'
    }).observe(document.body, { subtree: true, childList: true, attributes: true })
  })
  await chapter(page, 'Two').click()
  await expect(page.locator('.title')).toHaveText('Two')
  await chapter(page, 'One').click()
  await expect(page.locator('.title')).toHaveText('One')
  await expect(page.locator('body')).not.toHaveAttribute('data-rail-slid')
})

test('an essay has no rail and no toggle on desktop, as the frame draws it', async ({ page }) => {
  desktopOnly(page)
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await expect(contents(page)).toHaveCount(0)
  await expect(page.locator('.rail')).toHaveCount(0)
  await expect(page.locator('.head .rail-toggle')).toHaveCount(0)
  // Only the path stands at the head's left.
  await expect(page.locator('.head-path').getByRole('button')).toHaveCount(1)
})
