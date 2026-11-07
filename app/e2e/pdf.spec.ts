import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, openTools, saved, write } from './helpers'
import { type Run, readPdf } from './pdf'

// Browsers hyphenate differently, so these tests never expect the same line breaks from two of them.
// Within one browser the same piece must make the same pages, whatever the screen: that is what is compared.
const SENTENCE = 'We kept the lamp lit all night, and nobody asked why. '
const LONG = SENTENCE.repeat(60)

async function essay(page: Page, title: string, text: string, wait = true): Promise<void> {
  await page.goto('./#/')
  if (await page.locator('.start.essay').count()) await page.locator('.start.essay').click()
  else await write(page, 'Essay')
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  // A long text goes in as one input, not a key at a time, which several browsers at once make slow.
  if (text.length > 300) await page.keyboard.insertText(text)
  else await page.keyboard.type(text)
  if (wait) await saved(page, text.slice(-20))
}

/** Changes some of the text settings, as the app keeps them, for the next load. */
const setSettings = (page: Page, change: Record<string, unknown>) =>
  page.evaluate((change) => {
    const kept = JSON.parse(localStorage.getItem('elbowpatch.settings') ?? '{}')
    localStorage.setItem('elbowpatch.settings', JSON.stringify({ ...kept, ...change }))
  }, change)

/** Sets the text settings and loads the app again, which is when it reads them. */
async function withSettings(page: Page, change: Record<string, unknown>): Promise<void> {
  await page.goto('./#/')
  await setSettings(page, change)
  await page.reload()
}

async function openExport(page: Page): Promise<void> {
  const exportButton = page.getByRole('button', { name: 'Export' }).filter({ visible: true })
  await expect(exportButton.or(page.locator('.page-button')).first()).toBeVisible()
  await openTools(page)
  // Having just changed screens, the old tools may still stand beside the new ones.
  await exportButton.first().click()
}

async function makePdf(page: Page) {
  await openExport(page)
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: /PDF/ }).click()
  const file = await download
  return { file, pdf: await readPdf(file) }
}

/** Every store's record count and the last export date: what making a PDF must leave as it was. */
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const db = open.result
          const names = [...db.objectStoreNames]
          const out: Record<string, string> = { lastExport: String(localStorage.getItem('elbowpatch.lastExport')) }
          let left = names.length
          for (const name of names) {
            const all = db.transaction(name).objectStore(name).getAll()
            all.onsuccess = () => {
              out[name] = JSON.stringify(all.result)
              if (--left === 0) {
                db.close()
                done(JSON.stringify(out))
              }
            }
          }
        }
      }),
  )

test('an essay comes out as a PDF with its title, running head and page numbers', async ({ page }) => {
  await essay(page, 'The second draft', LONG)
  await openExport(page)
  await expect(page.getByRole('button', { name: /PDF/ })).toContainText('Numbered pages to print or keep.')

  const download = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: /PDF/ }).click()
  await expect(page.getByRole('button', { name: /PDF/ })).toContainText('Setting your pages…')
  const file = await download
  expect(file.suggestedFilename()).toBe('The second draft.pdf')
  await expect(page.getByRole('status').filter({ hasText: 'Saved as The second draft.pdf.' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Export' })).toBeHidden()

  const pdf = await readPdf(file)
  expect(pdf.count).toBeGreaterThan(1)
  // Letter: the browser's language is en-US.
  expect(pdf.pages[0]).toMatchObject({ width: 612, height: 792 })
  const [first, second] = pdf.pages
  expect(first?.lines[0]).toBe('The second draft')
  expect(first?.lines.at(-1)).toBe('1')
  // From the second page on, the running head is the title; the title's own page has none.
  expect(second?.lines[0]).toBe('The second draft')
  expect(second?.lines.at(-1)).toBe('2')
  expect(first?.lines.filter((l) => l === 'The second draft')).toHaveLength(1)
  // The text is text: it can be found.
  const found = pdf.pages
    .map((p) => p.text)
    .join(' ')
    .replace(/-\s?/g, '')
    .replace(/\s+/g, ' ')
  expect(found).toContain('We kept the lamp lit all night, and nobody asked why.')
})

test('the words just typed are in the file', async ({ page }) => {
  await essay(page, 'Just now', 'Typed a moment ago, and not yet saved.', false)
  const { pdf } = await makePdf(page)
  expect(pdf.pages[0]?.text).toContain('Typed a moment ago, and not yet saved.')
})

test('the same piece from the library makes the same file as from the page', async ({ page }) => {
  await essay(page, 'Two ways', LONG)
  const fromPage = await makePdf(page)
  await page.locator('.head .home').click()
  await expect(page.locator('.continue')).toContainText('We kept the lamp')
  await page.locator('.continue').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Export' }).click()
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: /PDF/ }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('Two ways.pdf')
  await expect(page.getByRole('status').filter({ hasText: 'Saved as Two ways.pdf.' })).toBeVisible()
  const fromLibrary = await readPdf(file)
  expect(fromLibrary.pages.map((p) => p.operators)).toEqual(fromPage.pdf.pages.map((p) => p.operators))
})

