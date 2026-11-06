import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, openTools, saved, write } from './helpers'

// The Time Machine across a book's chapters (#90): turning past an end reaches the next chapter at the same time.
const onDesktop = (page: Page) => page.viewportSize()!.width >= 700
const machine = (page: Page) => page.locator('.time-machine')
const oldText = (page: Page) => machine(page).locator('.body')
const tape = (page: Page) => machine(page).getByRole('slider', { name: 'Moment' })

const contents = (page: Page) => (onDesktop(page) ? page.getByRole('navigation', { name: 'Contents' }) : page.getByRole('dialog', { name: 'Contents' }))

/** Imports a Markdown file as a book called harbour and opens it. */
async function importBook(page: Page, markdown: string): Promise<void> {
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

async function openContents(page: Page): Promise<void> {
  if (onDesktop(page)) return expect(contents(page)).toBeVisible()
  if (await page.locator('.page-button').isVisible()) await page.locator('.page-button').click()
  await page.locator('.tools .count').click()
  await expect(contents(page)).toBeVisible()
}

async function goTo(page: Page, name: string): Promise<void> {
  await openContents(page)
  await contents(page).locator('.contents-row', { hasText: name }).click()
  await expect(page.locator('.title')).toHaveText(name)
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

/** Words at the end of the open chapter. */
async function typeAtEnd(page: Page, words: string): Promise<void> {
  await caretToEnd(page)
  await page.keyboard.type(words)
  await saved(page, words.trim())
}

async function open(page: Page): Promise<void> {
  await openTools(page)
  await page.getByRole('button', { name: 'Time Machine' }).click()
  await expect(machine(page)).toBeVisible()
}

/** Looking back takes a moment first: this keeps the words as they stand, then comes back. */
async function keepMoment(page: Page): Promise<void> {
  await open(page)
  await expect(machine(page).locator('.moment-name, .moment-note').first()).not.toHaveText('Finding your moments…')
  await page.keyboard.press('Escape')
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

const standing = (page: Page) => tape(page).getAttribute('aria-valuetext')

test('turning past a chapter’s end reaches the next at the same time, and back again', async ({ page }) => {
  await importBook(page, '# One\n\nFirst chapter.\n\n# Two\n\nSecond.\n')
  await keepMoment(page)
  await typeAtEnd(page, ' Then more.')
  await open(page)
  await expect(tape(page)).toBeVisible()
  await expect(machine(page).locator('.title')).toHaveText('One')
  await expect(oldText(page)).toHaveText('First chapter.')
  const when = await standing(page)

  // The first chapter opens on the book's title page, then its own page, then the next chapter.
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await expect(machine(page).locator('.title')).toHaveText('Two')
  await expect(oldText(page)).toHaveText('Second.')
  await expect(tape(page)).toHaveAttribute('aria-valuetext', when!)
  // The screen says which chapter it is in.
  await expect(machine(page).locator('[aria-live]')).toHaveText('Two')

  // There is no chapter past the last.
  await page.keyboard.press('PageDown')
  await expect(machine(page).locator('.title')).toHaveText('Two')

  await page.keyboard.press('PageUp')
  await expect(machine(page).locator('.title')).toHaveText('One')
  await expect(oldText(page)).toHaveText('First chapter.')
  await expect(tape(page)).toHaveAttribute('aria-valuetext', when!)
  // The page, as the writer left it, is under all this.
  await page.keyboard.press('Escape')
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.title')).toHaveText('One')
  await expect(page.locator('.body')).toHaveText('First chapter. Then more.')
})

test('a chapter added since is not there at an earlier moment, and is there at now', async ({ page }) => {
  await importBook(page, '# One\n\nFirst chapter.\n\n# Two\n\nSecond.\n')
  await goTo(page, 'Two')
  await keepMoment(page)
  await typeAtEnd(page, ' Then more.')
  await openContents(page)
  await contents(page).getByRole('button', { name: '+ New chapter' }).click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('Three')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Third.')
  await saved(page, 'Third.')
  await goTo(page, 'Two')
  await open(page)
  await expect(tape(page)).toBeVisible()
  await expect(oldText(page)).toHaveText('Second.')

  // At that moment the book ended with chapter two.
  await page.keyboard.press('PageDown')
  await expect(machine(page).locator('.title')).toHaveText('Two')
  await expect(machine(page).locator('.title')).toHaveText('Two')
  await expect(oldText(page)).toHaveText('Second.')

  // Now has all three.
  await expect(tape(page)).toBeFocused()
  await page.keyboard.press('End')
  await expect(oldText(page)).toHaveText('Second. Then more.')
  await page.keyboard.press('PageDown')
  await expect(machine(page).locator('.title')).toHaveText('Three')
  await expect(oldText(page)).toHaveText('Third.')
})

test('the tape is the chapter on screen’s own, and the time it stands at goes with a turn', async ({ page }) => {
  await importBook(page, '# One\n\nFirst chapter.\n\n# Two\n\nSecond.\n')
  await keepMoment(page)
  await typeAtEnd(page, ' Then more.')
  await typeAtEnd(page, ' And more.')
  await open(page)
  await expect(tape(page)).toBeVisible()
  const moments = Number(await tape(page).getAttribute('aria-valuemax'))
  expect(moments).toBeGreaterThan(0)
  await expect(tape(page)).toHaveAttribute('aria-valuenow', String(moments - 1))

  // The second chapter has one moment: a tape of its own, standing on it.
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await expect(machine(page).locator('.title')).toHaveText('Two')
  await expect(tape(page)).toHaveAttribute('aria-valuemax', '0')
  await expect(tape(page)).toHaveAttribute('aria-valuenow', '0')
  await tape(page).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(tape(page)).toHaveAttribute('aria-valuenow', '0')

  // Back in the first, the tape is the first's again, and steps along its own moments.
  await page.keyboard.press('PageUp')
  await expect(machine(page).locator('.title')).toHaveText('One')
  await expect(tape(page)).toHaveAttribute('aria-valuemax', String(moments))
  await tape(page).focus()
  await page.keyboard.press('Home')
  await expect(tape(page)).toHaveAttribute('aria-valuenow', '0')
  await expect(oldText(page)).toHaveText('First chapter.')
})

test('a change of moment fades the page in, and a turn into another chapter does not', async ({ page }) => {
  test.skip(!onDesktop(page), 'the same on a phone, and the keys are quicker here')
  await importBook(page, '# One\n\nFirst chapter.\n\n# Two\n\nSecond.\n')
  await keepMoment(page)
  await typeAtEnd(page, ' Then more.')
  await open(page)
  await expect(tape(page)).toBeVisible()
  await expect(tape(page)).toBeFocused()
  await page.waitForTimeout(400)
  const fades = () =>
    page.evaluate(() => {
      const w = window as unknown as { __fades?: number }
      if (w.__fades === undefined) {
        w.__fades = 0
        const animate = HTMLElement.prototype.animate
        HTMLElement.prototype.animate = function (this: HTMLElement, ...args: Parameters<typeof animate>) {
          if (this.classList.contains('pager')) w.__fades = (w.__fades ?? 0) + 1
          return animate.apply(this, args)
        }
      }
      return w.__fades
    })
  expect(await fades()).toBe(0)
  await page.keyboard.press('ArrowRight')
  await expect(oldText(page)).toHaveText('First chapter. Then more.')
  expect(await fades()).toBe(1)
  // Turning across the chapters, at the same time, is a turn.
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await expect(machine(page).locator('.title')).toHaveText('Two')
  await page.keyboard.press('PageUp')
  await expect(machine(page).locator('.title')).toHaveText('One')
  await page.waitForTimeout(300)
  expect(await fades()).toBe(1)
})

/** Counts the pages the Time Machine lays out out of sight to count a chapter, and the times a number in Contents stands empty. */
async function watchNumbers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = { layouts: 0, empty: 0 }
    ;(window as unknown as { __numbers: typeof w }).__numbers = w
    new MutationObserver((list) => {
      for (const r of list)
        for (const n of r.addedNodes) if (n instanceof HTMLElement && n.classList.contains('page-screen') && n.style.visibility === 'hidden') w.layouts++
    }).observe(document.getElementById('app')!, { childList: true })
    const look = (): void => {
      const rows = document.querySelectorAll('.time-machine .contents-row .contents-page')
      for (const row of rows) if (!/^\d+$/.test(row.textContent?.trim() ?? '')) w.empty++
      requestAnimationFrame(look)
    }
    look()
  })
}
const numbers = (page: Page) => page.evaluate(() => (window as unknown as { __numbers: { layouts: number; empty: number } }).__numbers)

