import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, openTools, saved } from './helpers'

const machine = (page: Page) => page.locator('.time-machine')
const oldText = (page: Page) => machine(page).locator('.body')
const bar = (page: Page) => machine(page).locator('.moment-bar')
const tape = (page: Page) => machine(page).getByRole('slider', { name: 'Moment' })
const ticks = (page: Page) => machine(page).locator('.tick')
const phone = (page: Page): boolean => page.viewportSize()!.width < 700

/** A new essay with these words, saved. */
async function essay(page: Page, words: string, title = 'Salt'): Promise<void> {
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await page.keyboard.type(words)
  await saved(page, words)
}

/** Replaces all the text. */
async function rewrite(page: Page, words: string): Promise<void> {
  await caretToEnd(page)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(words)
  await saved(page, words)
}

async function open(page: Page): Promise<void> {
  await openTools(page)
  await page.getByRole('button', { name: 'Time Machine' }).click()
  await expect(machine(page)).toBeVisible()
}

async function close(page: Page): Promise<void> {
  await machine(page).getByRole('button', { name: 'Back to now' }).click()
  await expect(machine(page)).toHaveCount(0)
}

/** An essay with a moment for each text, the last of them now. */
async function history(page: Page, texts: string[]): Promise<void> {
  await essay(page, texts[0]!)
  for (const text of texts.slice(1)) {
    await open(page)
    await expect(machine(page).locator('.moment-name, .moment-note').first()).not.toHaveText('Finding your moments…')
    await close(page)
    await rewrite(page, text)
  }
}

/** Everything in a store, as it stands. */
function stored<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (store) =>
      new Promise<T[]>((done, failed) => {
        const open = indexedDB.open('elbowpatch')
        open.onerror = () => failed(open.error)
        open.onsuccess = () => {
          const db = open.result
          const all = db.transaction(store).objectStore(store).getAll()
          all.onsuccess = () => {
            db.close()
            done(all.result as T[])
          }
        }
      }),
    store,
  )
}

test('opens from the tools on the most recent moment that differs, with the latest words kept first', async ({ page }) => {
  await history(page, ['The first words.', 'The second words.'])
  await open(page)
  await expect(oldText(page)).toHaveText('The first words.')
  await expect(ticks(page)).toHaveCount(2)
  await expect(machine(page).locator('.moment-name')).toHaveText('Just now')
  await expect(tape(page)).toBeFocused()
  const versions = await stored<{ content: string }>(page, 'versions')
  expect(versions.map((v) => v.content)).toContain('The second words.')
})

test('the tool stands after Export and before the text settings', async ({ page }) => {
  await essay(page, 'Words.')
  await openTools(page)
  const names = await page
    .getByRole('toolbar', { name: 'Tools' })
    .getByRole('button')
    .evaluateAll((all) => all.map((b) => b.getAttribute('aria-label')))
  expect(names.slice(names.indexOf('Export'), names.indexOf('Export') + 3)).toEqual(['Export', 'Time Machine', 'Text settings'])
})

test('the tools bar with the Time Machine stays 16px from the edges of a phone', async ({ page }) => {
  test.skip(!phone(page), 'the tools bar is a phone’s')
  await essay(page, 'Some words to count on the page.')
  await openTools(page)
  const box = (await page.getByRole('toolbar', { name: 'Tools' }).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(16)
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 16)
})

test('the key opens it with what was just typed kept, and Escape comes back to the caret', async ({ page }) => {
  await history(page, ['One two.', 'One two three.'])
  await caretToEnd(page)
  await page.keyboard.type(' four')
  await page.keyboard.press('Control+Alt+z')
  await expect(machine(page)).toBeVisible()
  await expect(oldText(page)).toHaveText('One two.')
  await expect(ticks(page)).toHaveCount(2)
  await expect(tape(page)).toBeFocused()
  await page.keyboard.press('End')
  await expect(oldText(page)).toHaveText('One two three. four')
  await page.keyboard.press('Escape')
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.body')).toHaveText('One two three. four')
  if (phone(page)) return
  await expect(page.locator('.body')).toBeFocused()
  await page.keyboard.type(' five')
  await expect(page.locator('.body')).toHaveText('One two three. four five')
})

