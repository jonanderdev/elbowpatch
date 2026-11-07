import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, openTools, saved } from './helpers'

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

// A PDF is made from code and fonts that are not part of the install (docs/decisions/0019).
const OFFLINE = 'PDF needs a connection the first time. Nothing has changed.'
const FAILED = 'Couldn’t make the PDF just now. Nothing has changed; try again.'
const WORDS = 'Written on a train, and nobody asked why.'
const PDF_CODE = /\/assets\/(pdf|makePdf)-[^/]*\.js/

async function essay(page: Page, worker = true): Promise<void> {
  await page.goto('./')
  if (worker) await page.evaluate(() => navigator.serviceWorker.ready)
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('On a train')
  await page.keyboard.press('Enter')
  await page.keyboard.type(WORDS)
  await saved(page, WORDS)
}

async function openExport(page: Page): Promise<void> {
  await openTools(page)
  await page.getByRole('button', { name: 'Export' }).filter({ visible: true }).first().click()
}

/** What making a PDF must leave as it was: the stored words and the last export date. (Moments are made by the page's own timing.) */
const kept = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const all = open.result.transaction('working').objectStore('working').getAll()
          all.onsuccess = () => {
            open.result.close()
            const working = (all.result as { sectionId: string; content: string }[]).map((w) => [w.sectionId, w.content])
            done(JSON.stringify({ lastExport: localStorage.getItem('elbowpatch.lastExport'), working }))
          }
        }
      }),
  )

/** The addresses held by each cache the service worker keeps. */
const cached = (page: Page) =>
  page.evaluate(async () => {
    const out: Record<string, string[]> = {}
    for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname)
    return out
  })

// The page's own requests are the ones stopped, so no browser lets the worker's fetch round the block.
test.describe('with no worker to fetch for the page', () => {
  test.use({ serviceWorkers: 'block' })

  test('a first PDF offline says so, and nothing changes', async ({ page, context }) => {
    await essay(page, false)
    const before = await kept(page)
    await openExport(page)
    await context.setOffline(true)
    await page.getByRole('button', { name: /PDF/ }).click()
    // The line is a status, so a screen reader hears it.
    await expect(page.getByRole('status').filter({ hasText: OFFLINE })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible()
    expect(await kept(page)).toBe(before)
  })

  test('when the PDF cannot be made it says so, and trying again works', async ({ page, context }) => {
    test.setTimeout(90_000)
    await essay(page, false)
    const before = await kept(page)
    await context.route(PDF_CODE, (route) => route.abort())
    await openExport(page)
    await page.getByRole('button', { name: /PDF/ }).click()
    await expect(page.getByRole('status').filter({ hasText: FAILED })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible()
    expect(await kept(page)).toBe(before)

    await context.unroute(PDF_CODE)
    const download = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: /PDF/ }).click()
    expect((await download).suggestedFilename()).toBe('On a train.pdf')
    await expect(page.getByRole('status').filter({ hasText: 'Saved as On a train.pdf.' })).toBeVisible()
  })

  test('a font that fails to load, and the code failing again, still let a later try work', async ({ page, context }) => {
    test.setTimeout(120_000)
    await essay(page, false)
    const says = (text: string) => expect(page.getByRole('status').filter({ hasText: text })).toBeVisible()
    await openExport(page)

    // Each try at the code fails the same way; each is a new try, not the first one remembered.
    await context.route(PDF_CODE, (route) => route.abort())
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: /PDF/ }).click()
      await says(FAILED)
    }
    await context.unroute(PDF_CODE)

    // The code arrives but a font does not.
    await context.route(/\.ttf$/, (route) => route.abort())
    await page.getByRole('button', { name: /PDF/ }).click()
    await says(FAILED)
    await context.unroute(/\.ttf$/)

    const download = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: /PDF/ }).click()
    expect((await download).suggestedFilename()).toBe('On a train.pdf')
  })

  test('a failure that is not the code or a font failing to load says it failed, even when the browser reports it is offline', async ({ page, context }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
    await essay(page, false)
    const before = await kept(page)
    // The font file arrives, but it is not a font: the file cannot be made, though nothing failed to load.
    await context.route(/\.ttf$/, (route) => route.fulfill({ status: 200, contentType: 'font/ttf', body: 'not a font' }))
    await openExport(page)
    await page.getByRole('button', { name: /PDF/ }).click()
    await expect(page.getByRole('status').filter({ hasText: FAILED })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: OFFLINE })).toHaveCount(0)
    expect(await kept(page)).toBe(before)
  })
})

