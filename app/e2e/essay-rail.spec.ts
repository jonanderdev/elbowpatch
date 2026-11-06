import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, saved } from './helpers'

// An essay's pages in the rail on desktop (#80): each by its first words, the page on screen tinted.

const PARAGRAPH =
  'The windows of the shop had been salted white by the first storm of November, and Ana scraped a small square clear each morning before she unlocked the door.'
const long = (paragraphs: number) => Array.from({ length: paragraphs }, (_, i) => `${i + 1}. ${PARAGRAPH}`).join('\n\n')

const ESSAY = `# The second draft\n\nNobody remembers the first draft.\n\n${long(24)}\n`

const desktopOnly = (page: Page) => test.skip(page.viewportSize()!.width < 700, 'The rail is on desktop only')

const rail = (page: Page) => page.getByRole('navigation', { name: 'Pages' })
const toggle = (page: Page) => page.getByRole('button', { name: 'Pages', exact: true })
const rows = (page: Page) => page.locator('.pages-rail .contents-row')
const row = (page: Page, n: number) => rows(page).nth(n - 1)

/** Imports a Markdown file as an essay and opens it. */
async function importEssay(page: Page, markdown = ESSAY) {
  await page.goto('./#/settings/export')
  await page.locator('input[type=file]').evaluate((el: HTMLInputElement, text) => {
    const files = new DataTransfer()
    files.items.add(new File([text], 'draft.md', { type: 'text/markdown' }))
    el.files = files.files
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, markdown)
  await page.getByRole('dialog', { name: 'Import' }).getByRole('button', { name: 'Import' }).click()
  await expect(page.getByText('1 piece added.')).toBeVisible()
  await page.goto('./#/')
  await page.locator('.row', { hasText: 'The second draft' }).click()
  await expect(page.locator('.title')).toHaveText('The second draft')
}

/** The page in view, from 1, as the pager scrolled to it. */
const pageInView = (page: Page) =>
  page.evaluate(() => {
    const pager = document.querySelector<HTMLElement>('.pager')!
    return Math.round(pager.scrollLeft / Number.parseFloat(getComputedStyle(pager).getPropertyValue('--stride'))) + 1
  })

/** The text at the top left of the page in view, found by where it is drawn: the first line's words. */
const topLine = (page: Page) =>
  page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('.body')!
    const pager = document.querySelector<HTMLElement>('.pager')!.getBoundingClientRect()
    const range = document.createRange()
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      for (let i = 0; i < t.length; i++) {
        range.setStart(t, i)
        range.setEnd(t, i + 1)
        const box = range.getClientRects()[0]
        if (box && box.width > 0 && box.left >= pager.left - 1 && box.right <= pager.right + 1 && t.data[i]?.trim()) return t.data.slice(i, i + 60)
      }
    }
    return ''
  })

test('an essay shows its pages by their first words, and says the words and pages', async ({ page }) => {
  desktopOnly(page)
  await importEssay(page)
  await expect(rail(page)).toBeVisible()
  await expect(row(page, 1).locator('.contents-title')).toHaveText('Nobody remembers')
  await expect(row(page, 1)).toHaveAttribute('aria-current', 'true')

  const count = await rows(page).count()
  expect(count).toBeGreaterThan(2)
  await expect(page.locator('.pages-rail .rail-line')).toHaveText(/^\d+ words · \d+ pages$/)
  const head = (await page.locator('.head .count').first().textContent()) ?? ''
  const [, words] = head.match(/(\d[\d.]*) words/) ?? []
  await expect(page.locator('.pages-rail .rail-line')).toHaveText(`${words} words · ${count} pages`)

  // Each row is the words the page really starts with, as drawn there.
  for (let n = 2; n <= count; n++) {
    await page.keyboard.press('PageDown')
    await expect.poll(() => pageInView(page)).toBe(n)
    const label = (await row(page, n).locator('.contents-title').textContent()) ?? ''
    expect(label.length).toBeGreaterThan(0)
    expect(await topLine(page)).toContain(label)
    await expect(row(page, n)).toHaveAttribute('aria-current', 'true')
  }
})

test('a row turns to its page, and the row before lets go of the tint', async ({ page }) => {
  desktopOnly(page)
  await importEssay(page)
  await row(page, 3).click()
  await expect.poll(() => pageInView(page)).toBe(3)
  await expect(row(page, 3)).toHaveAttribute('aria-current', 'true')
  await expect(row(page, 1)).not.toHaveAttribute('aria-current', 'true')
  await expect(page.locator('.head')).toContainText('3 of')
})

test('a row pressed while writing takes the caret along: the next word lands on that page', async ({ page }) => {
  desktopOnly(page)
  await importEssay(page)
  await page.locator('.body p').first().click()
  await expect(page.locator('.body')).toBeFocused()
  await row(page, 2).click()
  await expect.poll(() => pageInView(page)).toBe(2)
  await expect(page.locator('.body')).toBeFocused()
  await page.keyboard.type('Zebra ')
  await saved(page, 'Zebra')
  // Words added at the foot of a page can carry it on to the next, but never back to where the caret was.
  expect(await pageInView(page)).toBeGreaterThanOrEqual(2)
  const onPage = await page.evaluate(() => {
    const pager = document.querySelector<HTMLElement>('.pager')!.getBoundingClientRect()
    const box = getSelection()!.getRangeAt(0).getBoundingClientRect()
    return box.left >= pager.left && box.right <= pager.right
  })
  expect(onPage).toBe(true)
})

