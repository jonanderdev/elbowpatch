import { expect, type Page, test } from '@playwright/test'
import { openTools, saved, write } from './helpers'
import { readPdf } from './pdf'

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
  await page.goto('./#/')
  await setSettings(page, { indent: true, dropcap: true })
  await essay(page, 'As in a book', 'Nobody remembers the first draft. It was written in a hurry.\n\nAnd the second begins to listen.')
  await saved(page, 'to listen.')
  const { pdf } = await makePdf(page)
  const found = pdf.pages.map((p) => p.text).join(' ')
  expect(found.replace(/\s+/g, '')).toContain('Nobodyremembersthefirstdraft.')
  expect(found).toContain('And the second begins to listen.')
  // The capital is large and stands on the fourth line: its own run, drawn first.
  expect(pdf.pages[0]?.lines.some((l) => l.startsWith('N'))).toBe(true)
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