test('the browser’s back closes it and stays on the piece', async ({ page }) => {
  await history(page, ['Before.', 'After.'])
  const url = page.url()
  await open(page)
  await expect(oldText(page)).toHaveText('Before.')
  await page.goBack()
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.body')).toHaveText('After.')
  expect(page.url()).toBe(url)
})

test('✕ leaves no step behind: the next back goes where it would have', async ({ page }) => {
  await history(page, ['Before.', 'After.'])
  await open(page)
  await close(page)
  await page.goBack()
  await expect(page.locator('.library, .shelf, .start').first()).toBeVisible()
})

test('§ goes home from the Time Machine, and back from there returns to the piece', async ({ page }) => {
  await history(page, ['Before.', 'After.'])
  await open(page)
  await expect(oldText(page)).toHaveText('Before.')
  await machine(page).getByRole('button', { name: 'Library' }).click()
  await expect(machine(page)).toHaveCount(0)
  await expect(page).toHaveURL(/#\/$/)
  await page.goBack()
  await expect(page.locator('.body')).toHaveText('After.')
  await expect(machine(page)).toHaveCount(0)
})

test('comes back to the page it left, on a long piece', async ({ page }) => {
  const long = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1} goes on for a while, so that the text fills more than one page of the piece.`).join(
    '\n\n',
  )
  await essay(page, 'Short.')
  await caretToEnd(page)
  await page.keyboard.press('ControlOrMeta+a')
  await page.evaluate((text) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    document.querySelector('.body')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, long)
  await saved(page, 'Paragraph 60')
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  const left = await page.locator('.pager').evaluate((el) => el.scrollLeft)
  expect(left).toBeGreaterThan(0)
  await page.keyboard.press('Control+Alt+z')
  await expect(machine(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(machine(page)).toHaveCount(0)
  expect(await page.locator('.pager').evaluate((el) => el.scrollLeft)).toBe(left)
})

test('a new piece has nothing earlier: one line, today’s text, and the writing page', async ({ page }) => {
  await essay(page, 'Nobody remembers the first draft.')
  await open(page)
  await expect(bar(page)).toContainText('Nothing earlier yet. Moments are kept as you write.')
  await expect(oldText(page)).toHaveText('Nobody remembers the first draft.')
  await expect(tape(page)).toHaveCount(0)
  await expect(machine(page).getByRole('button', { name: 'Keep a copy' })).toHaveCount(0)
  const box = (await bar(page).boundingBox())!
  expect(box.height).toBe(62)
  expect(box.width).toBe(358)
  expect(box.y).toBe(phone(page) ? 767 : 818)
})

test('a piece not stored yet opens on nothing earlier too', async ({ page }) => {
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.press('Control+Alt+z')
  await expect(bar(page)).toContainText('Nothing earlier yet.')
})

test('the bar stands where the frames draw it, and names what it brings back', async ({ page }) => {
  await history(page, ['Before.', 'After.'])
  await open(page)
  await expect(tape(page)).toBeFocused()
  await expect(machine(page).getByRole('button', { name: 'Bring essay back' })).toBeVisible()
  await expect(machine(page).getByRole('button', { name: 'Keep a copy' })).toBeVisible()
  const box = (await bar(page).boundingBox())!
  expect(box.height).toBe(130)
  expect(box.width).toBe(358)
  expect(box.y).toBe(phone(page) ? 690 : 750)
  expect(box.x).toBe(phone(page) ? 16 : 541)
  const back = (await machine(page).locator('.moment-close').boundingBox())!
  expect(back.x - box.x).toBe(311)
  expect(back.y - box.y).toBe(1)
})

test('the actions do nothing yet', async ({ page }) => {
  await history(page, ['Before.', 'After.'])
  await open(page)
  await expect(oldText(page)).toHaveText('Before.')
  const before = await stored(page, 'versions')
  await machine(page).getByRole('button', { name: 'Bring essay back' }).click()
  await machine(page).getByRole('button', { name: 'Keep a copy' }).click()
  await expect(oldText(page)).toHaveText('Before.')
  expect(await stored(page, 'versions')).toEqual(before)
  await close(page)
  await expect(page.locator('.body')).toHaveText('After.')
})

test('the tape steps by key, and says so', async ({ page }) => {
  await history(page, ['One.', 'Two.', 'Three.', 'Four.'])
  await open(page)
  await expect(oldText(page)).toHaveText('Three.')
  await expect(tape(page)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(oldText(page)).toHaveText('Two.')
  await page.keyboard.press('ArrowRight')
  await expect(oldText(page)).toHaveText('Three.')
  await page.keyboard.press('Home')
  await expect(oldText(page)).toHaveText('One.')
  await expect(tape(page)).toHaveAttribute('aria-valuenow', '0')
  await page.keyboard.press('ArrowLeft')
  await expect(oldText(page)).toHaveText('One.')
  await page.keyboard.press('End')
  await expect(oldText(page)).toHaveText('Four.')
  await expect(tape(page)).toHaveAttribute('aria-valuenow', '3')
  await expect(tape(page)).toHaveAttribute('aria-valuetext', /^[A-Z][a-z]+day \d+ [A-Z][a-z]+, \d+:\d\d$/)
  await expect(machine(page).locator('[aria-live]')).toHaveText('Just now')
})

test('a tap on a tick goes to it', async ({ page }) => {
  await history(page, ['One.', 'Two.', 'Three.'])
  await open(page)
  await expect(oldText(page)).toHaveText('Two.')
  const box = (await tape(page).boundingBox())!
  await tape(page).click({ position: { x: box.width / 2 - 44, y: 14 } })
  await expect(oldText(page)).toHaveText('One.')
})

test('repeated text folds into one tick', async ({ page }) => {
  await history(page, ['One.', 'Two.'])
  await open(page)
  await expect(ticks(page)).toHaveCount(2)
  await close(page)
  await open(page)
  await expect(ticks(page)).toHaveCount(2)
})

test('a title of that moment reads as it did', async ({ page }) => {
  await history(page, ['Words.', 'More words.'])
  await page.locator('.title').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Renamed')
  await open(page)
  await expect(machine(page).locator('.title')).toHaveText('Salt')
  await expect(machine(page).locator('.running-head')).toHaveText('Salt')
  await expect(tape(page)).toBeFocused()
  await page.keyboard.press('End')
  await expect(machine(page).locator('.title')).toHaveText('Renamed')
})

test('old text keeps the type, never runs under the bar, turns by key, and saves no place or page count', async ({ page }) => {
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} goes on for a while, so that the text fills more than one page.`)
  await essay(page, long.join(' '))
  await page.keyboard.press('Enter')
  await page.keyboard.type('And a last line.')
  await saved(page, 'And a last line.')
  const size = await page.locator('.body').evaluate((el) => getComputedStyle(el).fontSize)
  await open(page)
  await close(page)
  await rewrite(page, 'Now it is short.')
  await open(page)
  await expect(oldText(page)).toContainText('And a last line.')
  expect(await oldText(page).evaluate((el) => getComputedStyle(el).fontSize)).toBe(size)
  const before = await stored<{ place?: unknown; pages?: unknown }>(page, 'pieces')
  const end = phone(page) ? 666 : 730
  const pager = (await machine(page).locator('.pager').boundingBox())!
  expect(pager.y + pager.height).toBe(end)
  const left = () =>
    machine(page)
      .locator('.pager')
      .evaluate((el) => el.scrollLeft)
  expect(await left()).toBe(0)
  await page.keyboard.press('PageDown')
  await expect.poll(left).toBeGreaterThan(0)
  await page.keyboard.press('Alt+ArrowLeft')
  await expect.poll(left).toBe(0)
  await close(page)
  const after = await stored<{ place?: unknown; pages?: unknown }>(page, 'pieces')
  expect(after[0]!.place).toEqual(before[0]!.place)
  expect(after[0]!.pages).toEqual(before[0]!.pages)
})