test('a phone and a desktop make the same pages, and so do a changed text size and night', async ({ page }) => {
  await essay(page, 'The second draft', LONG)
  const first = await makePdf(page)
  const phone = { width: 390, height: 844 }
  const desktop = { width: 1440, height: 900 }
  const here = (page.viewportSize()?.width ?? 0) < 700 ? phone : desktop

  // The other kind of screen.
  await page.setViewportSize(here === phone ? desktop : phone)
  const other = await makePdf(page)
  expect(other.pdf.pages.map((p) => p.operators)).toEqual(first.pdf.pages.map((p) => p.operators))

  await setSettings(page, { size: 'l', leading: 'loose', align: 'justify', measure: 'wide' })
  await page.reload()
  await page.setViewportSize(here)
  const settings = await makePdf(page)
  expect(settings.pdf.pages.map((p) => p.operators)).toEqual(first.pdf.pages.map((p) => p.operators))

  await page.emulateMedia({ colorScheme: 'dark' })
  await setSettings(page, { theme: 'night', size: 'm', leading: 'normal', align: 'left', measure: 'narrow' })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  const night = await makePdf(page)
  expect(night.pdf.pages.map((p) => p.operators)).toEqual(first.pdf.pages.map((p) => p.operators))
})

test('making a PDF writes nothing to the piece, makes no moment and leaves the last export date', async ({ page }) => {
  await essay(page, 'Untouched', LONG)
  // Leaving the page for the sheet may let the page tidy up after itself: that is not the PDF's doing.
  await openExport(page)
  await page.waitForTimeout(500)
  const before = await stored(page)
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: /PDF/ }).click()
  await download
  await expect(page.getByRole('status').filter({ hasText: 'Saved as Untouched.pdf.' })).toBeVisible()
  expect(await stored(page)).toBe(before)
})

test('indented paragraphs and a drop cap follow the writer, and no word is lost', async ({ page }) => {
  await withSettings(page, { indent: true, dropcap: true })
  await essay(page, 'As in a book', 'Nobody remembers the first draft. It was written in a hurry.\n\nAnd the second begins to listen.')
  await saved(page, 'to listen.')
  const { pdf } = await makePdf(page)
  const found = pdf.pages.map((p) => p.text).join(' ')
  expect(found.replace(/\s+/g, '')).toContain('Nobodyremembersthefirstdraft.')
  expect(found).toContain('And the second begins to listen.')
  // The capital is large, and the rest of its word follows it on the first line.
  const runs = pdf.pages[0]?.runs ?? []
  const cap = starting(runs, 'N')
  expect(cap.size).toBeGreaterThan(40)
  expect(starting(runs, 'obody').x).toBeGreaterThan(cap.x + cap.width - 1)
})

/** The first piece of text in a page that starts with these words. */
const starting = (runs: Run[], words: string): Run => {
  const run = runs.find((r) => r.str.startsWith(words))
  if (!run) throw new Error(`No text starts with ${words}: ${runs.map((r) => r.str).join('|')}`)
  return run
}

/** The runs that stand on one line with this one. */
const lineOf = (runs: Run[], run: Run): Run[] => runs.filter((r) => Math.abs(r.y - run.y) < 2)

/** A piece that comes in as written: its second paragraph holds Markdown the page has no mark for, so it is kept as it stands. */
async function importRough(page: Page): Promise<void> {
  const name = 'Rough notes'
  await page.goto('./#/settings/export')
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/rough-notes.md')
  const sheet = page.getByRole('dialog', { name: 'Import' })
  await sheet.getByRole('radio', { name: 'Essay' }).click()
  await sheet.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByText('1 piece added.')).toBeVisible()
  await page.goto('./#/')
  await page.locator('.row', { hasText: name }).or(page.locator('.continue')).first().click()
  await expect(page.locator('.title')).toHaveText(name)
}

