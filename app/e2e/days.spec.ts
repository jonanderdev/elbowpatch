import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, saved } from './helpers'

// Friday 30 October 2026: fixed, so the month and its days are the ones drawn.
const NOW = new Date(2026, 9, 30, 10, 0)

const LONG = Array.from(
  { length: 40 },
  (_, i) => `Paragraph ${i} of a long day, with enough words in it to fill a good part of a line or two on the page.`,
).join('\n\n')

/** Written days, by date. */
const DAYS: Record<string, string> = {
  '2026-09-12': 'A day in September.',
  '2026-10-22': 'Rain on the skylight.',
  '2026-10-26': LONG,
  '2026-10-29': 'The bakery again today.',
}

const phone = (page: Page): boolean => page.viewportSize()!.width < 700
const phoneOnly = (page: Page): void => test.skip(!phone(page), 'the month sheet is a phone’s')
const desktopOnly = (page: Page): void => test.skip(phone(page), 'the rail is desktop’s')

/** On macOS, WebKit's Tab skips buttons unless Option is held, as Safari's does. */
const tab = (browserName: string): string => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab')

const count = (text: string): number => text.split(/\s+/).filter(Boolean).length

/** Stores a journal with these days, as earlier sessions left it, and opens it. */
async function openJournal(page: Page, days: Record<string, string> = DAYS): Promise<void> {
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await expect(page.locator('.start.journal')).toBeVisible()
  const sections = Object.keys(days).map((title, i) => ({ sectionId: `day-${i}`, title }))
  const piece = {
    id: 'journal',
    kind: 'journal',
    lang: 'en',
    createdAt: NOW.getTime() - 1000,
    updatedAt: NOW.getTime() - 1000,
    title: 'Journal',
    sections,
    words: Object.fromEntries(sections.map((s) => [s.sectionId, count(days[s.title]!)])),
    outlineId: null,
  }
  const working = sections.map((s) => ({
    sectionId: s.sectionId,
    pieceId: piece.id,
    content: days[s.title]!,
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
  // Nothing can be typed until this window is the one writing: the page opens read only, for a moment.
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

/** The sections stored, by date. */
const storedDays = (page: Page): Promise<string[]> =>
  page.evaluate(
    () =>
      new Promise<string[]>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const db = open.result
          const all = db.transaction('pieces').objectStore('pieces').getAll()
          all.onsuccess = () => {
            db.close()
            done(all.result[0].sections.map((s: { title: string }) => s.title))
          }
        }
      }),
  )

/** The journal's name, as stored. */
const storedTitle = (page: Page): Promise<string | undefined> =>
  page.evaluate(
    () =>
      new Promise<string | undefined>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const db = open.result
          const all = db.transaction('pieces').objectStore('pieces').getAll()
          all.onsuccess = () => {
            db.close()
            done(all.result[0]?.title)
          }
        }
      }),
  )

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Days' })
const rail = (page: Page) => page.getByRole('navigation', { name: 'Days' })
const day = (page: Page, name: string) => sheet(page).getByRole('button', { name, exact: true })

/** Opens the month from the count in the tools bar. */
async function openMonth(page: Page): Promise<void> {
  await page.locator('.page-button').click()
  await page.locator('.tools button.count').click()
  await expect(sheet(page)).toBeVisible()
}

/** Goes to a day by whichever way this screen has. */
async function goTo(page: Page, row: RegExp, cell: string): Promise<void> {
  if (phone(page)) {
    await openMonth(page)
    await day(page, cell).click()
  } else await rail(page).getByRole('button', { name: row }).click()
}

