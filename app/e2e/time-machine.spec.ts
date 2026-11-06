import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, openTools, saved, write } from './helpers'

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
  // An essay's page 1 has no running head here, as on the writing page: its title stands there.
  await expect(machine(page).locator('.title')).toHaveText('Salt')
  await expect(machine(page).locator('.running-head')).toHaveCount(0)
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

for (const width of [390, 360]) {
  test(`the tools bar with the Time Machine stays 16px from the edges of a ${width}px phone, with a long count`, async ({ page }) => {
    test.skip(!phone(page), 'the tools bar is a phone’s')
    await page.setViewportSize({ width, height: 800 })
    await essay(page, 'Start.')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.insertText(Array(1040).fill('word').join(' '))
    await saved(page, 'word word')
    await page.locator('.body').blur()
    await openTools(page)
    const box = (await page.getByRole('toolbar', { name: 'Tools' }).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(16)
    expect(box.x + box.width).toBeLessThanOrEqual(width - 16)
  })
}

/** What the bar holds stands inside it. */
async function holdsItsParts(page: Page, parts: string): Promise<void> {
  const box = (await bar(page).boundingBox())!
  for (const part of await machine(page).locator(parts).all()) {
    const inner = (await part.boundingBox())!
    expect(inner.y).toBeGreaterThanOrEqual(box.y)
    expect(inner.y + inner.height).toBeLessThanOrEqual(box.y + box.height)
  }
}

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
  await essay(page, 'Short.')
  await caretToEnd(page)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(
    Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1} goes on for a while, so that the text fills more than one page.`).join(' '),
  )
  await saved(page, 'Paragraph 60')
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  const left = await page.locator('.pager').evaluate((el) => el.scrollLeft)
  expect(left).toBeGreaterThan(0)
  await page.keyboard.press('Control+Alt+z')
  await expect(machine(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(machine(page)).toHaveCount(0)
  await expect.poll(() => page.locator('.pager').evaluate((el) => el.scrollLeft)).toBe(left)
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
  await holdsItsParts(page, '.moment-note')
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
  await holdsItsParts(page, '.moment-name, .tape, .moment-action')
  // As the frames draw it: the moment on the first line, the actions at the foot.
  expect((await machine(page).locator('.moment-name').boundingBox())!.y - box.y).toBe(13)
  expect((await machine(page).locator('.moment-action').first().boundingBox())!.y - box.y).toBe(81)
  const back = (await machine(page).locator('.moment-close').boundingBox())!
  expect(back.x - box.x).toBe(311)
  expect(back.y - box.y).toBe(1)
})

test('bring back does nothing yet', async ({ page }) => {
  await history(page, ['Before.', 'After.'])
  await open(page)
  await expect(oldText(page)).toHaveText('Before.')
  const before = await stored(page, 'versions')
  await machine(page).getByRole('button', { name: 'Bring essay back' }).click()
  await expect(oldText(page)).toHaveText('Before.')
  expect(await stored(page, 'versions')).toEqual(before)
  await close(page)
  await expect(page.locator('.body')).toHaveText('After.')
})

test('the path keeps the longest names of a moment whole, and ends by x316', async ({ page }) => {
  test.skip(phone(page), 'the path is desktop’s')
  await essay(page, 'Before.', 'A very long title that could never fit beside the moment in the rail')
  await open(page)
  await close(page)
  await rewrite(page, 'After.')
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(14, 5)
  for (const [at, name] of [
    [yesterday.getTime(), 'Yesterday afternoon'],
    [new Date(2025, 8, 28, 9, 0).getTime(), '28 September 2025'],
  ] as const) {
    await page.evaluate(
      (at) =>
        new Promise<void>((done, failed) => {
          const open = indexedDB.open('elbowpatch')
          open.onerror = () => failed(open.error)
          open.onsuccess = () => {
            const tx = open.result.transaction(['versions', 'outlines'], 'readwrite')
            for (const name of ['versions', 'outlines']) {
              const store = tx.objectStore(name)
              store.getAll().onsuccess = (e) => {
                for (const row of (e.target as IDBRequest).result) if (row.content !== 'After.') store.put({ ...row, createdAt: at })
              }
            }
            tx.oncomplete = () => done()
          }
        }),
      at,
    )
    await open(page)
    const moment = machine(page).locator('.crumb').nth(1).locator('.crumb-word')
    await expect(moment).toHaveText(name)
    const box = (await moment.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(316)
    // Whole: as wide as its words, where the name beside it gives way.
    const words = await moment.evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return range.getBoundingClientRect().width
    })
    expect(box.width).toBeGreaterThanOrEqual(words - 0.5)
    await close(page)
  }
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
  // None on page 1, as on the writing page; later pages have it, as plain text, centred over the column.
  await expect(machine(page).locator('.running-head')).toHaveCount(0)
  await page.keyboard.press('PageDown')
  await expect.poll(left).toBeGreaterThan(0)
  const head = machine(page).locator('.running-head')
  await expect(head).toHaveText('Salt')
  expect(await head.evaluate((el) => el.tagName)).toBe('DIV')
  const column = (await machine(page).locator('.pager').boundingBox())!
  const said = (await head.boundingBox())!
  expect(Math.abs(said.x + said.width / 2 - (column.x + column.width / 2))).toBeLessThanOrEqual(1)
  await page.keyboard.press('Alt+ArrowLeft')
  await expect.poll(left).toBe(0)
  await expect(head).toHaveCount(0)
  await close(page)
  const after = await stored<{ place?: unknown; pages?: unknown }>(page, 'pieces')
  expect(after[0]!.place).toEqual(before[0]!.place)
  expect(after[0]!.pages).toEqual(before[0]!.pages)
})

test('a book’s and a journal’s page 1 keep the running head here, which an essay’s lacks', async ({ page }) => {
  for (const kind of ['Book', 'Journal'] as const) {
    await page.goto('./#/')
    await write(page, kind)
    await expect(page.locator('.book-title')).toBeFocused()
    await page.keyboard.type('Thoughts')
    // A book's words are in its first chapter, past the title page; a journal's go in today's page.
    if (kind === 'Book') await page.locator('.title').click()
    await page.keyboard.press('Enter')
    await page.keyboard.type('Some words.')
    await saved(page, 'Some words.')
    await page.keyboard.press('Control+Alt+z')
    await expect(machine(page)).toBeVisible()
    await expect(machine(page).locator('.running-head')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(machine(page)).toHaveCount(0)
  }
})

test('old text can be selected but not changed, and has no caret', async ({ page }) => {
  await history(page, ['Before these words were here.', 'After.'])
  await open(page)
  await expect(oldText(page)).toHaveText('Before these words were here.')
  await expect(oldText(page)).toHaveAttribute('contenteditable', 'false')
  const line = (await oldText(page).locator('p').boundingBox())!
  await page.mouse.move(line.x + 2, line.y + line.height / 2)
  await page.mouse.down()
  await page.mouse.move(line.x + 120, line.y + line.height / 2, { steps: 6 })
  await page.mouse.up()
  expect(await page.evaluate(() => getSelection()?.toString())).toContain('Before')
  await page.keyboard.type('x')
  await expect(oldText(page)).toHaveText('Before these words were here.')
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
  await holdsItsParts(page, '.moment-note, .moment-again')
  await expect(machine(page).getByRole('button', { name: 'Back to now' })).toBeVisible()
  await machine(page).getByRole('button', { name: 'Try again' }).click()
  await expect(bar(page)).toContainText('Can’t read your moments')
  await page.evaluate(() => {
    ;(window as unknown as { broken: boolean }).broken = false
  })
  await machine(page).getByRole('button', { name: 'Try again' }).click()
  await expect(oldText(page)).toHaveText('Before.')
})

/** A window shorter than the page: the page keeps its size, and the window scrolls. */
const shortWindow = (page: Page) => (phone(page) ? { width: 390, height: 560 } : { width: 1440, height: 640 })

for (const state of ['moments', 'loading', 'error', 'nothing'] as const) {
  test(`in a short window the bar stays on screen, ✕ included, and the page scrolls under it (${state})`, async ({ page }) => {
    if (state === 'nothing') await essay(page, 'Nobody remembers the first draft.')
    else await history(page, ['Before.', 'After.'])
    if (state === 'loading') {
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
    }
    if (state === 'error') {
      await page.evaluate(() => {
        const getAll = IDBIndex.prototype.getAll
        IDBIndex.prototype.getAll = function (...args) {
          if (this.objectStore.name === 'versions') throw new Error('No reading')
          return getAll.apply(this, args)
        }
      })
    }
    const size = shortWindow(page)
    await page.setViewportSize(size)
    await open(page)
    await expect(bar(page)).toContainText(
      { moments: 'Just now', loading: 'Finding your moments…', error: 'Can’t read your moments', nothing: 'Nothing earlier yet.' }[state],
    )
    const scroller = () => page.evaluate(() => ({ top: document.scrollingElement!.scrollTop, room: document.scrollingElement!.scrollHeight - innerHeight }))
    const barBox = async () => (await bar(page).boundingBox())!
    const onScreen = async (): Promise<void> => {
      const box = await barBox()
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(size.height)
      await expect(machine(page).getByRole('button', { name: 'Back to now' })).toBeInViewport({ ratio: 1 })
    }
    // The window is shorter than the page, so it scrolls; the bar is on screen at the top of it.
    expect((await scroller()).room).toBeGreaterThan(0)
    await page.evaluate(() => scrollTo(0, 0))
    await onScreen()
    const standing = await barBox()
    // Scrolled to the end it stands where it did, and no text stands under it.
    await page.evaluate(() => scrollTo(0, document.scrollingElement!.scrollHeight))
    expect((await scroller()).top).toBeGreaterThan(0)
    await onScreen()
    expect(await barBox()).toEqual(standing)
    const text = (await machine(page).locator('.pager').boundingBox())!
    expect(text.y + text.height).toBeLessThanOrEqual(standing.y)
    await expect(oldText(page)).toBeVisible()
    if (state === 'loading') {
      await page.evaluate(() => {
        ;(window as unknown as { held: boolean }).held = false
      })
    }
  })
}

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
  // It fades out over the page for a moment (220ms) before it is gone.
  await expect(machine(page)).toHaveCount(0)
  await rewrite(page, 'After.')
  await open(page)
  const moment = machine(page).locator('.crumb').nth(1).locator('.crumb-word')
  await expect(moment).toHaveText('Just now')
  await expect(moment).toHaveCSS('font-style', 'italic')
  // The name gives way, not the moment.
  expect(
    await machine(page)
      .locator('.crumb')
      .first()
      .locator('.crumb-word')
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true)
  // The path ends by x316, and an essay's path has no toggle after it.
  expect((await moment.boundingBox())!.x + (await moment.boundingBox())!.width).toBeLessThanOrEqual(316)
  await expect(machine(page).getByRole('button', { name: 'Pages' })).toHaveCount(0)
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
  // No rail and no toggle on an essay's head: the path alone, at the left.
  await expect(machine(page).locator('.rail-toggle')).toHaveCount(0)
  await expect(machine(page).locator('.rail')).toHaveCount(0)
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

// The tape in the hand, and the Time Machine's fades (#83).

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** The ages, newest first, of a history thinned as it would be after a year: every moment for an hour, then one an hour, a day, a week. */
function yearOfAges(): number[] {
  const ages: number[] = []
  for (let i = 0; i < 12; i++) ages.push(i * 5 * 60_000)
  for (let i = 1; i <= 23; i++) ages.push(i * HOUR + HOUR / 2)
  for (let i = 1; i <= 29; i++) ages.push(i * DAY + DAY / 2)
  for (let i = 5; i <= 52; i++) ages.push(i * 7 * DAY)
  return ages
}

/**
 * Replaces the piece's history with a chain of moments of these ages (oldest last in `ages`), every `kept`th of them kept,
 * the newest being the words now. Written directly, with no reload: a restart would thin it, and the Time Machine holds thinning once open.
 */
async function seed(page: Page, ages: number[], kept = 0): Promise<void> {
  await page.evaluate(
    async ({ ages, kept }) => {
      const db = await new Promise<IDBDatabase>((done, failed) => {
        const open = indexedDB.open('elbowpatch')
        open.onerror = () => failed(open.error)
        open.onsuccess = () => done(open.result)
      })
      const tx = db.transaction(['pieces', 'working', 'versions', 'outlines'], 'readwrite')
      const all = <T>(store: string) =>
        new Promise<T[]>((done) => {
          const r = tx.objectStore(store).getAll()
          r.onsuccess = () => done(r.result as T[])
        })
      const piece = (await all<{ sections: { sectionId: string }[] }>('pieces'))[0]!
      const sectionId = piece.sections[0]!.sectionId
      const pieceId = (piece as unknown as { id: string }).id
      const working = (await all<{ sectionId: string; content: string; baseVersionId: string }>('working')).find((w) => w.sectionId === sectionId)!
      for (const v of await all<{ id: string; sectionId: string }>('versions')) if (v.sectionId === sectionId) tx.objectStore('versions').delete(v.id)
      const now = Date.now()
      const oldest = [...ages].reverse()
      const first = now - oldest[0]!
      oldest.forEach((age, i) => {
        tx.objectStore('versions').put({
          id: `seed-${i}`,
          pieceId,
          sectionId,
          parentId: i === 0 ? null : `seed-${i - 1}`,
          seq: i,
          createdAt: now - age,
          content: i === oldest.length - 1 ? working.content : `Moment ${i}.`,
          ...(kept && i % kept === 0 ? { kept: true } : {}),
        })
      })
      for (const o of await all<{ id: string; createdAt: number }>('outlines')) tx.objectStore('outlines').put({ ...o, createdAt: first - 1 })
      tx.objectStore('working').put({ ...working, baseVersionId: `seed-${oldest.length - 1}` })
      await new Promise<void>((done, failed) => {
        tx.oncomplete = () => done()
        tx.onerror = () => failed(tx.error)
      })
      db.close()
    },
    { ages, kept },
  )
}

/** An essay with this many moments, aged as given, ready to open. */
async function longHistory(page: Page, ages: number[], kept = 0): Promise<void> {
  await essay(page, 'Words now.')
  await seed(page, ages, kept)
  await open(page)
  await expect(ticks(page).first()).toBeVisible()
  await expect(tape(page)).toBeFocused()
}

/** Where the tape stands: its tick, and whether its layer is at that tick's place and still. */
const settled = (page: Page) =>
  tape(page).evaluate((el) => {
    const layer = el.querySelector('.tape-ticks')!
    const spacing = 11
    const x = -new DOMMatrixReadOnly(getComputedStyle(layer).transform).m41
    return { tick: Number(el.getAttribute('aria-valuenow')), x, spacing, gliding: layer.getAnimations().length > 0 }
  })

/** A drag along the tape by the mouse, in steps, and let go. */
async function drag(page: Page, dx: number, steps = 8): Promise<void> {
  const box = (await tape(page).boundingBox())!
  const y = box.y + 14
  const x = box.x + box.width / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y, { steps })
  await page.mouse.up()
}

test('dragging the tape moves it, and it settles on a tick', async ({ page }) => {
  await longHistory(page, yearOfAges())
  const count = yearOfAges().length
  const start = await settled(page)
  expect(start.tick).toBe(count - 2)
  // Dragged to the right, older moments come in from the left; still before it is let go, it settles on the nearest tick.
  await drag(page, 10 * 11 + 3, 8)
  await expect.poll(async () => (await settled(page)).gliding).toBe(false)
  const end = await settled(page)
  expect(end.tick).toBeLessThan(start.tick - 8)
  expect(end.x).toBe(end.tick * 11)
  await expect(tape(page)).toHaveAttribute('aria-valuenow', String(end.tick))
  await expect(oldText(page)).toHaveText(`Moment ${end.tick}.`)
  // Dragged back past now, it stops at the last moment.
  await drag(page, -170, 12)
  await expect.poll(async () => (await settled(page)).gliding).toBe(false)
  expect((await settled(page)).tick).toBe(count - 1)
  // A drag is not a tap: it goes nowhere else when the pointer is let go.
  await expect(oldText(page)).toHaveText('Words now.')
})

test('a short drag that does not reach a tick comes back to it, and a tap still goes to a tick', async ({ page }) => {
  await longHistory(page, yearOfAges())
  const start = (await settled(page)).tick
  await drag(page, 4, 2)
  await expect.poll(async () => (await settled(page)).gliding).toBe(false)
  expect((await settled(page)).tick).toBe(start)
  const box = (await tape(page).boundingBox())!
  await tape(page).click({ position: { x: box.width / 2 - 33, y: 14 } })
  await expect(tape(page)).toHaveAttribute('aria-valuenow', String(start - 3))
})

test('a year of moments draws only the ticks near the hairline, and the ends are reached by key and by drag', async ({ page }) => {
  const ages = Array.from({ length: 3000 }, (_, i) => i * 2.9 * HOUR)
  await longHistory(page, ages)
  expect(await ticks(page).count()).toBeLessThan(260)
  expect(await machine(page).locator('.tick-label').count()).toBeLessThan(60)
  await page.keyboard.press('Home')
  await expect(oldText(page)).toHaveText('Moment 0.')
  await expect(tape(page)).toHaveAttribute('aria-valuenow', '0')
  expect(await ticks(page).count()).toBeLessThan(260)
  await expect(ticks(page).first()).toBeAttached()
  await page.keyboard.press('End')
  await expect(oldText(page)).toHaveText('Words now.')
  // Thrown hard to the left, a drag goes a good way but never past what is drawn.
  await drag(page, 170, 5)
  await expect.poll(async () => (await settled(page)).gliding).toBe(false)
  const thrown = (await settled(page)).tick
  expect(thrown).toBeLessThan(3000 - 1)
  expect(await ticks(page).count()).toBeLessThan(260)
  expect((await settled(page)).x).toBe(thrown * 11)
})

test('labels go by age, none meet, now is the last, and a kept moment stands in the title colour', async ({ page }) => {
  await longHistory(page, yearOfAges(), 7)
  const labels = machine(page).locator('.tick-label')
  const texts = await labels.allTextContents()
  expect(texts.at(-1)).toBe('Now')
  // Hours have no leading zero; and what is older than the week is a date, or a month once it is a year back.
  expect(texts.some((t) => /^(0|[1-9]\d?):00$/.test(t))).toBe(true)
  expect(texts.some((t) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(t))).toBe(true)
  expect(texts.some((t) => /^(\d{1,2} )?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(t))).toBe(true)
  expect(texts.filter((t) => /^0\d:/.test(t))).toEqual([])
  const boxes = await labels.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right })))
  boxes.sort((a, b) => a.left - b.left)
  for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.left).toBeGreaterThanOrEqual(boxes[i - 1]!.right)
  // The tape is in the hand wherever it is: the oldest labels meet no neighbour either.
  await page.keyboard.press('Home')
  await expect(tape(page)).toHaveAttribute('aria-valuenow', '0')
  const old = await labels.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right })))
  old.sort((a, b) => a.left - b.left)
  for (let i = 1; i < old.length; i++) expect(old[i]!.left).toBeGreaterThanOrEqual(old[i - 1]!.right)
  const [kept, plain] = await Promise.all([
    machine(page)
      .locator('.tick[data-kept]')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    machine(page)
      .locator('.tick:not([data-kept])')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ])
  const colour = (name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
  expect(kept).not.toBe(plain)
  const probe = (value: string) =>
    page.evaluate((v) => {
      const el = document.createElement('i')
      el.style.color = v
      document.body.append(el)
      const c = getComputedStyle(el).color
      el.remove()
      return c
    }, value)
  expect(kept).toBe(await probe(await colour('--title')))
  expect(plain).toBe(await probe(await colour('--secondary')))
})

test('the tape fades at its edges over the ticks, not over the labels', async ({ page }) => {
  await longHistory(page, yearOfAges())
  const edge = await tape(page).evaluate((el) => {
    const s = getComputedStyle(el, '::before')
    return { image: s.backgroundImage, height: s.height, events: s.pointerEvents }
  })
  expect(edge.image).toContain('linear-gradient')
  expect(edge.height).toBe('29px')
  expect(edge.events).toBe('none')
})

/** A finger across the screen, by the browser's own touch input: `from` to `to`, in steps about 16ms apart. */
async function finger(page: Page, from: { x: number; y: number }, dx: number, steps = 8): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (dx * i) / steps, y: from.y }] })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('a finger on the tape moves the tape and turns no page, and a finger on the page turns', async ({ page, browserName }) => {
  test.skip(!phone(page) || browserName !== 'chromium', 'a finger is a phone’s, and is sent through Chromium’s own touch input')
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} goes on for a while, so that the text fills more than one page.`).join(' ')
  // Both of the last moments are more than a page, so a page turned by mistake would show.
  await history(page, ['One.', long, `${long} And more.`, 'Now.'])
  await open(page)
  await expect(oldText(page)).toContainText('And more.')
  await expect(tape(page)).toBeFocused()
  const left = () =>
    machine(page)
      .locator('.pager')
      .evaluate((el) => el.scrollLeft)
  const box = (await tape(page).boundingBox())!
  // Dragged right by a tick (44px with so few), the tape goes to the moment before.
  await finger(page, { x: box.x + box.width / 2, y: box.y + 14 }, 44)
  await expect(tape(page)).toHaveAttribute('aria-valuenow', '1')
  await expect(oldText(page)).not.toContainText('And more.')
  await expect(oldText(page)).toContainText('Paragraph 40')
  await page.waitForTimeout(500)
  expect(await left()).toBe(0)
  // Swiped left across the page, the page turns and the tape stays.
  const page1 = (await machine(page).locator('.pager').boundingBox())!
  await finger(page, { x: page1.x + page1.width * 0.8, y: page1.y + 200 }, -160)
  await expect.poll(left).toBeGreaterThan(0)
  await expect(tape(page)).toHaveAttribute('aria-valuenow', '1')
})

