import { expect, type Page, test } from '@playwright/test'
import { saved } from './helpers'

// Turning from one chapter to the next (#58): the book reads straight through.

const PARAGRAPH =
  'The windows of the shop had been salted white by the first storm of November, and Ana scraped a small square clear each morning before she unlocked the door.'
const long = (paragraphs: number) => Array.from({ length: paragraphs }, (_, i) => `${i + 1}. ${PARAGRAPH}`).join('\n\n')

/** The first two chapters run over several pages; the last is one page. */
const THREE = `# One\n\n${long(12)}\n\n# Two\n\n${long(12)}\n\n# Three\n\nThe end.\n`

/** Imports a Markdown file as a book and opens it. */
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

/** The page in view in the open chapter, from 0, and how many it has, as they are laid out. */
const position = (page: Page) =>
  page.evaluate(() => {
    const pager = document.querySelector<HTMLElement>('.pager')!
    const stride = parseFloat(getComputedStyle(pager).getPropertyValue('--stride'))
    const columns = document.querySelector<HTMLElement>('.body')!
    return { at: Math.round(pager.scrollLeft / stride), count: Number(columns.style.columnCount) }
  })

/** Turns on, by Page Down, to the last page of the open chapter. */
async function toLastPage(page: Page) {
  await expect
    .poll(async () => {
      const { at, count } = await position(page)
      if (at === count - 1 && count > 1) return true
      await page.keyboard.press('PageDown')
      return false
    })
    .toBe(true)
}

const title = (page: Page) => page.locator('.title')

/** The caret in the text, once this window is the one writing. */
async function intoText(page: Page) {
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await page.locator('.body').focus()
}

/** A sideways swipe, as the page hears it: left turns on, right turns back. */
const swipe = (page: Page, dx: number) =>
  page.locator('.page-screen').evaluate((el, dx) => {
    const touch = (clientX: number) => ({ clientX, clientY: 300 })
    const send = (type: string, x: number) =>
      el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { touches: [touch(x)], changedTouches: [touch(x)] }))
    send('touchstart', 200)
    send('touchend', 200 + dx)
  }, dx)

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

const desktopOnly = (page: Page) => test.skip(page.viewportSize()!.width < 700, 'desktop margins and caret')
const phoneOnly = (page: Page) => test.skip(page.viewportSize()!.width >= 700, "a swipe is a phone's turn")

test("turning past a chapter's last page opens the next chapter's opening page", async ({ page }) => {
  await importBook(page, THREE)
  await toLastPage(page)
  await expect(title(page)).toHaveText('One')
  await page.keyboard.press('PageDown')
  await expect(title(page)).toHaveText('Two')
  await expect(title(page)).toBeInViewport()
  expect((await position(page)).at).toBe(0)
})

test("turning back from a chapter's opening page opens the last page of the chapter before it, with the caret at its end", async ({ page }) => {
  await importBook(page, THREE)
  await toLastPage(page)
  await page.keyboard.press('PageDown')
  await expect(title(page)).toHaveText('Two')
  await page.keyboard.press('PageUp')
  await expect(title(page)).toHaveText('One')
  await expect.poll(() => position(page).then(({ at, count }) => count > 1 && at === count - 1)).toBe(true)
  await expect(page.locator('.body p').last()).toBeInViewport()
})

test("turning back from chapter 1's first page reaches the title page; turning on from the book's last page does nothing", async ({ page }) => {
  await importBook(page, THREE)
  await page.keyboard.press('PageDown')
  await expect(title(page)).toBeInViewport()
  await page.keyboard.press('PageUp')
  await expect(page.locator('.book-title')).toBeInViewport()
  await page.keyboard.press('PageUp')
  await expect(page.locator('.book-title')).toBeInViewport()
  await expect(title(page)).toHaveText('One')

  await toLastPage(page)
  await page.keyboard.press('PageDown')
  await expect(title(page)).toHaveText('Two')
  await toLastPage(page)
  await page.keyboard.press('PageDown')
  await expect(title(page)).toHaveText('Three')
  await expect(page.locator('.body')).toHaveText('The end.')
  await page.keyboard.press('PageDown')
  await page.keyboard.press('Alt+ArrowRight')
  // Long enough for a page that was going to open to have opened.
  await page.waitForTimeout(300)
  await expect(title(page)).toHaveText('Three')
})

