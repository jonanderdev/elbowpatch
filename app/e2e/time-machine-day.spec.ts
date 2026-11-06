import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, openTools, saved } from './helpers'

// Friday 30 October 2026: fixed, so today and the days before it are the ones named.
const NOW = new Date(2026, 9, 30, 10, 0)

const DAYS: Record<string, string> = {
  '2026-10-22': 'Rain on the skylight.',
  '2026-10-29': 'The bakery again today.',
}

const machine = (page: Page) => page.locator('.time-machine')
const phone = (page: Page): boolean => page.viewportSize()!.width < 700
const count = (text: string): number => text.split(/\s+/).filter(Boolean).length

/** Stores a journal with these days, as earlier sessions left it, and opens it on today. */
async function openJournal(page: Page): Promise<void> {
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await expect(page.locator('.start.journal')).toBeVisible()
  const sections = Object.keys(DAYS).map((title, i) => ({ sectionId: `day-${i}`, title }))
  const piece = {
    id: 'journal',
    kind: 'journal',
    lang: 'en',
    createdAt: NOW.getTime() - 1000,
    updatedAt: NOW.getTime() - 1000,
    title: 'Journal',
    sections,
    words: Object.fromEntries(sections.map((s) => [s.sectionId, count(DAYS[s.title]!)])),
    outlineId: null,
  }
  const working = sections.map((s) => ({
    sectionId: s.sectionId,
    pieceId: piece.id,
    content: DAYS[s.title]!,
    baseVersionId: null,
    updatedAt: NOW.getTime() - 1000,
  }))
  await page.evaluate(
    ({ piece, working }) =>
      new Promise<void>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction(['pieces', 'working'], 'readwrite')
          tx.objectStore('pieces').put(piece)
          for (const w of working) tx.objectStore('working').put(w)
          tx.oncomplete = () => {
            db.close()
            done()
          }
        }
      }),
    { piece, working },
  )
  await page.reload()
  await page.locator('.row', { hasText: 'Journal' }).click()
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

/** Goes to Thursday 29 October, by the month on a phone and the rail on desktop. */
async function toThursday(page: Page): Promise<void> {
  if (phone(page)) {
    await page.locator('.page-button').click()
    await page.locator('.tools button.count').click()
    await page.getByRole('dialog', { name: 'Days' }).getByRole('button', { name: '29 October, written', exact: true }).click()
  } else
    await page
      .getByRole('navigation', { name: 'Days' })
      .getByRole('button', { name: /^Thursday 29 October/ })
      .click()
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

async function open(page: Page): Promise<void> {
  await openTools(page)
  await page.getByRole('button', { name: 'Time Machine' }).click()
  await expect(machine(page)).toBeVisible()
}

function all<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (store) =>
      new Promise<T[]>((done, failed) => {
        const open = indexedDB.open('elbowpatch')
        open.onerror = () => failed(open.error)
        open.onsuccess = () => {
          const db = open.result
          const rows = db.transaction(store).objectStore(store).getAll()
          rows.onsuccess = () => {
            db.close()
            done(rows.result as T[])
          }
        }
      }),
    store,
  )
}

type Working = { sectionId: string; content: string }
type Version = { sectionId: string; seq: number; content: string; beforeBringBack?: boolean }

/** Thursday written as `The bakery again today.`, a moment of it taken, then changed to this. */
async function changedThursday(page: Page, words: string): Promise<void> {
  await openJournal(page)
  await toThursday(page)
  await open(page)
  await expect(machine(page).locator('.moment-note')).toHaveText('Nothing earlier yet. Moments are kept as you write.')
  await page.keyboard.press('Escape')
  await expect(machine(page)).toHaveCount(0)
  await caretToEnd(page)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(words)
  await saved(page, words)
}