test('old text cannot be changed and has no caret', async ({ page }) => {
  await history(page, ['Before.', 'After.'])
  await open(page)
  await expect(oldText(page)).toHaveText('Before.')
  await expect(oldText(page)).toHaveAttribute('contenteditable', 'false')
  await oldText(page).click()
  await page.keyboard.type('x')
  await expect(oldText(page)).toHaveText('Before.')
  await expect(machine(page).locator('.earlier')).toHaveCount(0)
})

test('while moments load, today’s text stays and the bar keeps its height', async ({ page }) => {
  await history(page, ['Before.', 'After.'])
  // A transaction held open: everything the app reads waits behind it.
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const tx = open.result.transaction('versions', 'readwrite')
          const w = window as unknown as { held: boolean }
          w.held = true
          const spin = (): void => {
            if (w.held) tx.objectStore('versions').count().onsuccess = spin
          }
          spin()
          done()
        }
      }),
  )
  await open(page)
  await expect(bar(page)).toContainText('Finding your moments…')
  await expect(oldText(page)).toHaveText('After.')
  expect((await bar(page).boundingBox())!.height).toBe(130)
  await expect(machine(page).getByRole('button', { name: 'Bring essay back' })).toBeVisible()
  await expect(machine(page).getByRole('button', { name: 'Back to now' })).toBeVisible()
  await expect(ticks(page)).toHaveCount(0)
  await page.evaluate(() => {
    ;(window as unknown as { held: boolean }).held = false
  })
  await expect(oldText(page)).toHaveText('Before.')
  expect((await bar(page).boundingBox())!.height).toBe(130)
})

