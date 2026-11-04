import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, openTools } from './helpers'

// Page numbers count the whole book (#59), on a phone and on desktop, each with its own counts.

const PARAGRAPH =
  'The windows of the shop had been salted white by the first storm of November, and Ana scraped a small square clear each morning before she unlocked the door.'
const long = (paragraphs: number) => Array.from({ length: paragraphs }, (_, i) => `${i + 1}. ${PARAGRAPH}`).join('\n\n')

/** Three chapters of several pages each, and a last one with what lays out differently: italics, bold, a pull quote, a long title. */
const BOOK = `# One\n\n${long(14)}\n\n# Two\n\n${long(20)}\n\n# The third chapter of this book has a title long enough to take several lines\n\n*Italic words* and **bold words**.\n\n> A pull quote\n\n${long(9)}\n`
const SHORT = '# One\n\nFirst chapter.\n\n# Two\n\nSecond.\n'

/** Holds back everything waiting for the app to be idle, until `letIdleRun`, and again after each reload. */
const holdIdle = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { held: (() => void)[] | null; requestIdleCallback(f: () => void): number }
    w.held = []
    w.requestIdleCallback = (f) => {
      if (w.held) w.held.push(f)
      else setTimeout(f, 0)
      return 1
    }
  })
const letIdleRun = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { held: (() => void)[] | null }
    const held = w.held ?? []
    w.held = null
    for (const f of held) f()
  })

/** Imports a Markdown file as a book, and leaves the library showing. */
async function importBook(page: Page, markdown: string) {
  await page.goto('./#/settings/export')
  await page.locator('input[type=file]').evaluate((el: HTMLInputElement, text) => {
    const files = new DataTransfer()
    files.items.add(new File([text], 'harbour.md', { type: 'text/markdown' }))
    el.files = files.files
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, markdown)
  await page.getByRole('dialog', { name: 'Import' }).getByRole('button', { name: 'Import' }).click()
  await expect(page.getByText('1 piece added.')).toBeVisible()
  await page.goto('./#/')
}

interface Stored {
  updatedAt: number
  sections: { sectionId: string; title: string }[]
  pages?: Record<string, Record<string, number>>
}

/** The book as stored. */
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Stored>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const db = open.result
          const all = db.transaction('pieces').objectStore('pieces').getAll()
          all.onsuccess = () => {
            db.close()
            done(all.result[0])
          }
        }
      }),
  )

/** The counts stored for this screen's page, chapter by chapter, once all are there. */
async function counts(page: Page): Promise<number[]> {
  const screen = page.viewportSize()!.width < 700 ? 'phone' : 'desktop'
  let found: number[] = []
  await expect
    .poll(
      async () => {
        const piece = await stored(page)
        found = piece.sections.map((s) => piece.pages?.[screen]?.[s.sectionId] ?? 0)
        return found.every((n) => n > 0)
      },
      { timeout: 20000 },
    )
    .toBe(true)
  return found
}

/** Reopens the book in one of its chapters, as a launch does. */
async function reopenIn(page: Page, index: number) {
  await page.evaluate(
    (index) =>
      new Promise<void>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const db = open.result
          const store = db.transaction('pieces', 'readwrite').objectStore('pieces')
          const all = store.getAll()
          all.onsuccess = () => {
            const piece = all.result[0]
            const sectionId = piece.sections[index].sectionId
            store.put({ ...piece, place: { sectionId, paragraph: 0, offset: 0, snippet: '', page: 0, caret: false, at: 1 } })
            store.transaction.oncomplete = () => {
              db.close()
              done()
            }
          }
        }
      }),
    index,
  )
  await page.goto('./#/')
  await page.reload()
  await page.locator('.row', { hasText: 'harbour' }).click()
  await expect(page.locator('.flow')).toBeVisible()
}

const countText = (page: Page) => page.locator('.head-tools .count > [aria-hidden], .tools .count').first()

/** Opens the tools and reads the count: on desktop it is always in the head. */
async function toolsCount(page: Page): Promise<string> {
  await openTools(page)
  const text = (await countText(page).textContent())!.replace(/\s+/g, ' ').trim()
  if (await page.getByRole('button', { name: 'Close tools' }).isVisible()) await page.getByRole('button', { name: 'Close tools' }).click()
  return text
}