test('Alt + arrows cross chapters both ways', async ({ page }) => {
  await importBook(page, THREE)
  await toLastPage(page)
  await page.keyboard.press('Alt+ArrowRight')
  await expect(title(page)).toHaveText('Two')
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(title(page)).toHaveText('One')
})

test('a swipe crosses chapters both ways, and does not raise the keyboard', async ({ page }) => {
  phoneOnly(page)
  await importBook(page, THREE)
  await toLastPage(page)
  await swipe(page, -120)
  await expect(title(page)).toHaveText('Two')
  await expect(page.locator('.body')).not.toBeFocused()
  await swipe(page, 120)
  await expect(title(page)).toHaveText('One')
  await expect.poll(() => position(page).then(({ at, count }) => count > 1 && at === count - 1)).toBe(true)
  await expect(page.locator('.body')).not.toBeFocused()
})

test('with the keyboard up a swipe across chapters keeps the keyboard, the bar and the caret', async ({ page }) => {
  phoneOnly(page)
  await importBook(page, THREE)
  await intoText(page)
  await toLastPage(page)
  await page.setViewportSize({ width: 390, height: 500 })
  await expect(page.locator('.writing-bar')).toBeVisible()
  await swipe(page, -120)
  await expect(title(page)).toHaveText('Two')
  await expect(page.locator('.page-screen')).toHaveAttribute('data-keyboard')
  await expect(page.locator('.body')).toBeFocused()
  await expect(page.locator('.writing-bar')).toBeVisible()
})

test('with reduced motion a turn across chapters is the same cut', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await importBook(page, THREE)
  await toLastPage(page)
  await page.keyboard.press('PageDown')
  await expect(title(page)).toHaveText('Two')
  await expect(title(page)).toBeInViewport()
})

test("margin hints show a turn is possible across a chapter's end, and a click there crosses", async ({ page }) => {
  desktopOnly(page)
  await importBook(page, THREE)
  await toLastPage(page)
  const col = (await page.locator('.pager').boundingBox())!
  const right = { x: col.x + col.width + 200, y: col.y + 200 }
  const left = { x: col.x - 200, y: col.y + 200 }
  const hint = () => page.locator('.page-screen').getAttribute('data-turn')

  await page.mouse.move(right.x, right.y)
  await expect.poll(hint).toBe('on')
  await page.mouse.click(right.x, right.y)
  await expect(title(page)).toHaveText('Two')
  // The arrow holds through the turn, so clicking through pages never flickers it.
  await expect.poll(hint).toBe('on')

  // On a chapter's opening page, the arrow still points back.
  await page.mouse.move(left.x, left.y)
  await expect.poll(hint).toBe('back')
  await page.mouse.click(left.x, left.y)
  await expect(title(page)).toHaveText('One')

  // The book's last page: no way on, and a click does nothing.
  await page.mouse.move(right.x, right.y)
  await page.mouse.click(right.x, right.y)
  await expect(title(page)).toHaveText('Two')
  await toLastPage(page)
  await page.mouse.click(right.x + 1, right.y)
  await expect(title(page)).toHaveText('Three')
  await page.mouse.move(right.x, right.y)
  await expect.poll(hint).toBe('')
  await page.mouse.click(right.x, right.y)
  await page.waitForTimeout(300)
  await expect(title(page)).toHaveText('Three')
})