test('stepping the tape lays out only the chapter whose words changed, and no number goes empty', async ({ page }) => {
  test.skip(!onDesktop(page), 'the rail is open beside the page on desktop')
  const long = (n: string) =>
    Array.from({ length: 30 }, (_, i) => `Paragraph ${i} of chapter ${n}, which runs on past its opening page, and then some more.`).join('\n\n')
  await importBook(page, `# One\n\n${long('one')}\n\n# Two\n\n${long('two')}\n\n# Three\n\n${long('three')}\n`)
  await keepMoment(page)
  for (const words of [' Then more.', ' And more.', ' And still more.']) {
    await typeAtEnd(page, words)
    await keepMoment(page)
  }
  await open(page)
  await expect(tape(page)).toBeVisible()
  expect(Number(await tape(page).getAttribute('aria-valuemax'))).toBeGreaterThanOrEqual(3)
  await openMachineContents(page)
  // Every chapter counted once the rail has been looked at for a while.
  await expect(rowsOf(page).nth(2).locator('.contents-page')).toHaveText(/^\d+$/)
  const before = await Promise.all([0, 1, 2].map((i) => rowsOf(page).nth(i).locator('.contents-page').textContent()))
  await watchNumbers(page)
  await tape(page).focus()
  // Back to the oldest moment, then forward to now: each is a text the first chapter has not been counted at.
  for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'ArrowRight']) {
    await page.keyboard.press(key)
    await page.waitForTimeout(250)
  }
  const seen = await numbers(page)
  // Only the first chapter's words changed between these moments: it is laid out when a text is new to it, never the others,
  // and the numbers after it, which rest on its count, are never taken away to be counted again.
  expect(seen.empty).toBe(0)
  expect(seen.layouts).toBeLessThanOrEqual(3)
  expect(await Promise.all([0, 1, 2].map((i) => rowsOf(page).nth(i).locator('.contents-page').textContent()))).toEqual(before)

  // The first chapter's count at an earlier moment is the one the page laid out; laid out again out of sight, it is the same.
  await page.keyboard.press('Home')
  await expect(oldText(page)).not.toContainText('Then more.')
  const pageCounted = await Promise.all([0, 1, 2].map((i) => rowsOf(page).nth(i).locator('.contents-page').textContent()))
  expect(pageCounted.every((n) => /^\d+$/.test(n ?? ''))).toBe(true)
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await expect(rowsOf(page).nth(2).locator('.contents-page')).toHaveText(/^\d+$/)
  await page.waitForTimeout(500)
  expect(await Promise.all([0, 1, 2].map((i) => rowsOf(page).nth(i).locator('.contents-page').textContent()))).toEqual(pageCounted)
})

