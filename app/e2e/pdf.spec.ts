import { expect, type Page, test } from '@playwright/test'
import { openTools, saved, write } from './helpers'
import { readPdf } from './pdf'

// A sentence with no place to hyphenate, so a line breaks the same in every browser; the text of the
// whole PDF is compared, not where its lines break (browsers hyphenate differently).
const SENTENCE = 'We kept the lamp lit all night, and nobody asked why. '

async function essay(page: Page, title: string, text: string): Promise<void> {
  await page.goto('./#/')
  if (await page.locator('.start.essay').count()) await page.locator('.start.essay').click()
  else await write(page, 'Essay')
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
  await saved(page, text.slice(-20))
}

async function openExport(page: Page): Promise<void> {
  await openTools(page)
  await page.getByRole('button', { name: 'Export' }).click()
}

test('an essay comes out as a PDF with its title, running head and page numbers', async ({ page }) => {
  const words = Array.from({ length: 60 }, () => SENTENCE).join('')
  await essay(page, 'The second draft', words)
  await openExport(page)
  await expect(page.getByRole('button', { name: /PDF/ })).toContainText('Numbered pages to print or keep.')

  const download = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: /PDF/ }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('The second draft.pdf')
  await expect(page.getByRole('status').filter({ hasText: 'Saved as The second draft.pdf.' })).toBeVisible()

  const pdf = await readPdf(file)
  expect(pdf.count).toBeGreaterThan(1)
  // Letter: the browser's language is en-US.
  expect(pdf.pages[0]).toMatchObject({ width: 612, height: 792 })
  const first = pdf.pages[0]!
  expect(first.lines[0]).toBe('The second draft')
  expect(first.lines.at(-1)).toBe('1')
  const second = pdf.pages[1]!
  expect(second.lines[0]).toBe('The second draft')
  expect(second.lines.at(-1)).toBe('2')
  const text = pdf.pages.flatMap((p) => p.lines.slice(p === first ? 1 : 1, -1)).join(' ')
  expect(text.replace(/-\s/g, '').replace(/\s+/g, ' ')).toContain('We kept the lamp lit all night, and nobody asked why.')
})