test('the count names the day and opens the month, which says how many days are written', async ({ page }) => {
  phoneOnly(page)
  await openJournal(page)
  await page.locator('.page-button').click()
  await expect(page.locator('.tools button.count')).toHaveText(/^30 Oct\s+·\s+0 words$/)
  await page.locator('.tools button.count').click()
  await expect(sheet(page).locator('.month-title')).toHaveText('October 2026')
  await expect(sheet(page).getByText('3 days written in October')).toBeVisible()
  // Above the tools bar it came from, as drawn.
  const box = (await sheet(page).boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual((await page.locator('.tools').boundingBox())!.y)
  expect(box.width).toBe(366)
})

test('a written day opens with one tap, at its opening page, and the sheet goes', async ({ page }) => {
  phoneOnly(page)
  await openJournal(page)
  await openMonth(page)
  await day(page, '29 October, written').click()
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await expect(page.locator('.body')).toContainText('The bakery again today.')
  await expect(sheet(page)).toHaveCount(0)
})

test('a past day with nothing written opens, and is stored only by its first words, in date order', async ({ page }) => {
  phoneOnly(page)
  await openJournal(page)
  await openMonth(page)
  await day(page, '4 October, nothing written').click()
  await expect(page.locator('.title')).toHaveText('Sunday 4 October')
  // Looked at and left: it never joins.
  await page.keyboard.press('PageDown')
  await expect(page.locator('.title')).toHaveText('Thursday 22 October')
  await expect.poll(() => storedDays(page)).toEqual(Object.keys(DAYS))

  await openMonth(page)
  await day(page, '4 October, nothing written').click()
  await expect(page.locator('.title')).toHaveText('Sunday 4 October')
  await caretToEnd(page)
  await page.keyboard.insertText('Written late.')
  await saved(page, 'Written late.')
  await expect.poll(() => storedDays(page)).toEqual(['2026-09-12', '2026-10-04', '2026-10-22', '2026-10-26', '2026-10-29'])
  await page.keyboard.press('PageUp')
  await expect(page.locator('.title')).toHaveText('Saturday 12 September')
  await page.keyboard.press('PageDown')
  await expect(page.locator('.title')).toHaveText('Sunday 4 October')
  await expect(page.locator('.body')).toHaveText('Written late.')
})

test('in a journal with nothing stored, a past day opens and keeps its first words', async ({ page }) => {
  phoneOnly(page)
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await page.locator('.start.journal').click()
  await expect(page.locator('.book-title')).toBeFocused()
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await openMonth(page)
  await day(page, '4 October, nothing written').click()
  await expect(page.locator('.title')).toHaveText('Sunday 4 October')
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await caretToEnd(page)
  await page.keyboard.insertText('The first words.')
  await saved(page, 'The first words.')
  await expect.poll(() => storedDays(page)).toEqual(['2026-10-04'])
})

test('a new journal named on its title page stores its name, and no day until its first words', async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await page.locator('.start.journal').click()
  await expect(page.locator('.book-title')).toBeFocused()
  await page.keyboard.insertText('Dream journal')
  await expect.poll(() => storedTitle(page)).toBe('Dream journal')
  expect(await storedDays(page)).toEqual([])
  await page.keyboard.press('PageDown')
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await caretToEnd(page)
  await page.keyboard.insertText('The first words.')
  await saved(page, 'The first words.')
  await expect.poll(() => storedDays(page)).toEqual(['2026-10-30'])
})

test('a day before all the others, its journal renamed on its title page, still keeps its first words', async ({ page }) => {
  phoneOnly(page)
  await openJournal(page, { '2026-10-22': 'Rain on the skylight.' })
  await openMonth(page)
  await day(page, '4 October, nothing written').click()
  await expect(page.locator('.title')).toHaveText('Sunday 4 October')
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await expect(async () => {
    await page.keyboard.press('PageUp')
    await expect(page.locator('.book-title')).toBeInViewport({ timeout: 300 })
  }).toPass({ timeout: 5000 })
  await page.locator('.book-title').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('Dream journal')
  await expect.poll(() => storedTitle(page)).toBe('Dream journal')
  expect(await storedDays(page)).toEqual(['2026-10-22'])
  await page.keyboard.press('PageDown')
  await caretToEnd(page)
  await page.keyboard.insertText('Written late.')
  await saved(page, 'Written late.')
  await expect.poll(() => storedDays(page)).toEqual(['2026-10-04', '2026-10-22'])
  await page.reload()
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
  await openMonth(page)
  await day(page, '4 October, written').click()
  await expect(page.locator('.body')).toHaveText('Written late.')
})

test('days still to come cannot be opened; today can', async ({ page }) => {
  phoneOnly(page)
  await openJournal(page)
  await openMonth(page)
  await expect(day(page, '31 October, still to come')).toBeDisabled()
  await day(page, '29 October, written').click()
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await openMonth(page)
  await day(page, '30 October, today').click()
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
})