test('the caret goes with the writer: to the end of the opening page turned to, to the end of the chapter turned back to', async ({ page }) => {
  desktopOnly(page)
  await importBook(page, THREE)
  await toLastPage(page)
  await page.keyboard.press('PageDown')
  await expect(title(page)).toHaveText('Two')
  await expect(page.locator('.body')).toBeFocused()
  await page.keyboard.type('ONWARD')
  const onward = page.locator('.body').getByText('ONWARD')
  await expect(onward).toBeInViewport()
  expect((await position(page)).at).toBe(0)
  // Not at the start of the text: where a turn leaves it, at the end of the text on the page.
  await expect(page.locator('.body p').first()).not.toContainText('ONWARD')

  await page.keyboard.press('PageUp')
  await expect(title(page)).toHaveText('One')
  await expect(page.locator('.body')).toBeFocused()
  await page.keyboard.type(' BACK')
  await expect(page.locator('.body p').last()).toHaveText(/ BACK$/)
})

test('a screen reader hears the chapter it turned into, both ways', async ({ page }) => {
  await importBook(page, THREE)
  await toLastPage(page)
  const said = page.locator('.page-screen > [aria-live]')
  await page.keyboard.press('PageDown')
  await expect(title(page)).toHaveText('Two')
  await expect(said).toHaveText('Two')
  await page.keyboard.press('PageUp')
  await expect(title(page)).toHaveText('One')
  await expect(said).toHaveText('One')
})

test('the chapter being left is saved first, and the place follows the writer', async ({ page }) => {
  await importBook(page, THREE)
  await intoText(page)
  await toLastPage(page)
  await page.keyboard.type(' Typed at the last moment.')
  await page.keyboard.press('PageDown')
  await expect(title(page)).toHaveText('Two')
  await saved(page, 'Typed at the last moment.')
  await expect.poll(() => placeIn(page)).toBe('Two')
  await page.reload()
  await expect(title(page)).toHaveText('Two')

  await page.keyboard.press('PageUp')
  await expect(title(page)).toHaveText('One')
  await expect(page.locator('.body')).toContainText('Typed at the last moment.')
  await expect.poll(() => placeIn(page)).toBe('One')
  await page.reload()
  await expect(title(page)).toHaveText('One')
  // Back on the last page, where they left off.
  await expect.poll(() => position(page).then(({ at, count }) => count > 1 && at === count - 1)).toBe(true)
})

test('a window that is not writing can turn through the chapters, and leaves the place alone', async ({ page, context }) => {
  await importBook(page, THREE)
  const second = await context.newPage()
  await second.goto(page.url())
  await expect(second.getByRole('status').filter({ hasText: 'Open in another window' })).toBeVisible()
  await toLastPage(second)
  await second.keyboard.press('PageDown')
  await expect(title(second)).toHaveText('Two')
  await expect(second.locator('.body')).toHaveAttribute('contenteditable', 'false')
  await second.keyboard.press('PageUp')
  await expect(title(second)).toHaveText('One')
  await expect.poll(() => position(second).then(({ at, count }) => count > 1 && at === count - 1)).toBe(true)
  await expect.poll(() => placeIn(second)).not.toBe('Two')
})

test("a selection stops at the chapter's end", async ({ page }) => {
  await importBook(page, THREE)
  await intoText(page)
  await toLastPage(page)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Shift+PageDown')
  await page.keyboard.press('Shift+PageDown')
  await page.waitForTimeout(300)
  await expect(title(page)).toHaveText('One')
  await expect(page.locator('.body')).toBeFocused()
})

test('Page Down held down runs on through the chapters, however slow the store', async ({ page }) => {
  await importBook(page, THREE)
  await page.evaluate(() => {
    // A store slower than the key repeats.
    const transaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<typeof transaction>) {
      const until = performance.now() + 25
      while (performance.now() < until);
      return transaction.apply(this, args)
    } as typeof transaction
    setInterval(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', repeat: true, bubbles: true })), 10)
  })
  await expect(title(page)).toHaveText('Three', { timeout: 15000 })
})