test('a swipe sent as plain touch events on the tape does not reach the page', async ({ page }) => {
  test.skip(!phone(page), 'a swipe is a phone’s turn')
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} goes on for a while, so that the text fills more than one page.`)
  await history(page, [long.join(' '), 'Short.'])
  await open(page)
  await expect(oldText(page)).toContainText('Paragraph 40')
  const left = () =>
    machine(page)
      .locator('.pager')
      .evaluate((el) => el.scrollLeft)
  const swipe = (selector: string, dx: number) =>
    machine(page)
      .locator(selector)
      .first()
      .evaluate((el, dx) => {
        const touch = (clientX: number) => ({ clientX, clientY: 300 })
        const send = (type: string, x: number) =>
          el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { touches: [touch(x)], changedTouches: [touch(x)] }))
        send('touchstart', 200)
        send('touchend', 200 + dx)
      }, dx)
  await swipe('.tape', -150)
  await page.waitForTimeout(600)
  expect(await left()).toBe(0)
  await swipe('.pager', -150)
  await expect.poll(left).toBeGreaterThan(0)
  await swipe('.tape', 150)
  await page.waitForTimeout(600)
  expect(await left()).toBeGreaterThan(0)
})

/** What the page animates by script, from here on: where, what, how long. */
async function recordAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: { on: string; props: string[]; ms: number }[] = []
    ;(window as unknown as { __animated: typeof seen }).__animated = seen
    const animate = Element.prototype.animate
    Element.prototype.animate = function (this: Element, keyframes, options) {
      const frames = keyframes as Keyframe[]
      seen.push({ on: String(this.className), props: Object.keys(frames[0] ?? {}), ms: Number((options as KeyframeAnimationOptions).duration) })
      return animate.call(this, keyframes, options)
    }
  })
}
const animated = (page: Page) => page.evaluate(() => (window as unknown as { __animated: { on: string; props: string[]; ms: number }[] }).__animated.slice())
const clearAnimated = (page: Page) => page.evaluate(() => (window as unknown as { __animated: unknown[] }).__animated.splice(0))

test('it opens and closes as a 220ms cross-fade, and a change of moment is a 120ms fade in place', async ({ page }) => {
  await recordAnimations(page)
  await history(page, ['One.', 'Two.', 'Three.'])
  await clearAnimated(page)
  await open(page)
  expect(await animated(page)).toContainEqual({ on: expect.stringContaining('time-machine'), props: ['opacity'], ms: 220 })
  await expect(oldText(page)).toHaveText('Two.')
  await expect(tape(page)).toBeFocused()
  await clearAnimated(page)
  await page.keyboard.press('ArrowLeft')
  await expect(oldText(page)).toHaveText('One.')
  const step = await animated(page)
  // The text only fades, in place; the tape's own glide is the one thing that moves.
  expect(step.filter((a) => a.props.includes('opacity')).map((a) => a.ms)).toContain(120)
  for (const a of step) if (a.props.includes('transform')) expect(a.on).toContain('tape-ticks')
  expect(step.some((a) => a.props.includes('transform') && !a.on.includes('tape-ticks'))).toBe(false)
  await clearAnimated(page)
  await page.keyboard.press('Escape')
  // Fading out: no longer answering, and then gone.
  await expect(machine(page)).toHaveAttribute('inert', '')
  expect(await animated(page)).toContainEqual({ on: expect.stringContaining('time-machine'), props: ['opacity'], ms: 220 })
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.body')).toHaveText('Three.')
})

test('with reduced motion nothing glides or fades, and it is gone at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await recordAnimations(page)
  await essay(page, 'Words now.')
  await seed(page, yearOfAges())
  await open(page)
  await expect(ticks(page).first()).toBeVisible()
  await expect(tape(page)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(tape(page)).toHaveAttribute('aria-valuenow', String(yearOfAges().length - 3))
  await drag(page, 100, 6)
  const after = await settled(page)
  expect(after.gliding).toBe(false)
  expect(after.x).toBe(after.tick * 11)
  await page.keyboard.press('Escape')
  await expect(machine(page)).toHaveCount(0)
  expect(await animated(page)).toEqual([])
})