test('when moments cannot be read, today’s text stays and Try again reads them', async ({ page }) => {
  await history(page, ['Before.', 'After.'])
  await page.evaluate(() => {
    const w = window as unknown as { broken: boolean }
    w.broken = true
    const getAll = IDBIndex.prototype.getAll
    IDBIndex.prototype.getAll = function (...args) {
      if (w.broken && this.objectStore.name === 'versions') throw new Error('No reading')
      return getAll.apply(this, args)
    }
  })
  await open(page)
  await expect(bar(page)).toContainText('Can’t read your moments right now. Your words are still here.')
  await expect(oldText(page)).toHaveText('After.')
  const box = (await bar(page).boundingBox())!
  expect(box.height).toBe(98)
  expect(box.y).toBe(phone(page) ? 722 : 782)
  await expect(machine(page).getByRole('button', { name: 'Back to now' })).toBeVisible()
  await machine(page).getByRole('button', { name: 'Try again' }).click()
  await expect(bar(page)).toContainText('Can’t read your moments')
  await page.evaluate(() => {
    ;(window as unknown as { broken: boolean }).broken = false
  })
  await machine(page).getByRole('button', { name: 'Try again' }).click()
  await expect(oldText(page)).toHaveText('Before.')
})

test('thinning waits while the Time Machine is open, and runs once it closes', async ({ page }) => {
  // The app's idle moments, in the test's hands.
  await page.addInitScript(() => {
    const w = window as unknown as { idle: (() => void)[] }
    w.idle = []
    window.requestIdleCallback = ((f: () => void) => w.idle.push(f)) as typeof window.requestIdleCallback
  })
  await history(page, ['One.', 'Two.', 'Three.', 'Four.'])
  await open(page)
  await close(page)
  const count = async (): Promise<number> => (await stored(page, 'versions')).length
  expect(await count()).toBe(4)
  // All of it three days old, so thinning has something to take.
  await page.evaluate(
    (from) =>
      new Promise<void>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const tx = open.result.transaction(['versions', 'outlines'], 'readwrite')
          for (const name of ['versions', 'outlines']) {
            const store = tx.objectStore(name)
            store.getAll().onsuccess = (e) => {
              for (const row of (e.target as IDBRequest).result) store.put({ ...row, createdAt: from + row.seq * 60_000 })
            }
          }
          tx.oncomplete = () => {
            open.result.close()
            done()
          }
        }
      }),
    new Date(Date.now() - 3 * 86_400_000).setHours(12, 0, 0, 0),
  )
  await page.reload()
  await expect(page.locator('.body')).toHaveText('Four.')
  await expect.poll(() => page.evaluate(() => (window as unknown as { idle: unknown[] }).idle.length)).toBeGreaterThan(0)
  await open(page)
  await expect(ticks(page)).toHaveCount(4)
  const runIdle = () =>
    page.evaluate(() => {
      const w = window as unknown as { idle: (() => void)[] }
      for (const f of w.idle.splice(0)) f()
    })
  await runIdle()
  await page.waitForTimeout(300)
  expect(await count()).toBe(4)
  await close(page)
  await expect.poll(() => page.evaluate(() => (window as unknown as { idle: unknown[] }).idle.length)).toBeGreaterThan(0)
  await runIdle()
  await expect.poll(count).toBeLessThan(4)
})

