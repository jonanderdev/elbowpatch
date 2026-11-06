import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, saved } from './helpers'

// Removing an empty chapter (#72): a quiet Remove where its page number would be, in Contents on a phone and in the rail on desktop.
const onDesktop = (page: Page) => page.viewportSize()!.width >= 700

const THREE = '# One\n\nFirst chapter.\n\n# Two\n\nSecond.\n\n# Three\n\nThird.\n'

async function importBook(page: Page, markdown = THREE) {
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
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

const contents = (page: Page) => (onDesktop(page) ? page.getByRole('navigation', { name: 'Contents' }) : page.getByRole('dialog', { name: 'Contents' }))
const rows = (page: Page) => contents(page).locator('.contents-row')
const removes = (page: Page) => contents(page).getByRole('button', { name: 'Remove chapter' })

async function openContents(page: Page) {
  if (onDesktop(page) || (await contents(page).isVisible())) return expect(contents(page)).toBeVisible()
  if (await page.locator('.page-button').isVisible()) await page.locator('.page-button').click()
  await page.locator('.tools .count').click()
  await expect(contents(page)).toBeVisible()
}

async function closeContents(page: Page) {
  if (onDesktop(page) || !(await contents(page).isVisible())) return
  await contents(page).getByRole('button', { name: 'Done' }).click()
  await expect(contents(page)).toBeHidden()
}

async function goTo(page: Page, name: string) {
  await openContents(page)
  await rows(page).filter({ hasText: name }).click()
  await expect(page.locator('.title')).toHaveText(name === 'Untitled' ? '' : name)
}

interface Stored {
  titles: string[]
  ids: string[]
  /** Every outline's chapters, oldest first. */
  outlines: string[][]
  words: string[]
}

const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Stored>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction(['pieces', 'outlines'])
          const pieces = tx.objectStore('pieces').getAll()
          const outlines = tx.objectStore('outlines').getAll()
          tx.oncomplete = () => {
            db.close()
            const piece = pieces.result[0]
            done({
              titles: piece.sections.map((s: { title: string }) => s.title),
              ids: piece.sections.map((s: { sectionId: string }) => s.sectionId),
              outlines: (outlines.result as { seq: number; sections: { sectionId: string }[] }[])
                .sort((a, b) => a.seq - b.seq)
                .map((o) => o.sections.map((s) => s.sectionId)),
              words: Object.keys(piece.words ?? {}),
            })
          }
        }
      }),
  )

const storedTitles = (page: Page) => expect.poll(async () => (await stored(page)).titles, { timeout: 15000 })

/** Empties the chapter on the page, title and text, and waits until that is stored. */
async function emptyHere(page: Page, name: string) {
  await closeContents(page)
  await page.locator('.title').focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await expect(page.locator('.title')).toHaveText('')
  await page.locator('.body').focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await expect(page.locator('.body')).toHaveText('')
  await expect.poll(async () => (await stored(page)).titles.includes(name), { timeout: 15000 }).toBe(false)
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<boolean>((done) => {
              const open = indexedDB.open('elbowpatch')
              open.onsuccess = () => {
                const all = open.result.transaction('working').objectStore('working').getAll()
                all.onsuccess = () => {
                  open.result.close()
                  done((all.result as { content: string }[]).some((w) => w.content === ''))
                }
              }
            }),
        ),
      { timeout: 15000 },
    )
    .toBe(true)
}

/** The book with its second chapter emptied, the writer on the chapter named. */
async function bookWithEmptied(page: Page, on = 'One') {
  await importBook(page)
  await goTo(page, 'Two')
  await emptyHere(page, 'Two')
  if (on !== 'Untitled') await goTo(page, on)
  await openContents(page)
}

test('an emptied chapter shows Remove where its page number would be, and chapters with words or a title do not', async ({ page }) => {
  await bookWithEmptied(page)
  await expect(removes(page)).toHaveCount(1)
  const line = contents(page).locator('li').nth(1)
  await expect(line.getByRole('button', { name: 'Remove chapter' })).toHaveText('Remove')
  await expect(line.locator('.contents-page')).toHaveCount(0)
  await expect(contents(page).locator('li').nth(0).getByRole('button', { name: 'Remove chapter' })).toHaveCount(0)
  await expect(contents(page).locator('li').nth(2).getByRole('button', { name: 'Remove chapter' })).toHaveCount(0)
  // Beside the row's button, never inside it.
  await expect(contents(page).locator('.contents-row button')).toHaveCount(0)
  await expect(line.locator('> button')).toHaveCount(2)
})

