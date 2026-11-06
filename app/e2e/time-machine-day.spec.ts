import { expect, type Locator, type Page, test } from '@playwright/test'
import { caretToEnd, openTools, saved } from './helpers'

// Friday 30 October 2026: fixed, so today and the days before it are the ones named.
const NOW = new Date(2026, 9, 30, 10, 0)
const THURSDAY = new Date(2026, 9, 29, 10, 0)

const DAYS: Record<string, string> = {
  '2026-10-22': 'Rain on the skylight.',
  '2026-10-29': 'The bakery again today.',
}

const machine = (page: Page) => page.locator('.time-machine')
const phone = (page: Page): boolean => page.viewportSize()!.width < 700
const count = (text: string): number => text.split(/\s+/).filter(Boolean).length

/** Stores a journal with these days, as earlier sessions left it, and opens it on today. */
async function openJournal(page: Page, now = NOW, title = 'Friday 30 October'): Promise<void> {
  await page.clock.setFixedTime(now)
  await page.goto('./')
  await expect(page.locator('.start.journal')).toBeVisible()
  const sections = Object.keys(DAYS).map((title, i) => ({ sectionId: `day-${i}`, title }))
  const piece = {
    id: 'journal',
    kind: 'journal',
    lang: 'en',
    createdAt: now.getTime() - 1000,
    updatedAt: now.getTime() - 1000,
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
    updatedAt: now.getTime() - 1000,
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
  await expect(page.locator('.title')).toHaveText(title)
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

/** Goes to a written day, by the month on a phone and the rail on desktop: 'Thursday 29 October'. */
async function toDay(page: Page, day: string): Promise<void> {
  const [weekday, date, month] = day.split(' ') as [string, string, string]
  if (phone(page)) {
    await page.locator('.page-button').click()
    await page.locator('.tools button.count').click()
    await page
      .getByRole('dialog', { name: 'Days' })
      .getByRole('button', { name: `${date} ${month}, written`, exact: true })
      .click()
  } else
    await page
      .getByRole('navigation', { name: 'Days' })
      .getByRole('button', { name: new RegExp(`^${weekday} ${date} ${month}`) })
      .click()
  await expect(page.locator('.title')).toHaveText(day)
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

const toThursday = (page: Page): Promise<void> => toDay(page, 'Thursday 29 October')

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
  // Days is still there, as the journal stands: the running head is no dead control.
  const days = await daysAsItWas(page)
  await expect(days.getByRole('button', { name: phone(page) ? '29 October, written' : /^Thursday 29 October/, exact: phone(page) })).toBeEnabled()
})

// Days as it was (#89).

/** Looking back takes a moment first: this keeps the words as they stand, then comes back. */
async function keepMoment(page: Page): Promise<void> {
  await open(page)
  await expect(machine(page).locator('.moment-note')).toHaveText('Nothing earlier yet. Moments are kept as you write.')
  await page.keyboard.press('Escape')
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

/** Replaces the open day's words. */
async function rewrite(page: Page, words: string): Promise<void> {
  await caretToEnd(page)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(words)
  await saved(page, words)
}

/** Days in the Time Machine: the rail on desktop, the month from the running head on a phone. */
async function daysAsItWas(page: Page): Promise<Locator> {
  if (phone(page)) {
    await machine(page).locator('.running-control').click()
    const sheet = machine(page).getByRole('dialog', { name: 'Days' })
    await expect(sheet).toBeVisible()
    return sheet
  }
  const rail = machine(page).getByRole('navigation', { name: 'Days' })
  await expect(rail).toBeVisible()
  return rail
}

/** Turns to a day by Days, as it was. */
async function turnToDay(page: Page, title: string): Promise<void> {
  const days = await daysAsItWas(page)
  const [weekday, date, month] = title.split(' ') as [string, string, string]
  if (phone(page)) await days.getByRole('button', { name: `${date} ${month}, written`, exact: true }).click()
  else await days.getByRole('button', { name: new RegExp(`^${weekday} ${date} ${month}`) }).click()
  await expect(machine(page).locator('.title')).toHaveText(title)
}

/** Thursday written on Thursday, then changed; Friday begun after, so it is a day the moment does not have. Opens on Thursday. */
async function fridayAfterThursday(page: Page): Promise<void> {
  await openJournal(page, THURSDAY, 'Thursday 29 October')
  await keepMoment(page)
  await rewrite(page, 'A changed day.')
  await page.clock.setFixedTime(NOW)
  await page.reload()
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await caretToEnd(page)
  await page.keyboard.type('Friday words.')
  await saved(page, 'Friday words.')
  await toThursday(page)
  await open(page)
  await expect(machine(page).locator('.body')).toHaveText('The bakery again today.')
}

test('Days opens as it was: the days written by that moment, none later, and nothing marked as today', async ({ page }) => {
  await fridayAfterThursday(page)
  const days = await daysAsItWas(page)
  if (phone(page)) {
    await expect(days.getByText('October 2026')).toBeVisible()
    await expect(days.getByRole('button', { name: '22 October, written', exact: true })).toBeEnabled()
    await expect(days.getByRole('button', { name: '29 October, written', exact: true })).toBeEnabled()
    // The day after the moment recedes, and cannot be opened.
    await expect(days.getByRole('button', { name: '30 October, still to come', exact: true })).toBeDisabled()
    await expect(days.getByRole('button', { name: /today/ })).toHaveCount(0)
    await expect(days.getByText('2 days written in October')).toBeVisible()
  } else {
    await expect(days.getByRole('button')).toHaveCount(2)
    await expect(days.getByRole('button', { name: /^Thursday 29 October/ })).toHaveAttribute('aria-current', 'true')
    await expect(days.getByRole('button', { name: /^Thursday 22 October/ })).toBeVisible()
    await expect(days.getByRole('button', { name: /^Friday 30 October/ })).toHaveCount(0)
    await expect(days.getByText(/Today/)).toHaveCount(0)
    await expect(days.locator('.rail-line')).toHaveText('2 days · 2 in October')
  }

  // At now the journal has the day written since, and still marks none as today.
  if (phone(page)) await page.keyboard.press('Escape')
  await machine(page).getByRole('slider', { name: 'Moment' }).focus()
  await page.keyboard.press('End')
  const now = await daysAsItWas(page)
  if (phone(page)) {
    await expect(now.getByRole('button', { name: '30 October, written', exact: true })).toBeEnabled()
    await expect(now.getByRole('button', { name: /today/ })).toHaveCount(0)
  } else {
    await expect(now.getByRole('button', { name: /^Friday 30 October/ })).toBeVisible()
    await expect(now.getByText(/Today/)).toHaveCount(0)
    await expect(now.locator('.rail-line')).toHaveText('3 days · 3 in October')
  }
})

test('a day chosen in Days opens as it was at the same time, on its day and not on the title page, and the title page is a turn back', async ({ page }) => {
  await fridayAfterThursday(page)
  const tape = machine(page).getByRole('slider', { name: 'Moment' })
  const when = await tape.getAttribute('aria-valuetext')
  await turnToDay(page, 'Thursday 22 October')
  await expect(machine(page).locator('.body')).toHaveText('Rain on the skylight.')
  await expect(machine(page).locator('.book-title')).not.toBeInViewport()
  if (phone(page)) await expect(machine(page).locator('.running-control')).toContainText('Thursday 22 October')

  // The oldest day has the journal's title page before it, as on the writing page.
  await page.keyboard.press('PageUp')
  await expect(machine(page).locator('.book-title')).toHaveText('Journal')
  await expect(machine(page).locator('.book-title')).toBeInViewport()
  if (phone(page)) await expect(machine(page).locator('.running-control')).toContainText('Journal')
  // Turning on goes through the days in order.
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await expect(machine(page).locator('.title')).toHaveText('Thursday 29 October')
  await expect(machine(page).locator('.body')).toHaveText('The bakery again today.')
  await expect(tape).toHaveAttribute('aria-valuetext', when ?? '')
  await page.keyboard.press('PageDown')
  await expect(machine(page).locator('.title')).toHaveText('Thursday 29 October')
})

test('the day the page was open on keeps its undo when another day is turned to and brought back', async ({ page }) => {
  await openJournal(page)
  // Both days have a moment before their change; the 22nd changes after the 29th's earlier moment is taken.
  await toDay(page, 'Thursday 22 October')
  await keepMoment(page)
  await toThursday(page)
  await keepMoment(page)
  await toDay(page, 'Thursday 22 October')
  await rewrite(page, 'Another changed day.')
  await toThursday(page)
  await rewrite(page, 'A changed day.')

  await open(page)
  await expect(machine(page).locator('.body')).toHaveText('The bakery again today.')
  await turnToDay(page, 'Thursday 22 October')
  await expect(machine(page).locator('.body')).toHaveText('Rain on the skylight.')
  await machine(page).getByRole('button', { name: 'Bring day back' }).click()
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.title')).toHaveText('Thursday 22 October')
  await expect(page.locator('.body')).toHaveText('Rain on the skylight.')

  // Back on Thursday, its own undo is still there: the words typed are taken back.
  await toThursday(page)
  await expect(page.locator('.body')).toHaveText('A changed day.')
  await caretToEnd(page)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.body')).toHaveText('The bakery again today.')
})