test('the desktop path keeps the moment whole and shortens the name', async ({ page }) => {
  test.skip(phone(page), 'the path is desktop’s')
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('A very long title that could never fit beside the moment in the rail')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Before.')
  await saved(page, 'Before.')
  await page.keyboard.press('Control+Alt+z')
  await expect(bar(page)).toContainText('Nothing earlier')
  // No moment in the path until there is one.
  await expect(machine(page).locator('.crumb')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await rewrite(page, 'After.')
  await open(page)
  const moment = machine(page).locator('.crumb').nth(1).locator('.crumb-word')
  await expect(moment).toHaveText('Just now')
  await expect(moment).toHaveCSS('font-style', 'italic')
  expect(await moment.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  const box = (await moment.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(316)
  // The name goes back to now.
  await machine(page).locator('.crumb').first().getByRole('button').click()
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.body')).toHaveText('After.')
})

test('tools leave the head on desktop', async ({ page }) => {
  test.skip(phone(page), 'the head’s tools are desktop’s')
  await history(page, ['Before.', 'After.'])
  await open(page)
  await expect(machine(page).locator('.head-tools')).toHaveCount(0)
  await expect(machine(page).locator('.running-head')).toBeVisible()
})

test('a window that does not write looks back and writes nothing', async ({ page, context }) => {
  await history(page, ['Before.', 'After.'])
  const url = page.url()
  await open(page)
  await close(page)
  await caretToEnd(page)
  await page.keyboard.type(' Unsaved moment.')
  await saved(page, 'Unsaved moment.')
  const second = await context.newPage()
  await second.goto(url)
  await expect(second.getByText('Open in another window')).toBeVisible()
  const before = await stored(second, 'versions')
  await open(second)
  await expect(second.locator('.time-machine .tick')).toHaveCount(3)
  await expect(oldText(second)).toHaveText('After.')
  await expect(tape(second)).toBeFocused()
  await second.keyboard.press('End')
  await expect(oldText(second)).toHaveText('After. Unsaved moment.')
  expect(await stored(second, 'versions')).toEqual(before)
})

test('it all works with no network', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await history(page, ['Before.', 'After.'])
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.body')).toHaveText('After.')
  await open(page)
  await expect(oldText(page)).toHaveText('Before.')
})

test('Help explains it and lists its key', async ({ page }) => {
  await page.goto('./#/settings/help')
  await expect(page.getByRole('heading', { name: 'Going back' })).toBeVisible()
  // A phone has no keys to list, and hides them.
  await expect(page.getByText('⌘/Ctrl + Alt + Z')).toBeAttached()
  await expect(page.getByText('so keep a copy')).toHaveCount(0)
})