test('it reads as a text link in secondary grey, level with the page numbers, with room for a thumb on a phone', async ({ page }) => {
  await bookWithEmptied(page)
  await expect(contents(page).locator('.contents-page').first()).toBeVisible()
  const remove = removes(page)
  const number = contents(page).locator('.contents-page').first()
  const style = (l: typeof remove) => l.evaluate((el) => getComputedStyle(el).color)
  expect(await style(remove)).toBe(await style(number))
  await expect(remove).toHaveClass(/text-link/)
  const right = async (l: typeof remove) =>
    await l.evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return range.getBoundingClientRect().right
    })
  expect(Math.abs((await right(remove)) - (await right(number)))).toBeLessThan(1)
  if (!onDesktop(page)) {
    const box = (await remove.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
  }
})

test('removing a chapter that is not open leaves the page as it was; Contents and the numbers follow', async ({ page }) => {
  await bookWithEmptied(page, 'Three')
  await closeContents(page)
  await caretToEnd(page)
  await page.keyboard.type(' Still here.')
  await saved(page, 'Third. Still here.')
  const third = rows(page).filter({ hasText: 'Three' })
  await openContents(page)
  await expect(contents(page).locator('.contents-pages')).toHaveText(/\d+ pages?/)
  const startBefore = Number(await third.locator('.contents-page').innerText())
  const pagesBefore = parseInt(await contents(page).locator('.contents-pages').innerText(), 10)
  await removes(page).click()

  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).nth(1)).toContainText('Three')
  await expect(third).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('.title')).toHaveText('Three')
  await expect(page.locator('.body')).toHaveText('Third. Still here.')
  await storedTitles(page).toEqual(['One', 'Three'])
  await expect.poll(async () => Number(await third.locator('.contents-page').innerText())).toBeLessThan(startBefore)
  await expect.poll(async () => parseInt(await contents(page).locator('.contents-pages').innerText(), 10)).toBeLessThan(pagesBefore)
  const { ids, words, outlines } = await stored(page)
  expect(words.sort()).toEqual([...ids].sort())
  // The outline from before it stays in history.
  expect(outlines.at(-2)).toHaveLength(3)

  await page.reload()
  await expect(page.locator('.body')).toHaveText('Third. Still here.')
  await openContents(page)
  await expect(rows(page)).toHaveCount(2)
})

test('the writer keeps typing in the open chapter straight after, and the words stay', async ({ page }) => {
  await bookWithEmptied(page, 'Three')
  await removes(page).click()
  await expect(rows(page)).toHaveCount(2)
  await closeContents(page)
  await caretToEnd(page)
  await page.keyboard.type(' After.')
  await saved(page, 'Third. After.')
  await storedTitles(page).toEqual(['One', 'Three'])
})

test('removing the open chapter opens the one before it at its opening page, and the page closing does not bring it back', async ({ page }) => {
  await bookWithEmptied(page, 'Untitled')
  await removes(page).click()
  await expect(page.locator('.title')).toHaveText('One')
  await expect(page.locator('.body')).toHaveText('First chapter.')
  await storedTitles(page).toEqual(['One', 'Three'])

  await openContents(page)
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).nth(0)).toHaveAttribute('aria-current', 'true')
  await page.reload()
  await expect(page.locator('.body')).toHaveText('First chapter.')
  await storedTitles(page).toEqual(['One', 'Three'])
  await openContents(page)
  await expect(rows(page)).toHaveCount(2)
})

test('removing the open first chapter opens the next, which now carries the title page', async ({ page }) => {
  await importBook(page)
  await emptyHere(page, 'One')
  await openContents(page)
  await removes(page).click()
  await expect(page.locator('.title')).toHaveText('Two')
  await expect(page.locator('.body')).toHaveText('Second.')
  await expect(page.locator('.book-title')).toHaveCount(1)
  await storedTitles(page).toEqual(['Two', 'Three'])
})

test('removing the first chapter from the next one gives that page the title page, with the words and the caret kept', async ({ page }) => {
  await importBook(page)
  await emptyHere(page, 'One')
  await goTo(page, 'Two')
  await expect(page.locator('.book-title')).toHaveCount(0)
  await openContents(page)
  await removes(page).click()
  await expect(page.locator('.book-title')).toHaveCount(1)
  await expect(page.locator('.title')).toHaveText('Two')
  await expect(page.locator('.body')).toHaveText('Second.')
  await storedTitles(page).toEqual(['Two', 'Three'])
  // The title page is counted as part of it: the book's pages come out right once laid out.
  await openContents(page)
  await expect(rows(page).nth(0).locator('.contents-page')).toHaveText('1')
  await expect(rows(page).nth(1).locator('.contents-page')).toHaveText('3')
})