test('opens on a journal day with its date as the title and the margin rule, and walks that day as it was', async ({ page }) => {
  await changedThursday(page, 'A changed day.')
  await open(page)
  await expect(machine(page)).toHaveClass(/journal/)
  await expect(machine(page).locator('.title')).toHaveText('Thursday 29 October')
  await expect(machine(page).locator('.body')).toHaveText('The bakery again today.')
  await expect(machine(page).getByRole('button', { name: 'Bring day back' })).toBeVisible()
  // The margin rule of a journal's page stands here too.
  const rule = await machine(page).evaluate((el) => {
    const style = getComputedStyle(el, '::before')
    return { content: style.content, width: style.width }
  })
  const writing = await page.locator('.page-screen.journal:not(.time-machine)').evaluate((el) => {
    const style = getComputedStyle(el, '::before')
    return { content: style.content, width: style.width }
  })
  expect(rule).toEqual(writing)
})

test('Bring day back restores only that day, lands on it and not on today, and says the rest is as it was', async ({ page }) => {
  await changedThursday(page, 'A changed day.')
  const other = (await all<Working>(page, 'working')).find((w) => w.content === DAYS['2026-10-22'])!
  // Typed an instant ago, not saved: only the page holds these words.
  await caretToEnd(page)
  await page.keyboard.type(' Typed just before.')
  await page.keyboard.press('Control+Alt+z')
  await expect(machine(page).locator('.body')).toHaveText('The bakery again today.')

  await machine(page).getByRole('button', { name: 'Bring day back' }).click()

  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await expect(page.locator('.body')).toHaveText('The bakery again today.')
  const line = page.locator('.line.calm')
  await expect(line).toHaveText('Thursday 29 October brought back from just now. The rest of the journal is as it was.')

  const rows = await all<Working>(page, 'working')
  expect(rows.map((w) => w.content).sort()).toEqual(['Rain on the skylight.', 'The bakery again today.'])
  expect(rows.find((w) => w.sectionId === other.sectionId)!.content).toBe('Rain on the skylight.')
  const versions = (await all<Version>(page, 'versions')).sort((a, b) => a.seq - b.seq)
  expect(versions.filter((v) => v.beforeBringBack).map((v) => v.content)).toEqual(['A changed day. Typed just before.'])
  expect(versions.filter((v) => v.sectionId === other.sectionId && v.beforeBringBack)).toHaveLength(0)

  // The page's own closing save, the line's end and a reload never put the held words over it.
  await expect(line).toHaveCount(0, { timeout: 8000 })
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('elbowpatch.unsaved.')))).toEqual([])
  await page.reload()
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
  await toThursday(page)
  await expect(page.locator('.body')).toHaveText('The bakery again today.')
  expect((await all<Working>(page, 'working')).map((w) => w.content).sort()).toEqual(['Rain on the skylight.', 'The bakery again today.'])
})

test('words a failed save left in the journal for the day never come back over what was brought back', async ({ page }) => {
  await changedThursday(page, 'A changed day.')
  await open(page)
  const day = (await all<Working>(page, 'working')).find((w) => w.content === 'A changed day.')!.sectionId
  // Words held outside the database, older than the stored copy: a failed save of a session long gone.
  await page.evaluate((day) => {
    localStorage.setItem(
      `elbowpatch.unsaved.${day}`,
      JSON.stringify({
        piece: { id: 'journal', kind: 'journal', lang: 'en', title: 'Journal', sections: [], words: {}, outlineId: null, createdAt: 0, updatedAt: 0 },
        pieceId: 'journal',
        sectionId: day,
        name: 'journal.md',
        markdown: 'Old held words.',
        title: null,
        at: 1,
      }),
    )
  }, day)

  await machine(page).getByRole('button', { name: 'Bring day back' }).click()
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.body')).toHaveText('The bakery again today.')
  await page.reload()
  await toThursday(page)
  await expect(page.locator('.body')).toHaveText('The bakery again today.')
  expect((await all<Working>(page, 'working')).find((w) => w.sectionId === day)!.content).toBe('The bakery again today.')
})

test('a day not stored yet shows Nothing earlier', async ({ page }) => {
  await openJournal(page)
  await page.keyboard.press('Control+Alt+z')
  await expect(machine(page).locator('.moment-note')).toHaveText('Nothing earlier yet. Moments are kept as you write.')
  await expect(machine(page).getByRole('button', { name: 'Bring day back' })).toHaveCount(0)
  await expect(machine(page).locator('.title')).toHaveText('Friday 30 October')
})
