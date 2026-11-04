import { expect, type Page, test } from '@playwright/test'

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