test('the first words follow the writing, on a later page too', async ({ page }) => {
  desktopOnly(page)
  await importEssay(page)
  const before = await row(page, 1).locator('.contents-title').textContent()
  const second = await row(page, 2).locator('.contents-title').textContent()
  await page.locator('.body p').first().click()
  await page.evaluate(() => {
    const p = document.querySelector('.body p')!
    getSelection()!.collapse(p, 0)
  })
  await page.keyboard.type('Everybody ')
  await expect(row(page, 1).locator('.contents-title')).toHaveText(/^Everybody/)
  expect(before).not.toMatch(/^Everybody/)
  // Enough new lines on the first page to move the start of the second.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(row(page, 2).locator('.contents-title')).not.toHaveText(second ?? '')
})

test('a page added by writing gets its row', async ({ page }) => {
  desktopOnly(page)
  await importEssay(page)
  const count = await rows(page).count()
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await caretToEnd(page)
  await page.keyboard.press('Enter')
  await page.keyboard.insertText(PARAGRAPH.repeat(12))
  await expect(rows(page)).toHaveCount(count + 1)
  await expect.poll(() => pageInView(page)).toBe(count + 1)
  const label =
    (await row(page, count + 1)
      .locator('.contents-title')
      .textContent()) ?? ''
  expect(await topLine(page)).toContain(label)
})

test('an empty essay has one page, with nothing on it yet', async ({ page }) => {
  desktopOnly(page)
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await expect(page.locator('.pages-rail .rail-line')).toHaveText('0 words · 1 page')
  await expect(rows(page)).toHaveCount(1)
  await expect(row(page, 1).locator('.contents-title')).toHaveText('Nothing yet')
})

test('the rail folds and opens and the text never moves, and it stays folded', async ({ page }) => {
  desktopOnly(page)
  await importEssay(page)
  const box = () => page.locator('.pager').boundingBox()
  const open = await box()
  await toggle(page).click()
  await expect(rail(page)).toBeHidden()
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
  expect(await box()).toEqual(open)

  await page.reload()
  await expect(page.locator('.title')).toHaveText('The second draft')
  await expect(rail(page)).toBeHidden()
  await toggle(page).click()
  await expect(rail(page)).toBeVisible()
  await expect(row(page, 1)).toBeVisible()
  expect(await box()).toEqual(open)
})

test('the keyboard reaches every page, and Escape goes back to the toggle', async ({ page, browserName }) => {
  desktopOnly(page)
  await importEssay(page)
  await toggle(page).focus()
  const count = await rows(page).count()
  for (let n = 1; n <= count; n++) {
    // Safari on a Mac tabs to buttons with Option held, unless the writer has turned on full keyboard access.
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
    await expect(row(page, n)).toBeFocused()
    await expect(row(page, n)).toHaveAccessibleName(new RegExp(`^Page ${n}: `))
  }
  await page.keyboard.press('Enter')
  await expect.poll(() => pageInView(page)).toBe(count)
  await expect(row(page, count)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(toggle(page)).toBeFocused()
  await expect(rail(page)).toBeVisible()
})

test('with no room beside the text the rail opens over it, for that page alone', async ({ page, browserName }) => {
  desktopOnly(page)
  await page.setViewportSize({ width: 1000, height: 800 })
  await importEssay(page)
  await expect(rail(page)).toBeHidden()
  const box = await page.locator('.pager').boundingBox()

  // Escape lets it go, and the focus returns to the toggle.
  await toggle(page).click()
  await expect(rail(page)).toBeVisible()
  expect(await page.locator('.pager').boundingBox()).toEqual(box)
  await toggle(page).focus()
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
  await expect(row(page, 1)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(rail(page)).toBeHidden()
  await expect(toggle(page)).toBeFocused()

  // A row pressed turns to its page, and the rail goes with the page it opened over.
  await toggle(page).click()
  await row(page, 2).click()
  await expect.poll(() => pageInView(page)).toBe(2)
  await expect(rail(page)).toBeHidden()

  // By keyboard too, and the focus is not lost with the row it was on.
  await toggle(page).focus()
  await page.keyboard.press('Enter')
  await expect(rail(page)).toBeVisible()
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
  await page.keyboard.press('Enter')
  await expect.poll(() => pageInView(page)).toBe(1)
  await expect(rail(page)).toBeHidden()
  await expect(toggle(page)).toBeFocused()
})

test('a long essay keeps the page on screen in view in the rail, going on and back', async ({ page }) => {
  desktopOnly(page)
  await page.setViewportSize({ width: 1440, height: 800 })
  await importEssay(page, `# The second draft\n\nNobody remembers the first draft.\n\n${long(220)}\n`)
  const last = (await rows(page).count()) - 1
  expect(last).toBeGreaterThan(20)
  await page.locator('.body p').first().click()
  for (let n = 0; n < last; n++) await page.keyboard.press('PageDown')
  await expect(row(page, last + 1)).toHaveAttribute('aria-current', 'true')
  await expect(row(page, last + 1)).toBeInViewport()
  for (let n = 0; n < last; n++) await page.keyboard.press('PageUp')
  await expect(row(page, 1)).toHaveAttribute('aria-current', 'true')
  await expect(row(page, 1)).toBeInViewport()
})

test('a phone has no rail: the essay stays as it was', async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 700, 'The phone has no rail')
  await importEssay(page)
  await expect(rail(page)).toHaveCount(0)
  await expect(toggle(page)).toHaveCount(0)
})
