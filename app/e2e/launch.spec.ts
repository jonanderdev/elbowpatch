import { expect, test } from '@playwright/test'

// A launch the service worker cannot answer: the first after installing, or after the browser cleared it.
test.use({ serviceWorkers: 'block' })

test('on a slow launch the launch screen shows, and stays long enough to read', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (r) => asked.push(r.url()))
  await page.route('**/assets/index-*', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.continue()
  })
  await page.addInitScript(() => {
    const seen = window as unknown as { shown?: number; gone?: number }
    requestAnimationFrame(() => {
      seen.shown = performance.now()
    })
    new MutationObserver(() => {
      if (document.getElementById('launch')?.hidden) seen.gone ??= performance.now()
    }).observe(document, { subtree: true, attributes: true })
  })

  await page.goto('./')
  await expect(page.locator('#launch')).toBeHidden()

  const onScreen = await page.evaluate(() => {
    const { shown, gone } = window as unknown as { shown: number; gone: number }
    return gone - shown
  })
  expect(onScreen).toBeGreaterThan(900)
  // The mark comes with the page, so it needs no second trip to the network.
  expect(asked.filter((url) => url.includes('launch-mark'))).toEqual([])
})
