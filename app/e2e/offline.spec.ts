import { expect, test } from '@playwright/test'
import { caretToEnd, saved } from './helpers'

test('opens and keeps writing with no network', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('Offline')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Written on a train.')
  await saved(page, 'Written on a train.')

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.body')).toContainText('Written on a train.')
  // The fonts came from the app, not the network.
  expect(await page.evaluate(() => document.fonts.check('360 18px Literata'))).toBe(true)
  await caretToEnd(page)
  await page.keyboard.type(' Still writing.')
  await saved(page, 'Still writing.')
  await page.reload()
  await expect(page.locator('.body')).toContainText('Still writing.')
})