test('a first PDF fetches its code and fonts, and later PDFs work offline', async ({ page, context }) => {
  test.setTimeout(120_000)
  // Every request the page makes, with what it carries.
  const seen: { method: string; url: string; body: string | null }[] = []
  page.on('request', (request) => seen.push({ method: request.method(), url: request.url(), body: request.postData() }))

  await essay(page)
  // The first session is not yet held by the worker, so its PDF would not be kept: load once more, as a writer does.
  await page.reload()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
  await expect(page.locator('.body')).toContainText(WORDS)

  // The install holds neither the PDF code nor the fixed fonts, and nothing yet asked for them.
  const installed = Object.values(await cached(page)).flat()
  expect(installed.some((path) => PDF_CODE.test(path))).toBe(false)
  expect(installed.some((path) => path.endsWith('.ttf'))).toBe(false)
  expect(seen.some((r) => PDF_CODE.test(r.url))).toBe(false)

  const mark = seen.length
  await openExport(page)
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: /PDF/ }).click()
  expect((await download).suggestedFilename()).toBe('On a train.pdf')

  // What a PDF asks the network for: files from the app's own assets, by GET, and nothing sent.
  const asked = seen.slice(mark)
  const origin = new URL(page.url()).origin
  expect(asked.some((r) => PDF_CODE.test(r.url))).toBe(true)
  expect(asked.some((r) => new URL(r.url).pathname.endsWith('.ttf'))).toBe(true)
  for (const r of asked) {
    expect(r.method).toBe('GET')
    expect(r.body).toBeNull()
    expect(r.url.startsWith(`${origin}/assets/`)).toBe(true)
    expect(decodeURIComponent(r.url)).not.toContain('train')
  }

  // They are kept, so the PDF is made again with no network at all.
  await expect
    .poll(async () => {
      const held = Object.values(await cached(page)).flat()
      return held.some((path) => PDF_CODE.test(path)) && held.some((path) => path.endsWith('.ttf'))
    })
    .toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.body')).toContainText(WORDS)
  await openExport(page)
  const again = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: /PDF/ }).click()
  expect((await again).suggestedFilename()).toBe('On a train.pdf')
})

test('code that was fetched again after a failure is kept too, and later PDFs work offline', async ({ page, context, browserName }) => {
  // Offline reaches the worker's own fetches in Chromium only (not Firefox), so only there does it prove the kept copy answers.
  test.skip(browserName !== 'chromium', 'checked in Chromium')
  test.setTimeout(120_000)
  await essay(page)
  await page.reload()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
  await expect(page.locator('.body')).toContainText(WORDS)

  await context.route(PDF_CODE, (route) => route.abort())
  await openExport(page)
  await page.getByRole('button', { name: /PDF/ }).click()
  await expect(page.getByRole('status').filter({ hasText: FAILED })).toBeVisible()
  await context.unroute(PDF_CODE)

  // The second try asks for the code under another address, and it is kept all the same.
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: /PDF/ }).click()
  expect((await download).suggestedFilename()).toBe('On a train.pdf')
  await expect
    .poll(async () => {
      const held = Object.values(await cached(page)).flat()
      return held.some((path) => PDF_CODE.test(path)) && held.some((path) => path.endsWith('.ttf'))
    })
    .toBe(true)

  // A new session asks for the plain address: the kept copy answers.
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.body')).toContainText(WORDS)
  await openExport(page)
  const again = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: /PDF/ }).click()
  expect((await again).suggestedFilename()).toBe('On a train.pdf')
})
