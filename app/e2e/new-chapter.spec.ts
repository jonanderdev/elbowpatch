import { expect, type Page, test } from '@playwright/test'
import { saved, write } from './helpers'

// + New chapter (#60): at the foot of the phone's sheet, and under the chapters in the desktop's rail.
const onDesktop = (page: Page) => page.viewportSize()!.width >= 700

const TWO = '# One\n\nFirst chapter.\n\n# Two\n\nSecond.\n'
const PARAGRAPH =
  'The windows of the shop had been salted white by the first storm of November, and Ana scraped a small square clear each morning before she unlocked the door.'
const long = (paragraphs: number) => Array.from({ length: paragraphs }, (_, i) => `${i + 1}. ${PARAGRAPH}`).join('\n\n')

/** A chapter's opening page has no running head; on a phone its head names the book, the way to Contents. */
async function onOpeningPage(page: Page) {
  if (onDesktop(page)) await expect(head(page)).toHaveCount(0)
  else await expect(head(page)).toContainText('harbour')
}

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
  await page.locator('.row', { hasText: 'harbour' }).click()
  await expect(page.locator('.book-title')).toHaveText('harbour')
}

const contents = (page: Page) => (onDesktop(page) ? page.getByRole('navigation', { name: 'Contents' }) : page.getByRole('dialog', { name: 'Contents' }))
const titles = (page: Page) => contents(page).locator('.contents-title')
const head = (page: Page) => page.locator('.running-control, .running-head')
const newChapterLink = (page: Page) => contents(page).getByRole('button', { name: '+ New chapter' })

/** Closes the phone's sheet; the rail stays. */
async function closeContents(page: Page) {
  if (!onDesktop(page)) await contents(page).getByRole('button', { name: 'Done' }).click()
}

async function openContents(page: Page) {
  if (onDesktop(page)) return expect(contents(page)).toBeVisible()
  // After Done the tools are still open.
  if (await page.locator('.page-button').isVisible()) await page.locator('.page-button').click()
  await page.locator('.tools .count').click()
  await expect(contents(page)).toBeVisible()
}

/** + New chapter, and the fresh page it opens. */
async function newChapter(page: Page) {
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await openContents(page)
  await newChapterLink(page).click()
  await expect(page.locator('.title')).toBeFocused()
  await expect(page.locator('.title')).toHaveText('')
}

/** Chooses a chapter in Contents and waits for it to open. */
async function goTo(page: Page, name: string) {
  await openContents(page)
  await contents(page).locator('.contents-row', { hasText: name }).click()
  await expect(page.locator('.title')).toHaveText(name)
}

interface StoredBook {
  titles: string[]
  /** Word and page counts kept for a section the book does not have. */
  strayCounts: string[]
  place?: string
  working: number
  outlines: string[][]
}

/** What is stored of the book, read straight from the database. */
const storedBook = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<StoredBook>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction(['pieces', 'working', 'outlines'])
          const pieces = tx.objectStore('pieces').getAll()
          const working = tx.objectStore('working').getAll()
          const outlines = tx.objectStore('outlines').getAll()
          tx.oncomplete = () => {
            db.close()
            const piece = pieces.result[0] ?? { sections: [] }
            const ids = new Map<string, string>(piece.sections.map((s: { sectionId: string; title: string }) => [s.sectionId, s.title]))
            const counted = [...Object.keys(piece.words ?? {}), ...Object.values(piece.pages ?? {}).flatMap((counts) => Object.keys(counts as object))]
            done({
              titles: [...ids.values()],
              strayCounts: counted.filter((id) => !ids.has(id)),
              place: piece.place && ids.get(piece.place.sectionId),
              working: working.result.length,
              outlines: outlines.result
                .sort((a: { seq: number }, b: { seq: number }) => a.seq - b.seq)
                .map((o: { sections: { title: string }[] }) => o.sections.map((s) => s.title)),
            })
          }
        }
      }),
  )

