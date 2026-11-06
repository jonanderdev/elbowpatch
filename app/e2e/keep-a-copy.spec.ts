import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, openTools, saved } from './helpers'

const machine = (page: Page) => page.locator('.time-machine')
const bar = (page: Page) => machine(page).locator('.moment-bar')
const keepCopy = (page: Page) => machine(page).getByRole('button', { name: 'Keep a copy' })
/** The writing page's own title, not the Time Machine's. */
const title = (page: Page) => page.getByLabel('Title')
const line = (page: Page) => page.locator('.line.calm')

/** A new essay with these words, saved. */
async function essay(page: Page, words: string, title: string): Promise<void> {
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await page.keyboard.type(words)
  await saved(page, words)
}

async function open(page: Page): Promise<void> {
  await openTools(page)
  await page.getByRole('button', { name: 'Time Machine' }).click()
  await expect(machine(page)).toBeVisible()
  await expect(machine(page).locator('.moment-name, .moment-note').first()).not.toHaveText('Finding your moments…')
}

/** An essay that has two moments: the first words, then the second. */
async function twoMoments(page: Page, first: string, second: string, title = 'Salt on the windows'): Promise<void> {
  await essay(page, first, title)
  await open(page)
  await machine(page).getByRole('button', { name: 'Back to now' }).click()
  await expect(machine(page)).toHaveCount(0)
  await caretToEnd(page)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(second)
  await saved(page, second)
}

interface Everything {
  pieces: { id: string; title: string; kind: string; lang: string; words?: Record<string, number> }[]
  versions: { id: string; pieceId: string; seq: number; createdAt: number; content: string }[]
  outlines: { id: string; pieceId: string; title: string; createdAt: number }[]
  working: { pieceId: string; sectionId: string; content: string; baseVersionId: string }[]
}

/** Everything stored, as it stands. */
function stored(page: Page): Promise<Everything> {
  return page.evaluate(
    () =>
      new Promise<Everything>((done, failed) => {
        const open = indexedDB.open('elbowpatch')
        open.onerror = () => failed(open.error)
        open.onsuccess = () => {
          const db = open.result
          const names = ['pieces', 'versions', 'outlines', 'working'] as const
          const tx = db.transaction([...names])
          const out: Record<string, unknown[]> = {}
          for (const name of names) {
            const all = tx.objectStore(name).getAll()
            all.onsuccess = () => {
              out[name] = all.result
            }
          }
          tx.oncomplete = () => {
            db.close()
            done(out as unknown as Everything)
          }
          tx.onerror = () => failed(tx.error)
        }
      }),
  )
}

test('keeps a copy of that moment as a new essay, opened at once with one calm line', async ({ page }) => {
  await twoMoments(page, 'The first words.', 'The second words.')
  await open(page)
  // Opening takes a moment first: what the source holds now is what it must still hold after.
  const before = await stored(page)
  const source = before.pieces[0]!
  await expect(machine(page).locator('.body')).toHaveText('The first words.')
  await keepCopy(page).click()

  await expect(machine(page)).toHaveCount(0)
  await expect(title(page)).toHaveText('Salt on the windows, draft 2')
  await expect(page.locator('.body')).toHaveText('The first words.')
  await expect(line(page)).toHaveText(/^A copy of .+, kept as a new essay\.$/)
  // Secondary, with no surface; the folio stands aside.
  expect(await line(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  await expect(page.locator('.folio')).toHaveCount(0)
  // The page is the copy's, and it can be written in.
  await expect(page).toHaveURL(/#\/p\/(?!$)/)
  expect(new URL(page.url()).hash).not.toContain(source.id)

  // Its history starts now: one moment, with today's date, and nothing of the source's.
  const after = await stored(page)
  const copy = after.pieces.find((p) => p.id !== source.id)!
  expect(copy.title).toBe('Salt on the windows, draft 2')
  expect(copy.kind).toBe('essay')
  expect(copy.lang).toBe(source.lang)
  const versions = after.versions.filter((v) => v.pieceId === copy.id)
  expect(versions).toHaveLength(1)
  expect(versions[0]!.content).toBe('The first words.')
  expect(Math.abs(versions[0]!.createdAt - Date.now())).toBeLessThan(60_000)
  expect(after.outlines.filter((o) => o.pieceId === copy.id).map((o) => o.title)).toEqual(['Salt on the windows, draft 2'])

  // The piece it came from is untouched.
  const same = (e: Everything) => ({
    versions: e.versions.filter((v) => v.pieceId === source.id),
    outlines: e.outlines.filter((o) => o.pieceId === source.id),
    working: e.working.filter((w) => w.pieceId === source.id),
  })
  expect(same(after)).toEqual(same(before))
})

test('leaves the Time Machine’s history entry behind: back goes to the piece it came from', async ({ page }) => {
  await twoMoments(page, 'The first words.', 'The second words.')
  await open(page)
  await keepCopy(page).click()
  await expect(title(page)).toHaveText('Salt on the windows, draft 2')
  await page.goBack()
  await expect(title(page)).toHaveText('Salt on the windows')
  // It fades out over the page for a moment before it is gone.
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.body')).toHaveText('The second words.')
})

test('the number goes up with each copy, and the calm line goes after a few seconds', async ({ page }) => {
  await twoMoments(page, 'The first words.', 'The second words.')
  await open(page)
  await keepCopy(page).click()
  await expect(title(page)).toHaveText('Salt on the windows, draft 2')
  await expect(line(page)).toHaveCount(0, { timeout: 8000 })
  await page.goBack()
  await expect(title(page)).toHaveText('Salt on the windows')
  await open(page)
  await keepCopy(page).click()
  await expect(title(page)).toHaveText('Salt on the windows, draft 3')
})

test('two presses make one copy', async ({ page }) => {
  await twoMoments(page, 'The first words.', 'The second words.')
  await open(page)
  await keepCopy(page).evaluate((button: HTMLElement) => {
    button.click()
    button.click()
  })
  await expect(title(page)).toHaveText('Salt on the windows, draft 2')
  expect((await stored(page)).pieces).toHaveLength(2)
})

test('a copy that cannot be stored leaves nothing made, stays on the moment, and tries again', async ({ page }) => {
  await twoMoments(page, 'The first words.', 'The second words.')
  await open(page)
  await page.evaluate(() => {
    ;(window as unknown as { __put: unknown }).__put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('The disk is full.', 'QuotaExceededError')
    }
  })
  await keepCopy(page).click()
  await expect(bar(page).getByRole('alert')).toHaveText('Couldn’t keep a copy just now. Nothing has changed.')
  await expect(bar(page).getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(bar(page).getByRole('button', { name: 'Back to now' })).toBeVisible()
  await expect(machine(page).locator('.body')).toHaveText('The first words.')
  expect((await stored(page)).pieces).toHaveLength(1)

  await page.evaluate(() => {
    IDBObjectStore.prototype.put = (window as unknown as { __put: typeof IDBObjectStore.prototype.put }).__put
  })
  await bar(page).getByRole('button', { name: 'Try again' }).click()
  await expect(title(page)).toHaveText('Salt on the windows, draft 2')
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.body')).toHaveText('The first words.')
  expect((await stored(page)).pieces).toHaveLength(2)
})