test('the arrows move between months, and the count follows', async ({ page }) => {
  phoneOnly(page)
  await openJournal(page)
  await openMonth(page)
  await sheet(page).getByRole('button', { name: 'September 2026' }).click()
  await expect(sheet(page).locator('.month-title')).toHaveText('September 2026')
  await expect(sheet(page).getByText('1 day written in September')).toBeVisible()
  await sheet(page).getByRole('button', { name: 'August 2026' }).click()
  await expect(sheet(page).getByText('No days written in August')).toBeVisible()
  await sheet(page).getByRole('button', { name: 'September 2026' }).click()
  await day(page, '12 September, written').click()
  await expect(page.locator('.title')).toHaveText('Saturday 12 September')
})

test('from a day’s second page the running head names the day and drops the month under the head', async ({ page }) => {
  phoneOnly(page)
  await openJournal(page)
  await openMonth(page)
  await day(page, '26 October, written').click()
  await expect(page.locator('.title')).toHaveText('Monday 26 October')
  // Its opening page carries the date already.
  await expect(page.locator('.running-control')).toHaveCount(0)
  await page.keyboard.press('PageDown')
  const head = page.getByRole('button', { name: 'Monday 26 October. Days' })
  await head.click()
  await expect(sheet(page)).toBeVisible()
  await expect(head).toHaveAttribute('aria-expanded', 'true')
  expect((await sheet(page).boundingBox())!.y).toBe(56)
  await sheet(page).getByRole('button', { name: 'Done' }).click()
  await expect(sheet(page)).toHaveCount(0)

  // Under the head whatever else is open: it stands by what opened it.
  await page.locator('.page-button').click()
  await head.click()
  await expect(sheet(page)).toBeVisible()
  expect((await sheet(page).boundingBox())!.y).toBe(56)
})

test('the month reaches every day by keyboard, and Escape gives the focus back', async ({ page, browserName }) => {
  phoneOnly(page)
  await openJournal(page)
  await page.locator('.page-button').click()
  await page.locator('.tools button.count').focus()
  await page.keyboard.press('Enter')
  await expect(day(page, '30 October, today')).toBeFocused()
  await page.keyboard.press(`Shift+${tab(browserName)}`)
  await expect(day(page, '29 October, written')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.locator('.tools button.count')).toBeFocused()
})

test('the rail lists the days under their months, Today first, the open day tinted', async ({ page }) => {
  desktopOnly(page)
  await openJournal(page)
  await expect(rail(page).locator('.rail-line')).toHaveText('4 days · 3 in October')
  await expect(rail(page).locator('.days-month-name')).toHaveText(['October', 'September'])
  await expect(rail(page).locator('.contents-title')).toHaveText(['Today, Friday 30', 'Thursday 29', 'Monday 26', 'Thursday 22', 'Saturday 12'])
  const today = rail(page).locator('.contents-row').first()
  await expect(today.locator('.contents-page')).toHaveText('nothing yet')
  await expect(today).toHaveAttribute('aria-current', 'true')
  await expect(rail(page).locator('.contents-row').nth(1).locator('.contents-page')).toHaveText('4')
  await expect(page.locator('.head-tools .count')).toContainText('30 Oct')
})

test('a day chosen in the rail opens, takes the tint, and its month is the one counted', async ({ page }) => {
  desktopOnly(page)
  await openJournal(page)
  await rail(page)
    .getByRole('button', { name: /^Saturday 12 September/ })
    .click()
  await expect(page.locator('.title')).toHaveText('Saturday 12 September')
  await expect(rail(page).locator('[aria-current="true"]')).toContainText('Saturday 12')
  await expect(rail(page).locator('.rail-line')).toHaveText('4 days · 1 in September')
})

test('a day from another year says its year, in the count and over the rail’s month', async ({ page }) => {
  desktopOnly(page)
  await openJournal(page, { '2025-12-24': 'An old day.' })
  await rail(page)
    .getByRole('button', { name: /^Wednesday 24 December/ })
    .click()
  await expect(page.locator('.head-tools .count')).toContainText('24 Dec 2025')
  await expect(rail(page).locator('.days-month-name')).toHaveText(['October', 'December 2025'])
})