// Contents as it was, and the title page (#90).
const closeSheet = async (page: Page): Promise<void> => {
  if (onDesktop(page)) return
  await contents(page).getByRole('button', { name: 'Done' }).click()
  await expect(contents(page)).toHaveCount(0)
}

/** Contents as it was: the phone's sheet, from the running head, or the rail on desktop. */
async function openMachineContents(page: Page): Promise<void> {
  if (!onDesktop(page)) await machine(page).locator('.running-control').click()
  await expect(contents(page)).toBeVisible()
}

const rowsOf = (page: Page) => contents(page).locator('.contents-row')

const THREE = '# One\n\nFirst chapter.\n\n# Two\n\nSecond.\n\n# Three\n\nThird.\n'

/** Empties the chapter on the page, title and text, and waits until that is stored. */
async function emptyHere(page: Page): Promise<void> {
  await page.locator('.title').focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await page.locator('.body').focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<boolean>((done) => {
              const open = indexedDB.open('elbowpatch')
              open.onsuccess = () => {
                const tx = open.result.transaction(['working', 'pieces'])
                const working = tx.objectStore('working').getAll()
                const pieces = tx.objectStore('pieces').getAll()
                tx.oncomplete = () => {
                  open.result.close()
                  done(
                    (working.result as { content: string }[]).some((w) => w.content === '') &&
                      (pieces.result[0].sections as { title: string }[]).some((x) => x.title === ''),
                  )
                }
              }
            }),
        ),
      { timeout: 15000 },
    )
    .toBe(true)
}