test('a book of one chapter has no Remove, and a book brought down to one has none left', async ({ page }) => {
  await importBook(page, '# One\n\nFirst.\n\n# Two\n\nSecond.\n')
  await goTo(page, 'Two')
  await emptyHere(page, 'Two')
  await goTo(page, 'One')
  await openContents(page)
  await removes(page).click()
  await expect(rows(page)).toHaveCount(1)
  await expect(removes(page)).toHaveCount(0)
  await closeContents(page)
  await emptyHere(page, 'One')
  await openContents(page)
  await expect(rows(page)).toHaveCount(1)
  await expect(removes(page)).toHaveCount(0)
})

test('words typed into an empty chapter take Remove away at once, before they are stored', async ({ page }) => {
  await bookWithEmptied(page, 'Untitled')
  await expect(removes(page)).toHaveCount(1)
  await closeContents(page)
  await page.locator('.body').focus()
  await page.keyboard.type('Not stored yet')
  await openContents(page)
  await expect(removes(page)).toHaveCount(0)
})

test('a title typed into an empty chapter takes Remove away at once', async ({ page }) => {
  await bookWithEmptied(page, 'Untitled')
  await closeContents(page)
  await page.locator('.title').focus()
  await page.keyboard.type('A title')
  await openContents(page)
  await expect(removes(page)).toHaveCount(0)
})

test('words waiting to be stored for a chapter keep it: no Remove, and they come back when it opens', async ({ page }) => {
  await bookWithEmptied(page)
  await expect(removes(page)).toHaveCount(1)
  await closeContents(page)
  // The save fails as the writer leaves the emptied chapter: its words wait in the journal.
  await goTo(page, 'Untitled')
  await page.evaluate(() => {
    ;(window as unknown as { __put: unknown }).__put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('The disk is full.', 'QuotaExceededError')
    }
  })
  await closeContents(page)
  await page.locator('.body').focus()
  await page.keyboard.type('Not stored.')
  await goTo(page, 'One')
  await openContents(page)
  await expect(removes(page)).toHaveCount(0)
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = (window as unknown as { __put: typeof IDBObjectStore.prototype.put }).__put
  })
  await goTo(page, 'Untitled')
  await expect(page.locator('.body')).toHaveText('Not stored.')
  await saved(page, 'Not stored.')
  await storedTitles(page).toEqual(['One', '', 'Three'])
})

test('a press that was on its way as the words came is refused quietly, and the words stay', async ({ page }) => {
  await bookWithEmptied(page, 'Untitled')
  // The press reaches a Remove the page has already taken away: what counts is what the page holds then.
  await page.evaluate(() => {
    ;(window as unknown as { __remove: Element | null }).__remove = document.querySelector('.contents-remove')
  })
  await closeContents(page)
  await page.locator('.body').focus()
  await page.keyboard.type('Just typed.')
  await page.evaluate(() => (window as unknown as { __remove: HTMLElement }).__remove.click())
  await saved(page, 'Just typed.')
  await expect(page.locator('.body')).toHaveText('Just typed.')
  // The text is held only while the press is seen through: then the writer goes on as before.
  await expect(async () => {
    await page.keyboard.type('.')
    await expect(page.locator('.body')).toContainText('Just typed..', { timeout: 200 })
  }).toPass()
  await saved(page, 'Just typed..')
  await storedTitles(page).toEqual(['One', '', 'Three'])
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('a new chapter not stored yet can be removed too: it opens the one before, and nothing is left behind', async ({ page }) => {
  await importBook(page)
  await goTo(page, 'Three')
  await openContents(page)
  await contents(page).getByRole('button', { name: '+ New chapter' }).click()
  await expect(page.locator('.title')).toBeFocused()
  await openContents(page)
  await expect(rows(page)).toHaveCount(4)
  await removes(page).click()
  await expect(page.locator('.title')).toHaveText('Three')
  await openContents(page)
  await expect(rows(page)).toHaveCount(3)
  const { titles } = await stored(page)
  expect(titles).toEqual(['One', 'Two', 'Three'])
})

test('a window that is not writing shows no Remove', async ({ page, context }) => {
  await bookWithEmptied(page)
  await expect(removes(page)).toHaveCount(1)
  const url = page.url()
  const second = await context.newPage()
  await second.goto(url)
  await expect(second.getByText(/Write here/).first()).toBeVisible()
  await openContents(second)
  await expect(rows(second)).toHaveCount(3)
  await expect(removes(second)).toHaveCount(0)
  await expect(contents(second).locator('.contents-page').nth(1)).toBeVisible()
})

test('Remove works by keyboard, and the focus lands on the current chapter, not on nothing', async ({ page }) => {
  await bookWithEmptied(page)
  await removes(page).focus()
  await page.keyboard.press('Enter')
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).nth(0)).toBeFocused()
})