/** Sets the text size from the tools. */
async function textSize(page: Page, size: 'Small' | 'Large') {
  await openTools(page)
  await page.getByRole('button', { name: 'Text settings' }).click()
  await page.getByRole('radio', { name: size }).click()
  await page.getByRole('dialog', { name: 'Text settings' }).getByRole('button', { name: 'Done' }).click()
  if (await page.getByRole('button', { name: 'Close tools' }).isVisible()) await page.getByRole('button', { name: 'Close tools' }).click()
}

/** Contents, open: the sheet on a phone, from the count; the rail, already open, on desktop. */
async function contents(page: Page) {
  if (page.viewportSize()!.width >= 700) return page.getByRole('navigation', { name: 'Contents' })
  await page.locator('.page-button').click()
  await page.locator('.tools .count').click()
  return page.getByRole('dialog', { name: 'Contents' })
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)

test('an imported book gets its numbers by itself, without a chapter being opened and without being dated', async ({ page }) => {
  await importBook(page, BOOK)
  const before = (await stored(page)).updatedAt
  const pages = await counts(page)
  await expect(page.locator('.row', { hasText: 'harbour' })).toContainText(`3 chapters · ${sum(pages)} pages`)
  expect((await stored(page)).updatedAt).toBe(before)
})

test('a count measured off screen is the count the page finds when the chapter opens', async ({ page }) => {
  await importBook(page, BOOK)
  const measured = await counts(page)
  for (const chapter of [0, 1, 2]) {
    await reopenIn(page, chapter)
    await page.waitForTimeout(300)
    expect(await counts(page), `chapter ${chapter + 1}`).toEqual(measured)
  }
})

test('so is one measured at other text settings', async ({ page }) => {
  await importBook(page, BOOK)
  await counts(page)
  await reopenIn(page, 1)
  await textSize(page, 'Large')
  await page.goto('./#/')
  await expect.poll(async () => sum(await counts(page))).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  const measured = await counts(page)
  for (const chapter of [0, 2]) {
    await reopenIn(page, chapter)
    await page.waitForTimeout(300)
    expect(await counts(page), `chapter ${chapter + 1}`).toEqual(measured)
  }
})

test('the folio, the tools and the library read as one book; the title page is part of chapter 1', async ({ page }) => {
  await importBook(page, BOOK)
  const [one, two, three] = await counts(page)
  const total = one! + two! + three!

  await reopenIn(page, 0)
  await expect(page.locator('.folio')).toHaveText('2')

  await reopenIn(page, 2)
  await expect(page.locator('.folio')).toHaveText(String(one! + two! + 1))
  const words = (await toolsCount(page)).split('·')[1]!.trim()
  expect(await toolsCount(page)).toBe(`${one! + two! + 1} of ${total} · ${words}`)
  expect(Number.parseInt(words.replace(/\D/g, ''), 10)).toBeGreaterThan(1000)

  await page.keyboard.press('PageDown')
  await expect(page.locator('.folio')).toHaveText(String(one! + two! + 2))
  await expect(page.locator('.page-screen > [aria-live]')).toHaveText(`Page ${one! + two! + 2} of ${total}`)
})

test('Contents agrees with the folio and the tools', async ({ page }) => {
  await importBook(page, BOOK)
  const [one, two, three] = await counts(page)
  await reopenIn(page, 2)
  const list = await contents(page)
  await expect(list.locator('.contents-pages')).toHaveText(`${one! + two! + three!} pages`)
  await expect(list.locator('.contents-page')).toHaveText(['1', String(one! + 1), String(one! + two! + 1)])
})

test('open Contents fills in as the chapters are measured, and empties and fills again at new text settings', async ({ page }) => {
  await holdIdle(page)
  await importBook(page, BOOK)
  await reopenIn(page, 0)
  const list = await contents(page)
  await expect(list.locator('.contents-pages')).toHaveCount(0)
  await expect(list.locator('.contents-page')).toHaveCount(2)

  await letIdleRun(page)
  const small = await counts(page)
  await expect(list.locator('.contents-pages')).toHaveText(`${sum(small)} pages`)
  await expect(list.locator('.contents-page')).toHaveCount(3)

  // The rail stays open beside the text; on a phone the sheet goes with the tools, and comes back.
  await textSize(page, 'Large')
  await expect.poll(async () => sum(await counts(page))).toBeGreaterThan(sum(small))
  const again = await contents(page)
  await expect(again.locator('.contents-pages')).toHaveText(`${sum(await counts(page))} pages`)
})