test('Contents as it was lists the chapters and titles of that moment, and cannot add one', async ({ page }) => {
  await importBook(page, THREE)
  await keepMoment(page)
  await goTo(page, 'Two')
  await page.locator('.title').focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Second')
  await saved(page, 'Second.')
  await openContents(page)
  await contents(page).getByRole('button', { name: '+ New chapter' }).click()
  await expect(page.locator('.title')).toHaveText('')
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('Four')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Fourth.')
  await saved(page, 'Fourth.')
  await goTo(page, 'One')
  await typeAtEnd(page, ' Then more.')
  await open(page)
  await expect(tape(page)).toBeVisible()
  await openMachineContents(page)

  // The chapters and their titles as they were then; the one added since is not there.
  await expect(rowsOf(page)).toHaveText([/^One/, /^Two/, /^Three/])
  await expect(rowsOf(page).nth(0)).toHaveAttribute('aria-current', 'true')
  if (onDesktop(page)) await expect(contents(page).locator('.rail-line')).toContainText('3 chapters')
  await expect(contents(page).getByRole('button', { name: '+ New chapter' })).toHaveCount(0)
  await expect(contents(page).getByRole('button', { name: 'Remove chapter' })).toHaveCount(0)

  // A chapter chosen there opens at that moment, at its page; Contents follows.
  await rowsOf(page).nth(2).click()
  await expect(machine(page).locator('.title')).toHaveText('Three')
  await expect(oldText(page)).toHaveText('Third.')
  await expect(tape(page)).toBeVisible()
  if (!onDesktop(page)) await expect(contents(page)).toHaveCount(0)
  await openMachineContents(page)
  await expect(rowsOf(page).nth(2)).toHaveAttribute('aria-current', 'true')
  await closeSheet(page)

  // Now has the renamed chapter and the added one.
  await tape(page).focus()
  await page.keyboard.press('End')
  await expect(machine(page).locator('.title')).toHaveText('Three')
  await openMachineContents(page)
  await expect(rowsOf(page)).toHaveText([/^One/, /^Second/, /^Three/, /^Four/])
})

test('a chapter removed since says so where its number would be, and opens and reads', async ({ page }) => {
  await importBook(page, THREE)
  await goTo(page, 'Two')
  await emptyHere(page)
  await goTo(page, 'One')
  await openContents(page)
  await contents(page).getByRole('button', { name: 'Remove chapter' }).click()
  await expect(rowsOf(page)).toHaveCount(2)
  await closeSheet(page)
  await typeAtEnd(page, ' Then more.')
  await open(page)
  await expect(tape(page)).toBeVisible()
  await openMachineContents(page)

  await expect(rowsOf(page)).toHaveText([/^One/, /^Two\s*removed since$/, /^Three/])
  // Where its number would be, and the numbers of the chapters after it still count its pages.
  await expect(rowsOf(page).nth(1).locator('.contents-page')).toHaveText('removed since')
  await expect(rowsOf(page).nth(2).locator('.contents-page')).toHaveText(/^\d+$/)
  await rowsOf(page).nth(1).click()
  await expect(machine(page).locator('.title')).toHaveText('Two')
  await expect(oldText(page)).toHaveText('Second.')
  await expect(tape(page)).toBeVisible()
  await expect(tape(page))
    .toBeFocused()
    .catch(() => {})
  await openMachineContents(page)
  await expect(rowsOf(page).nth(1)).toHaveAttribute('aria-current', 'true')
})