test('+ New chapter stands at the foot of the sheet, left of Done, in the title colour', async ({ page }) => {
  test.skip(onDesktop(page), 'the sheet is on a phone')
  await importBook(page, TWO)
  await openContents(page)
  const link = await newChapterLink(page).boundingBox()
  const done = await contents(page).getByRole('button', { name: 'Done' }).boundingBox()
  expect(link!.x + link!.width).toBeLessThan(done!.x)
  expect(Math.abs(link!.y - done!.y)).toBeLessThan(1)
  const colour = (el: Element) => getComputedStyle(el).color
  expect(await newChapterLink(page).evaluate(colour)).toBe(await titles(page).first().evaluate(colour))
})

test('+ New chapter stands under the chapters in the rail, on its line, and stays in reach of a long list', async ({ page }) => {
  test.skip(!onDesktop(page), 'the rail is on desktop')
  await importBook(page, Array.from({ length: 40 }, (_, i) => `# Chapter ${i + 1}\n\nWords.`).join('\n\n'))
  const link = (await newChapterLink(page).boundingBox())!
  const line = (await contents(page).locator('.rail-line').boundingBox())!
  const list = (await contents(page).locator('.contents-list').boundingBox())!
  expect(link.x).toBe(line.x)
  expect(link.y).toBeGreaterThanOrEqual(list.y + list.height)
  await expect(newChapterLink(page)).toBeInViewport({ ratio: 1 })
})

test('it adds a chapter at the end: the caret in its title, Return on to the text, both placeholders showing', async ({ page }) => {
  await importBook(page, TWO)
  await newChapter(page)
  if (!onDesktop(page)) await expect(contents(page)).toHaveCount(0)
  await expect(page.locator('.title')).toHaveAttribute('data-placeholder', 'Chapter title')
  await expect(page.locator('.title')).toHaveAttribute('data-empty', '')
  await expect(page.locator('.body [data-placeholder="Begin anywhere."]')).toBeVisible()
  await expect(page.locator('.title')).toBeInViewport()
  await onOpeningPage(page)

  await page.keyboard.type('Three')
  await page.keyboard.press('Enter')
  await expect(page.locator('.body')).toBeFocused()
  await page.keyboard.type('The third.')
  await saved(page, 'The third.')
  await expect.poll(async () => (await storedBook(page)).place, { timeout: 15000 }).toBe('Three')

  await page.reload()
  await expect(page.locator('.title')).toHaveText('Three')
  await expect(page.locator('.body')).toHaveText('The third.')
  await openContents(page)
  await expect(titles(page)).toHaveText(['One', 'Two', 'Three'])
})

test('Contents lists the chapter while it is a draft, and its title as it is typed', async ({ page }) => {
  await importBook(page, TWO)
  await newChapter(page)
  await openContents(page)
  await expect(titles(page)).toHaveText(['One', 'Two', 'Untitled'])
  await expect(contents(page).locator('[aria-current="true"] .contents-title')).toHaveText('Untitled')
  await closeContents(page)

  await page.locator('.title').click()
  await page.keyboard.type('Thr')
  await openContents(page)
  await expect(titles(page)).toHaveText(['One', 'Two', 'Thr'])
})

test('a chapter left empty is gone, and leaves nothing behind', async ({ page }) => {
  await importBook(page, TWO)
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
  const before = await storedBook(page)
  await newChapter(page)
  await goTo(page, 'One')

  await openContents(page)
  await expect(titles(page)).toHaveText(['One', 'Two'])
  await closeContents(page)
  await expect.poll(() => storedBook(page)).toMatchObject({ titles: ['One', 'Two'], strayCounts: [], working: before.working })
  // Leaving took the book's first moment: no outline ever had the empty chapter.
  expect((await storedBook(page)).outlines.every((o) => o.length === 2)).toBe(true)
  await page.locator('.head .home').click()
  await expect(page.locator('.row', { hasText: 'harbour' })).toContainText('2 chapters')
})

test('a reload on an empty chapter opens the chapter the writer came from, with nothing behind', async ({ page }) => {
  await importBook(page, TWO)
  await goTo(page, 'Two')
  await expect.poll(async () => (await storedBook(page)).place).toBe('Two')
  await newChapter(page)
  await page.reload()
  await expect(page.locator('.title')).toHaveText('Two')
  expect((await storedBook(page)).titles).toEqual(['One', 'Two'])
})

