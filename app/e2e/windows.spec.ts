import { expect, test } from '@playwright/test'
import { caretToEnd } from './helpers'

test('a second window opens the piece read-only, and Write here hands it over', async ({ page, context }) => {
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('Two windows')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Written in the first.')
  await page.waitForTimeout(1300) // stored once typing pauses

  const second = await context.newPage()
  await second.goto(page.url())
  await expect(second.getByRole('status').filter({ hasText: 'Open in another window' })).toBeVisible()
  await expect(second.locator('.body')).toHaveAttribute('contenteditable', 'false')

  // Words typed a moment before the other window takes over are not lost.
  await page.keyboard.type(' Last words here.')
  await second.getByRole('button', { name: 'Write here' }).click()
  // The first window saved before letting go; the second starts from it.
  await expect(second.locator('.body')).toContainText('Written in the first. Last words here.')
  await expect(second.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await expect(page.getByRole('status').filter({ hasText: 'Open in another window' })).toBeVisible()
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'false')

  await caretToEnd(second)
  await second.keyboard.type(' And in the second.')
  await second.waitForTimeout(1300)
  await second.reload()
  await expect(second.locator('.body')).toContainText('Last words here. And in the second.')
})