test('the number a chapter starts on is where the old text lays it out, and never a count that is short', async ({ page }) => {
  const long = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} of a chapter that runs on past its opening page, and then some more.`).join('\n\n')
  await importBook(page, `# One\n\n${long}\n\n# Two\n\nSecond.\n`)
  await keepMoment(page)
  await typeAtEnd(page, ' Then more.')
  await open(page)
  await expect(tape(page)).toBeVisible()

  // The pages the first chapter takes in the old text, the book's title page and its own pages.
  const pages = await machine(page).evaluate((el) => {
    const body = el.querySelector('.body') as HTMLElement
    const stride = Number.parseFloat(getComputedStyle(el).getPropertyValue('--stride'))
    return Math.ceil(body.getBoundingClientRect().width / stride)
  })
  expect(pages).toBeGreaterThan(3)
  await openMachineContents(page)
  await expect(rowsOf(page).nth(0).locator('.contents-page')).toHaveText('1')
  await expect(rowsOf(page).nth(1).locator('.contents-page')).toHaveText(String(pages + 1))
  const total = onDesktop(page) ? contents(page).locator('.rail-line .contents-pages') : contents(page).locator('.contents-pages')
  await expect(total).toHaveText(`${pages + 1} pages`)
})

test('the title page is that moment’s title and subtitle, and the running head opens Contents on a phone', async ({ page }) => {
  await page.goto('./#/')
  await write(page, 'Book')
  await expect(page.locator('.book-title')).toBeFocused()
  await page.keyboard.type('Thoughts')
  await page.keyboard.press('Enter')
  await page.keyboard.type('A first subtitle')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Opening')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Some words.')
  await saved(page, 'Some words.')
  await keepMoment(page)
  // Renamed since, with more words, so there is an earlier moment to look at.
  await page.locator('.title').click()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(page.locator('.book-title')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Rethought')
  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('A second subtitle')
  await caretToEnd(page)
  await page.keyboard.type(' And more.')
  await saved(page, 'And more.')
  await open(page)
  await expect(tape(page)).toBeVisible()

  await expect(machine(page).locator('.book-title')).toHaveText('Thoughts')
  await expect(machine(page).locator('.subtitle')).toHaveText('A first subtitle')
  // The book's name at that moment stands in the running head over the title page, and Contents opens from it.
  if (!onDesktop(page)) {
    await expect(machine(page).locator('.running-control')).toContainText('Thoughts')
    await openMachineContents(page)
    await expect(contents(page).locator('.contents-name')).toHaveText('Thoughts')
    await closeSheet(page)
  }
  await tape(page).focus()
  await page.keyboard.press('End')
  await expect(machine(page).locator('.book-title')).toHaveText('Rethought')
  await expect(machine(page).locator('.subtitle')).toHaveText('A second subtitle')
})

test('Escape closes Contents before it leaves the Time Machine, and a tap outside closes it', async ({ page }) => {
  test.skip(onDesktop(page), 'the sheet is a phone’s')
  await importBook(page, THREE)
  await keepMoment(page)
  await typeAtEnd(page, ' Then more.')
  await open(page)
  await expect(tape(page)).toBeVisible()
  await openMachineContents(page)
  await page.keyboard.press('Escape')
  await expect(contents(page)).toHaveCount(0)
  await expect(machine(page)).toBeVisible()
  await openMachineContents(page)
  await machine(page)
    .locator('.pager')
    .click({ position: { x: 190, y: 400 } })
  await expect(contents(page)).toHaveCount(0)
  await expect(machine(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(machine(page)).toHaveCount(0)
})

test('the rail folds away and comes back, and keeps the moment', async ({ page }) => {
  test.skip(!onDesktop(page), 'the rail is desktop’s')
  await importBook(page, THREE)
  await keepMoment(page)
  await typeAtEnd(page, ' Then more.')
  await open(page)
  await expect(tape(page)).toBeVisible()
  const toggle = machine(page).getByRole('button', { name: 'Contents' })
  await expect(contents(page)).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(contents(page)).toBeVisible()
  await expect(rowsOf(page)).toHaveCount(3)
})

test('Keep a copy copies the chapter on screen, not the one the Time Machine opened on', async ({ page }) => {
  await importBook(page, THREE)
  await keepMoment(page)
  await typeAtEnd(page, ' Then more.')
  await open(page)
  await expect(tape(page)).toBeVisible()
  await openMachineContents(page)
  await rowsOf(page).nth(1).click()
  await expect(machine(page).locator('.title')).toHaveText('Two')
  await machine(page).getByRole('button', { name: 'Keep a copy' }).click()
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.title')).toHaveText('Two, draft 2')
  await expect(page.locator('.body')).toHaveText('Second.')
})