test('no number shows while an earlier chapter is not counted, and each comes back once it is', async ({ page }) => {
  await holdIdle(page)
  await importBook(page, BOOK)
  await reopenIn(page, 2)
  await page.waitForTimeout(300)

  await expect(page.locator('.folio')).toHaveCount(0)
  expect(await toolsCount(page)).toMatch(/^[\d.,]+ words$/)
  if (page.viewportSize()!.width < 700) await expect(page.locator('.page-button')).toHaveAttribute('aria-label', 'Open tools')
  await page.keyboard.press('PageDown')
  await expect(page.locator('.page-screen > [aria-live]')).toHaveText('Page turned')

  await letIdleRun(page)
  const [one, two, three] = await counts(page)
  await expect(page.locator('.folio')).toHaveText(String(one! + two! + 2))
  expect(await toolsCount(page)).toContain(`${one! + two! + 2} of ${one! + two! + three!} ·`)
})

test('chapter 1 keeps its folio while the chapters after it are not counted, with no total beside it', async ({ page }) => {
  await holdIdle(page)
  await importBook(page, BOOK)
  await reopenIn(page, 0)
  await expect(page.locator('.folio')).toHaveText('2')
  expect(await toolsCount(page)).toMatch(/^2 · [\d.,]+ words$/)
})

test('a text settings change puts every number aside, then updates them everywhere', async ({ page }) => {
  await holdIdle(page)
  await importBook(page, BOOK)
  await letIdleRun(page)
  const small = await counts(page)
  await reopenIn(page, 2)
  await expect(page.locator('.folio')).toHaveText(String(small[0]! + small[1]! + 1))

  await textSize(page, 'Large')
  await expect(page.locator('.folio')).toHaveCount(0)
  expect(await toolsCount(page)).toMatch(/^[\d.,]+ words$/)

  await letIdleRun(page)
  const large = await counts(page)
  expect(sum(large)).toBeGreaterThan(sum(small))
  await expect(page.locator('.folio')).toHaveText(String(large[0]! + large[1]! + 1))
  await page.goto('./#/')
  await expect(page.locator('.row', { hasText: 'harbour' })).toContainText(`${sum(large)} pages`)
})

test('a text settings change that moves no page of the open chapter still brings the total back', async ({ page }) => {
  await importBook(page, SHORT)
  await counts(page)
  await reopenIn(page, 1)
  await expect(page.locator('.folio')).toHaveText('3')
  await textSize(page, 'Large')
  await expect(page.locator('.folio')).toHaveText('3')
  expect(await toolsCount(page)).toContain('3 of 3 ·')
})

test('a text settings change made in a past visit is noticed at the next launch', async ({ page }) => {
  await importBook(page, BOOK)
  const small = await counts(page)
  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('elbowpatch.settings') ?? '{}')
    localStorage.setItem('elbowpatch.settings', JSON.stringify({ ...settings, size: 'l' }))
  })
  await page.reload()
  await expect.poll(async () => sum(await counts(page)), { timeout: 20000 }).toBeGreaterThan(sum(small))
})

test('measuring waits for the writer to pause', async ({ page }) => {
  await holdIdle(page)
  await importBook(page, SHORT)
  await reopenIn(page, 0)
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await caretToEnd(page)
  await page.keyboard.type('x')
  await letIdleRun(page)
  // Typing, with no pause long enough: nothing is measured, and every letter arrives.
  const typed = 'x'.repeat(20)
  await page.keyboard.type(typed, { delay: 150 })
  await expect(page.locator('.body')).toContainText(typed)
  const screen = page.viewportSize()!.width < 700 ? 'phone' : 'desktop'
  const piece = await stored(page)
  expect(piece.pages?.[screen]?.[piece.sections[1]!.sectionId]).toBeUndefined()
  await counts(page)
})

test('a window crossing to the other page counts that page too, and keeps each apart', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 700, 'starts from the desktop page')
  await importBook(page, BOOK)
  const desktop = await counts(page)
  await page.setViewportSize({ width: 500, height: 900 })
  const phone = await counts(page)
  expect(sum(phone)).not.toBe(sum(desktop))
  await page.setViewportSize({ width: 1440, height: 900 })
  expect(await counts(page)).toEqual(desktop)
})