test('a title typed and taken back before it is saved stores nothing', async ({ page }) => {
  await importBook(page, TWO)
  await newChapter(page)
  await page.keyboard.type('T')
  await page.keyboard.press('Backspace')
  await goTo(page, 'One')
  await expect.poll(() => storedBook(page)).toMatchObject({ titles: ['One', 'Two'], strayCounts: [] })
})

test('a chapter with only a title stays, with its page counted, and the next moment records it', async ({ page }) => {
  await importBook(page, TWO)
  // Each chapter laid out once, so the book's pages are known (measuring the rest comes with #59).
  await goTo(page, 'Two')
  await goTo(page, 'One')
  await newChapter(page)
  await page.keyboard.type('Outline only')
  await goTo(page, 'One')

  await expect.poll(async () => (await storedBook(page)).outlines.at(-1)).toEqual(['One', 'Two', 'Outline only'])
  await openContents(page)
  await expect(titles(page)).toHaveText(['One', 'Two', 'Outline only'])
  await expect(contents(page).locator('.contents-pages')).toBeVisible()
  await closeContents(page)
  await goTo(page, 'Outline only')
})

test('the place follows the writer into a chapter with only a title', async ({ page }) => {
  await importBook(page, TWO)
  await newChapter(page)
  await page.keyboard.type('Outline only')
  await expect.poll(async () => (await storedBook(page)).place, { timeout: 15000 }).toBe('Outline only')
  await page.reload()
  await expect(page.locator('.title')).toHaveText('Outline only')
})

test('the running head shows from the second page of a new chapter, and not on its opening page', async ({ page }) => {
  await importBook(page, TWO)
  await newChapter(page)
  await page.keyboard.type('Three')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText(long(12))
  await expect(head(page)).toContainText('Three')
  if (!onDesktop(page)) await head(page).click()
  await contents(page).locator('.contents-row', { hasText: 'Three' }).click()
  await onOpeningPage(page)
  await expect(page.locator('.title')).toBeInViewport()
})

test('in a book with nothing stored yet it opens too; left empty, nothing is stored, and the first chapter can be reached', async ({ page }) => {
  await page.goto('./')
  await write(page, 'Book')
  await expect(page.locator('.book-title')).toBeFocused()
  await newChapter(page)
  await newChapter(page)
  await openContents(page)
  await expect(titles(page)).toHaveText(['Untitled', 'Untitled'])
  await contents(page).locator('.contents-row').first().click()
  await expect(page.locator('.book-title')).toBeVisible()
  await page.locator('.head .home').click()
  await expect(page.locator('.row')).toHaveCount(0)
})

test('in a book with nothing stored yet, a second chapter written in keeps the book at two chapters', async ({ page }) => {
  await page.goto('./')
  await write(page, 'Book')
  await expect(page.locator('.book-title')).toBeFocused()
  await newChapter(page)
  await newChapter(page)
  await page.keyboard.type('Second')
  await expect.poll(async () => (await storedBook(page)).titles).toEqual(['', 'Second'])
})

test('a window that is not writing has no + New chapter, and still reads Contents', async ({ page, context }) => {
  await importBook(page, TWO)
  const second = await context.newPage()
  await second.goto(page.url())
  await expect(second.getByRole('status').filter({ hasText: 'Open in another window' })).toBeVisible()
  await openContents(second)
  await expect(titles(second)).toHaveText(['One', 'Two'])
  await expect(newChapterLink(second)).toHaveCount(0)
})

test('in an empty title the caret stands at the start of the placeholder, not after it', async ({ page }) => {
  await importBook(page, TWO)
  await newChapter(page)
  await expect(page.locator('.title')).toBeFocused()
  await expect(page.locator('.title')).toHaveAttribute('data-empty', '')
  // A caret in an empty field has no box to measure: what puts it there is the placeholder standing out of its line.
  const placeholder = await page.locator('.title').evaluate((el) => {
    const before = getComputedStyle(el, '::before')
    return { position: before.position, text: before.content }
  })
  expect(placeholder).toEqual({ position: 'absolute', text: '"Chapter title"' })
})
