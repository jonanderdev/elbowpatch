import { expect, type Page, test } from '@playwright/test'
import { openTools, saved, write } from './helpers'
import { type ReadPage, readPdf } from './pdf'

// Every character the writer wrote reaches the PDF: Cyrillic, Greek and Vietnamese in the book font, and
// what no font holds (an emoji, Arabic, Japanese) drawn by the browser and placed as an image in its line.
// Browsers hyphenate differently, so no test expects the same line breaks from two of them.

async function essay(page: Page, title: string, text: string): Promise<void> {
  await page.goto('./#/')
  if (await page.locator('.start.essay').count()) await page.locator('.start.essay').click()
  else await write(page, 'Essay')
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.insertText(title)
  await page.keyboard.press('Enter')
  await page.keyboard.insertText(text)
  await saved(page, text.slice(-8))
}

const setSettings = (page: Page, change: Record<string, unknown>) =>
  page.evaluate((change) => {
    const kept = JSON.parse(localStorage.getItem('elbowpatch.settings') ?? '{}')
    localStorage.setItem('elbowpatch.settings', JSON.stringify({ ...kept, ...change }))
  }, change)

async function makePdf(page: Page) {
  const exportButton = page.getByRole('button', { name: 'Export' }).filter({ visible: true })
  await expect(exportButton.or(page.locator('.page-button')).first()).toBeVisible()
  await openTools(page)
  await exportButton.first().click()
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: /PDF/ }).click()
  return readPdf(await download)
}

/** The font files asked for while a PDF is made, by script. */
function fontRequests(page: Page): string[] {
  const asked: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (/\/assets\/(literata|eb-garamond)-[^/]*\.ttf$/.test(url)) asked.push(url.slice(url.lastIndexOf('/') + 1))
  })
  return asked
}

const flat = (text: string) => text.replace(/\s+/g, '')

test('Cyrillic, Greek and Vietnamese are set in the book font, with no image', async ({ page }) => {
  const asked = fontRequests(page)
  await essay(page, 'Letters from elsewhere', 'Привет, мир. Γειά σου, κόσμε. Việt Nam, Łódź, şeker.\n\nZoë Việt, once more.')
  const pdf = await makePdf(page)
  const found = flat(pdf.pages.map((p) => p.text).join(''))
  for (const word of ['Привет,мир.', 'Γειάσου,κόσμε.', 'ViệtNam,Łódź,şeker.', 'Zoë', 'Việt,oncemore.']) expect(found.replace(/-/g, '')).toContain(word)
  // The characters are text, in Literata and not in the italic, and nothing was drawn as a picture.
  expect(pdf.pages.flatMap((p) => p.images)).toHaveLength(0)
  expect(pdf.fonts.length).toBeGreaterThan(0)
  for (const font of pdf.fonts) expect(font).toMatch(/Literata/)
  // Only the files the piece needs were fetched.
  expect(asked.some((name) => name.startsWith('literata-360-cyrillic'))).toBe(true)
  expect(asked.some((name) => name.startsWith('literata-360-greek'))).toBe(true)
})

test('a piece in Latin fetches no Cyrillic or Greek, and a Cyrillic one no Greek', async ({ page }) => {
  const asked = fontRequests(page)
  await essay(page, 'Plain', 'Just plain English, with a café and a Łódź.')
  const pdf = await makePdf(page)
  expect(flat(pdf.pages[0]?.text ?? '')).toContain('JustplainEnglish,withacaféandaŁódź.')
  expect(asked.length).toBeGreaterThan(0)
  expect(asked.filter((name) => /-(cyrillic|greek)-/.test(name))).toEqual([])

  asked.length = 0
  await page.goto('./#/')
  await page.locator('.continue').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.insertText(' Привет.')
  await saved(page, 'Привет.')
  await makePdf(page)
  expect(asked.some((name) => /-cyrillic-/.test(name))).toBe(true)
  expect(asked.filter((name) => /-greek-/.test(name))).toEqual([])
})

test('an emoji, Arabic and Japanese appear in the file, in place in their line', async ({ page }) => {
  await essay(page, 'Lamp', 'We lit the 😀 lamp, then مرحبا and 日本語 too.')
  const pdf = await makePdf(page)
  const first = pdf.pages[0] as ReadPage
  // The words around them are text, in order, on one line.
  const line = first.lines.find((l) => l.startsWith('We lit the'))
  expect(line?.replace(/\s+/g, ' ')).toBe('We lit the lamp, then and too.')
  // Three drawn runs: the emoji, the Arabic word and the Japanese word.
  expect(first.images).toHaveLength(3)
  const baseline = first.items.find((i) => i.str.startsWith('We lit'))?.y as number
  const words = first.items.filter((i) => Math.abs(i.y - baseline) < 1).sort((a, b) => a.x - b.x)
  const images = [...first.images].sort((a, b) => a.x - b.x)
  for (const image of images) {
    // On the line: the baseline runs through the image.
    expect(image.y).toBeLessThan(baseline + 1)
    expect(image.y + image.height).toBeGreaterThan(baseline)
    // And clear of the words either side of it (a little room for the margin round a picture).
    for (const word of words) {
      const overlap = Math.min(word.x + word.width, image.x + image.width) - Math.max(word.x, image.x)
      expect(overlap).toBeLessThan(2)
    }
  }
  // Each stands between the words that were beside it: after the end of the one before, before the start of the one after.
  const word = (text: string) => words.find((w) => w.str.includes(text)) as ReadPage['items'][number]
  const between = (image: ReadPage['images'][number] | undefined, before: string, after: string) => {
    expect(image?.x).toBeGreaterThan(word(before).x + word(before).width - 1)
    expect(image?.x).toBeLessThan(word(after).x + 1)
  }
  between(images[0], 'We lit', 'lamp,')
  between(images[1], 'lamp, then', 'and')
  between(images[2], 'and', 'too.')
})

test('the running head keeps an emoji, Arabic and Cyrillic in the title', async ({ page }) => {
  const sentence = 'We kept the lamp lit all night, and nobody asked why. '
  await essay(page, 'Лампа 🕯️ لمبة', sentence.repeat(60))
  const pdf = await makePdf(page)
  expect(pdf.count).toBeGreaterThan(1)
  const second = pdf.pages[1] as ReadPage
  // Above the text: the head stands in the top margin, centred.
  const head = second.items.filter((i) => i.y > second.height - 60)
  expect(head.map((i) => i.str).join('')).toContain('Лампа')
  const drawn = second.images.filter((i) => i.y > second.height - 60)
  expect(drawn.length).toBeGreaterThanOrEqual(2)
  for (const image of drawn) expect(image.x).toBeGreaterThan(0)
  expect(image(second)).toBe(true)

  function image(p: ReadPage): boolean {
    return p.images.every((i) => i.x + i.width <= p.width && i.x >= 0)
  }
})

test('a drop cap can be a Cyrillic letter or one the fonts lack', async ({ page }) => {
  await page.goto('./#/')
  await setSettings(page, { dropcap: true })
  await essay(page, 'Capital', 'Привет, мир. И снова пишем.\n\nمرحبا بالعالم، هذه فقرة.')
  const pdf = await makePdf(page)
  expect(pdf.pages[0]?.lines.some((l) => l.startsWith('П'))).toBe(true)
  expect(flat(pdf.pages[0]?.text ?? '')).toContain('Привет,мир.')
  // The Arabic paragraph is drawn, word by word.
  expect(pdf.pages[0]?.images.length).toBeGreaterThan(0)
})