test('bold, italic and a pull quote are set as on the page', async ({ page }) => {
  await essay(page, 'Marks', 'He walked *slowly* home, and **never** looked back.\n> What the lamp keeps, it keeps.')
  await expect(page.locator('.body em')).toHaveText('slowly')
  await expect(page.locator('.body strong')).toHaveText('never')
  await expect(page.locator('.body blockquote')).toHaveText('What the lamp keeps, it keeps.')
  const { pdf } = await makePdf(page)
  const runs = pdf.pages[0]?.runs ?? []
  const plain = starting(runs, 'He')
  const italic = starting(runs, 'slowly')
  const bold = starting(runs, 'never')
  const quote = starting(runs, 'What')
  // The text's own size; italic in the pull quote's face, a little larger; bold in the text's face, heavier.
  expect(plain.size).toBeCloseTo(11, 1)
  expect(italic.font).not.toBe(plain.font)
  expect(italic.size).toBeCloseTo(11 * 1.17, 1)
  expect(bold.size).toBeCloseTo(11, 1)
  expect([plain.font, italic.font]).not.toContain(bold.font)
  // The pull quote is that italic face, set larger and centred on the sheet.
  expect(quote.font).toBe(italic.font)
  expect(quote.size).toBeCloseTo(11 * 1.36, 1)
  const row = lineOf(runs, quote)
  const left = Math.min(...row.map((r) => r.x))
  const right = Math.max(...row.map((r) => r.x + r.width))
  expect((left + right) / 2).toBeCloseTo((pdf.pages[0]?.width ?? 0) / 2, 0)
  // Marks are not in the text: only the words are.
  expect(pdf.pages[0]?.text).not.toContain('*')
  expect(pdf.pages[0]?.text).not.toContain('>')
})

test('Markdown the page keeps as written shows its symbols in the file', async ({ page }) => {
  await importRough(page)
  const { pdf } = await makePdf(page)
  const found = (pdf.pages[0]?.lines ?? []).join(' ')
  expect(found).toContain('Half **open here and a lone * star, with a _quiet_ underscore and a [link](x) kept as written.')
  // It is set in the text's own face, as the page does.
  expect(starting(pdf.pages[0]?.runs ?? [], 'Half').font).toBe(starting(pdf.pages[0]?.runs ?? [], 'The').font)
})

test('a drop cap stands on a piece whose first word is italic', async ({ page }) => {
  await withSettings(page, { dropcap: true })
  await essay(page, 'Opening', '*Slowly* the lamp burned down, and nobody asked why it was still lit. We kept the house quiet until morning came in.')
  const { pdf } = await makePdf(page)
  const runs = pdf.pages[0]?.runs ?? []
  const cap = starting(runs, 'S')
  const rest = starting(runs, 'lowly')
  // The capital is four lines deep, upright; the rest of the word keeps its mark and follows it.
  expect(cap.str).toBe('S')
  expect(cap.size).toBeGreaterThan(40)
  expect(rest.size).toBeCloseTo(11 * 1.17, 1)
  expect(rest.x).toBeGreaterThan(cap.x + cap.width - 1)
  expect(cap.font).not.toBe(rest.font)
})

test('indented paragraphs step in, except the first and the one after a quote', async ({ page }) => {
  await withSettings(page, { indent: true })
  await essay(
    page,
    'Indented',
    'First paragraph begins here.\nSecond paragraph follows it.\n> A quote between.\nAfter the quote, flush again.\nThird, stepped in once more.',
  )
  const { pdf } = await makePdf(page)
  const runs = pdf.pages[0]?.runs ?? []
  const left = starting(runs, 'First').x
  const step = (words: string) => starting(runs, words).x - left
  expect(step('Second')).toBeCloseTo(1.5 * 11, 1)
  expect(step('After')).toBeCloseTo(0, 1)
  expect(step('Third')).toBeCloseTo(1.5 * 11, 1)
  // No space between paragraphs: the next line is the next baseline.
  expect(starting(runs, 'First').y - starting(runs, 'Second').y).toBeCloseTo(11 * 1.55, 0)
})

test('without indent, paragraphs are flush and a line apart', async ({ page }) => {
  await essay(page, 'Flush', 'First paragraph begins here.\nSecond paragraph follows it.')
  const { pdf } = await makePdf(page)
  const runs = pdf.pages[0]?.runs ?? []
  expect(starting(runs, 'Second').x).toBeCloseTo(starting(runs, 'First').x, 1)
  expect(starting(runs, 'First').y - starting(runs, 'Second').y).toBeCloseTo(2 * 11 * 1.55, 0)
})