test('the rail folds as a book’s does, and gives way to the keyboard', async ({ page, browserName }) => {
  desktopOnly(page)
  await openJournal(page)
  const toggle = page.locator('.head').getByRole('button', { name: 'Days', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.focus()
  await page.keyboard.press(tab(browserName))
  await expect(rail(page).locator('.contents-row').first()).toBeFocused()
  await page.keyboard.press(tab(browserName))
  await page.keyboard.press('Enter')
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await toggle.click()
  await expect(rail(page)).toBeHidden()
})

test('a rail has no edge of its own: the journal’s margin rule is the line', async ({ page }) => {
  desktopOnly(page)
  await openJournal(page)
  await expect(rail(page)).toHaveCSS('border-right-width', '0px')
})

test('turning past a day’s last page goes to the next day, and back to the day’s last page', async ({ page }) => {
  await openJournal(page)
  await goTo(page, /^Monday 26 October/, '26 October, written')
  await expect(page.locator('.title')).toHaveText('Monday 26 October')
  // Through the long day to the next one written.
  await expect(async () => {
    await page.keyboard.press('PageDown')
    await expect(page.locator('.body')).toContainText('The bakery again today.', { timeout: 300 })
  }).toPass({ timeout: 15000 })
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await page.keyboard.press('PageUp')
  await expect(page.locator('.body')).toContainText('Paragraph 39')
  await expect(page.locator('.title')).toHaveText('Monday 26 October')
})

test('turning crosses from today to the last day written and back, and stops at the journal’s ends', async ({ page }) => {
  await openJournal(page, { '2026-10-28': 'First day.', '2026-10-29': 'Second day.' })
  await page.keyboard.press('PageDown')
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
  await page.keyboard.press('PageUp')
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await page.keyboard.press('PageUp')
  await expect(page.locator('.title')).toHaveText('Wednesday 28 October')
  await page.keyboard.press('PageDown')
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await page.keyboard.press('PageDown')
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
  // Today is the end: a turn on goes nowhere.
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageUp')
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
})

test('turning back from the first day reaches the title page, and goes no further', async ({ page }) => {
  await openJournal(page, { '2026-10-28': 'First day.' })
  await page.keyboard.press('PageUp')
  await expect(page.locator('.title')).toHaveText('Wednesday 28 October')
  // Again until it holds: the page settles once the fonts are in, and a turn in that instant is taken back.
  await expect(async () => {
    await page.keyboard.press('PageUp')
    await expect(page.locator('.book-title')).toBeInViewport({ timeout: 300 })
  }).toPass({ timeout: 5000 })
  await page.keyboard.press('PageUp')
  await expect(page.locator('.title')).toHaveText('Wednesday 28 October')
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
})

test('a new day is stored only by its first words: looked at and left, it never joins', async ({ page }) => {
  await openJournal(page)
  await page.keyboard.press('PageUp')
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await page.keyboard.press('PageDown')
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
  await page.keyboard.press('PageUp')
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await expect.poll(() => storedDays(page)).toEqual(Object.keys(DAYS))
})

test('today’s words are safe when the writer goes straight to another day, and there on the way back', async ({ page }) => {
  await openJournal(page)
  await caretToEnd(page)
  await page.keyboard.insertText('Words for today.')
  await page.keyboard.press('PageUp')
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await saved(page, 'Words for today.')
  await expect.poll(() => storedDays(page)).toContain('2026-10-30')
  await page.keyboard.press('PageDown')
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
  await expect(page.locator('.body')).toHaveText('Words for today.')
})

test('words added to an earlier day stay on that day', async ({ page }) => {
  await openJournal(page)
  await goTo(page, /^Thursday 29 October/, '29 October, written')
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await caretToEnd(page)
  await page.keyboard.insertText(' Added later.')
  await saved(page, 'Added later.')
  await page.keyboard.press('PageDown')
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
  await expect(page.locator('.body')).toHaveText('')
  await page.keyboard.press('PageUp')
  await expect(page.locator('.body')).toContainText('Added later.')
  await expect.poll(() => storedDays(page)).toEqual(Object.keys(DAYS))
})

test('left on an earlier day, the journal still opens on today, from the library and from a new launch', async ({ page }) => {
  await openJournal(page)
  await goTo(page, /^Thursday 29 October/, '29 October, written')
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await page.getByRole('button', { name: 'Library' }).click()
  await page.locator('.row', { hasText: 'Journal' }).first().click()
  await expect(page.locator('.title')).toHaveText('Friday 30 October')

  await goTo(page, /^Thursday 29 October/, '29 October, written')
  await expect(page.locator('.title')).toHaveText('Thursday 29 October')
  await page.reload()
  await expect(page.locator('.title')).toHaveText('Friday 30 October')
})
