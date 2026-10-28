import type { Page } from '@playwright/test'

/** Puts the caret at the end of the text. (End scrolls instead on macOS WebKit.) */
export async function caretToEnd(page: Page) {
  await page.locator('.body').focus()
  await page.evaluate(() => {
    const body = document.querySelector('.body')!
    const range = document.createRange()
    range.selectNodeContents(body.lastElementChild!)
    range.collapse(false)
    const s = getSelection()!
    s.removeAllRanges()
    s.addRange(range)
  })
}