test('a paragraph after Markdown kept as written is indented like any other', async ({ page }) => {
  await importRough(page)
  await setSettings(page, { indent: true })
  await page.reload()
  const { pdf } = await makePdf(page)
  const runs = pdf.pages[0]?.runs ?? []
  const left = starting(runs, 'The').x
  expect(starting(runs, 'Half').x - left).toBeCloseTo(1.5 * 11, 1)
  expect(starting(runs, 'Back').x - left).toBeCloseTo(1.5 * 11, 1)
})

// Friday 30 October 2026, fixed: the journal opens on a day of its own, with no words yet.
const NOW = new Date(2026, 9, 30, 10, 0)

/** Stores a journal with these days, as earlier sessions left it, and opens it. */
async function journal(page: Page, title: string, days: Record<string, string>, subtitle?: string): Promise<void> {
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await expect(page.locator('.start.journal')).toBeVisible()
  const sections = Object.keys(days).map((day, i) => ({ sectionId: `day-${i}`, title: day }))
  const piece = {
    id: 'journal',
    kind: 'journal',
    lang: 'en',
    createdAt: NOW.getTime() - 1000,
    updatedAt: NOW.getTime() - 1000,
    title,
    ...(subtitle ? { subtitle } : {}),
    sections,
    words: Object.fromEntries(sections.map((s) => [s.sectionId, (days[s.title] ?? '').split(/\s+/).filter(Boolean).length])),
    outlineId: null,
  }
  const working = sections.map((s) => ({
    sectionId: s.sectionId,
    pieceId: piece.id,
    content: days[s.title] ?? '',
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
  await page.locator('.row', { hasText: title }).or(page.locator('.continue')).first().click()
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

const DAYS = {
  '2026-10-25': '',
  '2026-10-26': 'Woke before the alarm and lay listening to the rain on the skylight.',
  '2026-10-27': LONG,
  '2026-10-28': '  \n ',
  '2026-10-29': 'Kept one page of four. It is enough.',
}

test.describe('a journal', () => {
  test('the row names its days', async ({ page }) => {
    await journal(page, 'Dream journal', DAYS)
    await openExport(page)
    await expect(page.getByRole('button', { name: /PDF/ })).toContainText('Numbered pages to print or keep, each day on a fresh page.')
  })

  test('opens with its title page, not counted, then its first day on page 1', async ({ page }) => {
    await journal(page, 'Dream journal', DAYS, 'nights since the move')
    const { file, pdf } = await makePdf(page)
    expect(file.suggestedFilename()).toBe('Dream journal.pdf')
    const [titlePage, first] = pdf.pages
    expect(titlePage?.lines).toEqual(['Dream journal', 'nights since the move'])
    // The title page has no number and no running head; the first day is page 1.
    expect(first?.lines[0]).toBe('Monday 26 October')
    expect(first?.lines.at(-1)).toBe('1')
    expect(first?.text).toContain('Woke before the alarm')
    // The title, 3 times the body and the subtitle 1.15 times, both centred on the column.
    const runs = titlePage?.runs ?? []
    const title = starting(runs, 'Dream')
    const subtitle = starting(runs, 'nights')
    expect(title.size).toBeCloseTo(33, 1)
    expect(subtitle.size).toBeCloseTo(12.65, 1)
    expect(subtitle.font).not.toBe(title.font)
    for (const run of [title, subtitle]) {
      const row = lineOf(runs, run)
      const middle = (Math.min(...row.map((r) => r.x)) + Math.max(...row.map((r) => r.x + r.width))) / 2
      expect(middle).toBeCloseTo((titlePage?.width ?? 0) / 2, 0)
    }
    // Upper third of the sheet, the title above its subtitle.
    expect(title.y).toBeGreaterThan((titlePage?.height ?? 0) * 0.6)
    expect(title.y - subtitle.y).toBeGreaterThan(14)
    expect(title.y - subtitle.y).toBeLessThan(40)
  })

  test('each day starts a fresh page, the days with no words are left out, and the numbers run on', async ({ page }) => {
    await journal(page, 'Dream journal', DAYS)
    const { pdf } = await makePdf(page)
    const heads = pdf.pages.map((p) => p.lines[0])
    // Title page, 26 October, 27 October on one page or more, 29 October.
    expect(heads[0]).toBe('Dream journal')
    expect(heads[1]).toBe('Monday 26 October')
    expect(heads[2]).toBe('Tuesday 27 October')
    expect(heads.at(-1)).toBe('Thursday 29 October')
    // Days with nothing in them, and the day just opened, are not there.
    const all = pdf.pages.map((p) => p.text).join(' ')
    expect(all).not.toContain('Sunday 25 October')
    expect(all).not.toContain('Wednesday 28 October')
    expect(all).not.toContain('Friday 30 October')
    // A long day goes on to pages that carry the day as their running head; the numbers count every page after the title page.
    expect(pdf.count).toBeGreaterThan(4)
    for (const [i, sheet] of pdf.pages.slice(1).entries()) expect(sheet.lines.at(-1)).toBe(String(i + 1))
    expect(pdf.pages[3]?.lines[0]).toBe('Tuesday 27 October')
    // Thursday begins its own page: nothing of Tuesday is on it.
    expect(pdf.pages.at(-1)?.text).not.toContain('Paragraph')
  })

  test('the margin rule prints on every page, and the number sits flush with the text’s right edge', async ({ page }) => {
    await journal(page, 'Dream journal', DAYS, 'nights since the move')
    const { pdf } = await makePdf(page)
    const mm = 72 / 25.4
    for (const sheet of pdf.pages) {
      const left = (sheet.width - 117 * mm) / 2
      // One thin rule the height of the sheet, 12 mm left of the text, in the page's own line colour.
      const rule = sheet.rects.filter((r) => r.height >= sheet.height - 1)
      expect(rule).toHaveLength(1)
      expect(rule[0]?.x).toBeCloseTo(left - 12 * mm, 0)
      expect(rule[0]?.width).toBeLessThan(1.5)
      expect(rule[0]?.color).toBe('#e2e2de')
    }
    for (const sheet of pdf.pages.slice(1)) {
      const number = sheet.runs.at(-1)
      expect(number?.size).toBeCloseTo(9, 1)
      expect((number?.x ?? 0) + (number?.width ?? 0)).toBeCloseTo((sheet.width + 117 * mm) / 2, 0)
    }
  })

  test('a journal with no words still makes a file, with its title', async ({ page }) => {
    await journal(page, 'Dream journal', { '2026-10-25': '', '2026-10-26': ' ' })
    const { pdf } = await makePdf(page)
    expect(pdf.count).toBe(1)
    expect(pdf.pages[0]?.lines).toEqual(['Dream journal'])
  })

  test('the words just typed on today are in the file, on a day of their own', async ({ page }) => {
    await journal(page, 'Dream journal', { '2026-10-29': 'Yesterday.' })
    await caretToEnd(page)
    await page.keyboard.insertText('Typed a moment ago.')
    const { pdf } = await makePdf(page)
    expect(pdf.count).toBe(3)
    expect(pdf.pages[2]?.lines[0]).toBe('Friday 30 October')
    expect(pdf.pages[2]?.text).toContain('Typed a moment ago.')
  })

  test.describe('on A4', () => {
    test.use({ locale: 'en-GB' })

    test('the title page and the rule follow the paper', async ({ page }) => {
      await journal(page, 'Dream journal', DAYS, 'nights since the move')
      const { pdf } = await makePdf(page)
      const sheet = pdf.pages[0]
      expect(Math.round(sheet?.width ?? 0)).toBe(595)
      const mm = 72 / 25.4
      expect(sheet?.rects.find((r) => r.height >= sheet.height - 1)?.x).toBeCloseTo(((sheet?.width ?? 0) - 117 * mm) / 2 - 12 * mm, 0)
      // The frame has the title's line box 189 pt from the top: its baseline is at 221.8.
      const title = starting(sheet?.runs ?? [], 'Dream')
      expect((sheet?.height ?? 0) - title.y).toBeCloseTo(221.8, 0)
    })
  })
})

/** Stores a book with these chapters, as earlier sessions left it, and opens it on its title page. */
async function book(page: Page, title: string, chapters: [string, string][], subtitle?: string): Promise<void> {
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await expect(page.locator('.start.book')).toBeVisible()
  const sections = chapters.map(([name], i) => ({ sectionId: `chapter-${i}`, title: name }))
  const piece = {
    id: 'book',
    kind: 'book',
    lang: 'en',
    createdAt: NOW.getTime() - 1000,
    updatedAt: NOW.getTime() - 1000,
    title,
    ...(subtitle ? { subtitle } : {}),
    sections,
    words: Object.fromEntries(chapters.map(([, text], i) => [`chapter-${i}`, text.split(/\s+/).filter(Boolean).length])),
    outlineId: null,
  }
  const working = chapters.map(([, text], i) => ({
    sectionId: `chapter-${i}`,
    pieceId: piece.id,
    content: text,
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
  await page.locator('.row', { hasText: title }).or(page.locator('.continue')).first().click()
  await expect(page.locator('.book-title')).toBeVisible()
}

const CHAPTERS: [string, string][] = [
  ['The ferry at seven', 'The first boat was late, and nobody on the quay minded.'],
  ['A room above the chandler', LONG.repeat(2)],
  ['Salt on the windows', ''],
  ['What the harbourmaster kept', 'A ledger, a lamp, and the key to the lower door.'],
]

/** What a contents page lists: each row's title and the number at its right, read back from the lines. */
function contentsOf(sheets: { lines: string[] }[]): { title: string; number: number }[] {
  return sheets
    .flatMap((s) => s.lines)
    .filter((l) => l !== 'Contents')
    .map((line) => {
      const [, title, number] = /^(.*\D)(\d+)$/.exec(line) ?? []
      return { title: (title as string).trim(), number: Number(number) }
    })
}

test.describe('a book', () => {
  test('the row says the pages come with contents', async ({ page }) => {
    await book(page, 'The harbour in winter', CHAPTERS)
    await openExport(page)
    await expect(page.getByRole('button', { name: /PDF/ })).toContainText('Numbered pages to print or keep, with contents at the front.')
  })

  test('opens with its title page, then Contents, neither numbered nor counted, and chapter 1 on page 1', async ({ page }) => {
    await book(page, 'The harbour in winter', CHAPTERS, 'a story in six chapters')
    const { file, pdf } = await makePdf(page)
    expect(file.suggestedFilename()).toBe('The harbour in winter.pdf')
    const [titlePage, contents, first] = pdf.pages
    expect(titlePage?.lines).toEqual(['The harbour in winter', 'a story in six chapters'])
    expect(contents?.lines[0]).toBe('Contents')
    // Contents does not carry the book's title, which is on the title page.
    expect(contents?.text).not.toContain('harbour in winter')
    // Neither sheet has a number or a running head: nothing stands in the top or the foot margin.
    for (const sheet of [titlePage, contents]) for (const run of sheet?.runs ?? []) expect(run.y > 60 && run.y < (sheet?.height ?? 0) - 60).toBe(true)
    expect(first?.lines[0]).toBe('The ferry at seven')
    expect(first?.lines.at(-1)).toBe('1')
  })

  test('Contents lists every chapter with the page it really starts on, read back from the file', async ({ page }) => {
    await book(page, 'The harbour in winter', CHAPTERS)
    const { pdf } = await makePdf(page)
    // Chapter 1 stands on the sheet numbered 1; everything before it is the title page and Contents.
    const one = pdf.pages.findIndex((p) => p.lines.at(-1) === '1')
    expect(one).toBe(2)
    const listed = contentsOf(pdf.pages.slice(1, one))
    expect(listed.map((row) => row.title)).toEqual(CHAPTERS.map(([name]) => name))
    // Where each chapter really starts: the first sheet that opens on its title.
    const starts = CHAPTERS.map(([name]) => pdf.pages.findIndex((p, i) => i >= one && p.lines[0] === name) - one + 1)
    expect(listed.map((row) => row.number)).toEqual(starts)
    // The long chapter has more than one page, so the numbers are not just 1, 2, 3, 4.
    expect(starts).not.toEqual([1, 2, 3, 4])
    // Each of those sheets is printed with that number.
    for (const n of starts) expect(pdf.pages[one + n - 1]?.lines.at(-1)).toBe(String(n))
  })

  test('each chapter starts on a fresh page, and its later pages carry its title as the running head', async ({ page }) => {
    await book(page, 'The harbour in winter', CHAPTERS)
    const { pdf } = await makePdf(page)
    const chapters = pdf.pages.slice(2)
    // The long chapter runs over: its first page has the title once, as its heading, and its next ones as the head.
    const long = chapters.filter((p) => p.lines[0] === 'A room above the chandler')
    expect(long.length).toBeGreaterThan(1)
    expect(long[0]?.lines.filter((l) => l === 'A room above the chandler')).toHaveLength(1)
    expect(long[0]?.text).toContain('We kept the lamp')
    // The next chapter's words never share a page with it.
    expect(long.some((p) => p.text.includes('ledger'))).toBe(false)
    expect(chapters.find((p) => p.text.includes('ledger'))?.lines[0]).toBe('What the harbourmaster kept')
    // The numbers run on, one for each page after Contents.
    for (const [i, sheet] of chapters.entries()) expect(sheet.lines.at(-1)).toBe(String(i + 1))
  })

  test('an empty chapter stays in the book and in Contents', async ({ page }) => {
    await book(page, 'The harbour in winter', CHAPTERS)
    const { pdf } = await makePdf(page)
    const sheet = pdf.pages.find((p, i) => i > 1 && p.lines[0] === 'Salt on the windows')
    // Its own page, with its title and its number, and nothing else.
    expect(sheet?.lines).toEqual(['Salt on the windows', sheet?.lines.at(-1)])
    expect(Number(sheet?.lines.at(-1))).toBeGreaterThan(1)
    const listed = contentsOf(pdf.pages.slice(1, 2))
    expect(listed.find((row) => row.title === 'Salt on the windows')?.number).toBe(Number(sheet?.lines.at(-1)))
    // The chapter after it starts on the page after it.
    expect(listed.find((row) => row.title === 'What the harbourmaster kept')?.number).toBe(Number(sheet?.lines.at(-1)) + 1)
  })

  test('a book with no words still makes a file: its title page, its Contents and a page for each chapter', async ({ page }) => {
    await book(page, 'The harbour in winter', [
      ['One', ''],
      ['Two', '  \n '],
    ])
    const { pdf } = await makePdf(page)
    expect(pdf.count).toBe(4)
    expect(pdf.pages[0]?.lines).toEqual(['The harbour in winter'])
    expect(contentsOf(pdf.pages.slice(1, 2))).toEqual([
      { title: 'One', number: 1 },
      { title: 'Two', number: 2 },
    ])
    expect(pdf.pages[2]?.lines).toEqual(['One', '1'])
    expect(pdf.pages[3]?.lines).toEqual(['Two', '2'])
  })

  test('a chapter with no title is called Untitled, as Contents calls it', async ({ page }) => {
    await book(page, 'The harbour in winter', [['', 'Words in a chapter with no name.']])
    const { pdf } = await makePdf(page)
    expect(contentsOf(pdf.pages.slice(1, 2))).toEqual([{ title: 'Untitled', number: 1 }])
    expect(pdf.pages[2]?.lines[0]).toBe('Untitled')
  })

  test('Contents is set as the frame draws it: small italic label, titles at the left, numbers flush right', async ({ page }) => {
    await book(page, 'The harbour in winter', CHAPTERS)
    const { pdf } = await makePdf(page)
    const sheet = pdf.pages[1]
    const mm = 72 / 25.4
    const label = starting(sheet?.runs ?? [], 'Contents')
    expect(label.size).toBeCloseTo(11, 1)
    const first = starting(sheet?.runs ?? [], 'The')
    expect(first.size).toBeCloseTo(11, 1)
    expect(first.font).not.toBe(label.font)
    expect(first.x).toBeCloseTo(((sheet?.width ?? 0) - 117 * mm) / 2, 0)
    // The rows stand 27.05 pt apart: 6 above the line, 17.05 of line, 4 between.
    const second = starting(sheet?.runs ?? [], 'A')
    expect(first.y - second.y).toBeCloseTo(27.05, 0)
    // Under the label, as its 11 pt line and 4 pt gap leave room.
    expect(label.y - first.y).toBeGreaterThan(20)
    expect(label.y - first.y).toBeLessThan(32)
    // Each number ends at the column's right edge.
    const numbers = (sheet?.runs ?? []).filter((r) => /^\d+$/.test(r.str))
    expect(numbers).toHaveLength(CHAPTERS.length)
    for (const n of numbers) expect(n.x + n.width).toBeCloseTo(((sheet?.width ?? 0) + 117 * mm) / 2, 0)
  })

  test('a long chapter title goes on to a second line, and its number stays on the first', async ({ page }) => {
    const name = 'The very long account of what the harbourmaster kept in the lower drawer of the old desk'
    await book(page, 'The harbour in winter', [[name, 'Words.']])
    const { pdf } = await makePdf(page)
    const sheet = pdf.pages[1]
    expect(sheet?.lines).toHaveLength(3)
    expect(sheet?.lines.at(-1)).not.toMatch(/\d$/)
    expect(sheet?.lines[1]).toMatch(/1$/)
    expect(
      sheet?.lines
        .slice(1)
        .join(' ')
        .replace(/\s1$/, '')
        .replace(/\s*1\s/, ' '),
    ).toContain('lower drawer')
  })

  test('a long Contents goes on to more sheets, none of them numbered, and the numbers do not move', async ({ page }) => {
    const many: [string, string][] = Array.from({ length: 45 }, (_, i) => [
      `Chapter ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}x`,
      'Some words.',
    ])
    await book(page, 'The harbour in winter', many)
    const { pdf } = await makePdf(page)
    const one = pdf.pages.findIndex((p) => p.lines.at(-1) === '1')
    expect(one).toBeGreaterThan(2)
    const listed = contentsOf(pdf.pages.slice(1, one))
    expect(listed.map((row) => row.title)).toEqual(many.map(([name]) => name))
    expect(listed.map((row) => row.number)).toEqual(many.map((_, i) => i + 1))
    expect(pdf.count).toBe(one + many.length)
  })

  test.describe('on A4', () => {
    test.use({ locale: 'en-GB' })

    test('the title page and Contents follow the paper', async ({ page }) => {
      await book(page, 'The harbour in winter', CHAPTERS, 'a story in six chapters')
      const { pdf } = await makePdf(page)
      const [titlePage, contents] = pdf.pages
      expect(Math.round(titlePage?.width ?? 0)).toBe(595)
      // The frame has the title's line box 189 pt from the top: its baseline is at 221.8.
      expect((titlePage?.height ?? 0) - starting(titlePage?.runs ?? [], 'The').y).toBeCloseTo(221.8, 0)
      // Contents' label stands 25 mm from the top, as the frame has it (70 pt, then its line).
      expect((contents?.height ?? 0) - starting(contents?.runs ?? [], 'Contents').y).toBeLessThan(70.87 + 20)
      expect((contents?.height ?? 0) - starting(contents?.runs ?? [], 'Contents').y).toBeGreaterThan(70.87)
    })
  })
})

test.describe('in the piece’s own language', () => {
  test.use({ locale: 'de-DE' })

  test('words hyphenate as German does, and the lines are still text', async ({ page }) => {
    const german =
      'Die Donaudampfschifffahrtsgesellschaft beschäftigte außergewöhnlich zuverlässige Verwaltungsangestellte und Wirtschaftsprüfungsgesellschaften. '.repeat(
        6,
      )
    await essay(page, 'Deutsch', german)
    const { pdf } = await makePdf(page)
    const lines = pdf.pages[0]?.lines ?? []
    // Every browser breaks this word at its German syllable, which English patterns do not know.
    expect(lines.some((l) => l.endsWith('außerge-'))).toBe(true)
    // Hyphenated or not, a word is found whole: its two lines read on as one.
    const joined = lines
      .slice(1, -1)
      .join(' ')
      .replace(/(\p{L})- (\p{L})/gu, '$1$2')
    expect(joined).toContain(
      'Die Donaudampfschifffahrtsgesellschaft beschäftigte außergewöhnlich zuverlässige Verwaltungsangestellte und Wirtschaftsprüfungsgesellschaften.',
    )
  })
})

test('Help says exported pages keep fixed numbers', async ({ page }) => {
  await page.goto('./#/settings/help')
  await expect(page.getByText('Exported pages keep fixed numbers.')).toBeVisible()
})

test.describe('where A4 is the paper', () => {
  test.use({ locale: 'en-GB' })

  test('an A4 sheet', async ({ page }) => {
    await essay(page, 'On A4', LONG)
    const { pdf } = await makePdf(page)
    expect(Math.round(pdf.pages[0]?.width ?? 0)).toBe(595)
    expect(Math.round(pdf.pages[0]?.height ?? 0)).toBe(842)
  })
})

test.describe('when the PDF cannot be fetched', () => {
  test.use({ serviceWorkers: 'block' })

  test('the row says so, and a second tap works once it can', async ({ page, browserName }) => {
    await essay(page, 'Try again', SENTENCE)
    let blocked = true
    await page.route(/\/assets\/(pdf|makePdf)-.*\.js$/, (route) => (blocked ? route.abort() : route.continue()))
    await openExport(page)
    await page.getByRole('button', { name: /PDF/ }).click()
    await expect(page.getByRole('dialog', { name: 'Export' })).toContainText('Couldn’t make the PDF just now. Nothing has changed; try again.')
    // WebKit remembers a module that failed to load until the page is loaded again, so there a retry waits for a reload.
    if (browserName === 'webkit') return
    blocked = false
    const download = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: /PDF/ }).click()
    expect((await download).suggestedFilename()).toBe('Try again.pdf')
  })
})
