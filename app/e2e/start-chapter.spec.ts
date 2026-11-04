import { expect, type Page, test } from '@playwright/test'
import { saved, write } from './helpers'

// § and `# ` (#56): a chapter started in the text, which takes the words after that point with it.
const onDesktop = (page: Page) => page.viewportSize()!.width >= 700
const phoneOnly = (page: Page) => test.skip(onDesktop(page), 'the writing bar is the phone keyboard’s')

const ONE = '# One\n\nThe ferry at seven.\n\nSalt on the *windows and* the rail.\n\n# Two\n\nThe end.\n'

async function importBook(page: Page, markdown: string) {
  await page.goto('./#/settings/export')
  await page.locator('input[type=file]').evaluate((el: HTMLInputElement, text) => {
    const files = new DataTransfer()
    files.items.add(new File([text], 'harbour.md', { type: 'text/markdown' }))
    el.files = files.files
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, markdown)
  await page.getByRole('dialog', { name: 'Import' }).getByRole('button', { name: 'Import' }).click()
  await expect(page.getByText('1 piece added.')).toBeVisible()
  await page.goto('./#/')
  await page.locator('.row', { hasText: 'harbour' }).click()
  await expect(page.locator('.book-title')).toHaveText('harbour')
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

/** The caret just before `words` in the text; `length` selects them. */
async function caretBefore(page: Page, words: string, length = 0) {
  await page.locator('.body').focus()
  await page.evaluate(
    ({ words, length }) => {
      const walker = document.createTreeWalker(document.querySelector('.body')!, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent!.indexOf(words)
        if (at < 0) continue
        getSelection()!.setBaseAndExtent(node, at, node, at + length)
        return
      }
      throw new Error(`No "${words}" in the text.`)
    },
    { words, length },
  )
}

/** On a phone, the keyboard up: the page's height falls, and the writing bar stands. */
async function keyboardUp(page: Page) {
  await page.locator('.body').focus()
  await page.setViewportSize({ width: 390, height: 500 })
  await expect(page.locator('.writing-bar')).toBeVisible()
}

const section = (page: Page) => page.locator('.writing-bar').getByRole('button', { name: 'New chapter' })
const inMenu = (page: Page) => page.locator('.selection-menu').getByRole('button', { name: 'Start chapter here' })

/** § wherever this screen has it: the writing bar on a phone, the selection menu on desktop. */
async function press(page: Page, words: string) {
  if (onDesktop(page)) {
    await caretBefore(page, words, words.length)
    await inMenu(page).click()
    return
  }
  await keyboardUp(page)
  await caretBefore(page, words)
  await section(page).click()
}

interface Stored {
  chapters: { title: string; text: string }[]
  place?: string
  versions: string[]
  outlines: string[][]
  /** Each chapter's page count on this screen's page, where known. */
  counts: (number | undefined)[]
}

/** The book as stored, read straight from the database. */
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Stored>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction(['pieces', 'working', 'versions', 'outlines'])
          const pieces = tx.objectStore('pieces').getAll()
          const working = tx.objectStore('working').getAll()
          const versions = tx.objectStore('versions').getAll()
          const outlines = tx.objectStore('outlines').getAll()
          tx.oncomplete = () => {
            db.close()
            const piece = pieces.result[0] as {
              place?: { sectionId: string }
              sections: { sectionId: string; title: string }[]
              pages?: Record<string, Record<string, number>>
            }
            const kept = piece.pages?.[innerWidth < 700 ? 'phone' : 'desktop']
            const text = (id: string) => (working.result as { sectionId: string; content: string }[]).find((w) => w.sectionId === id)?.content ?? ''
            done({
              chapters: piece.sections.map((s) => ({ title: s.title, text: text(s.sectionId) })),
              place: piece.sections.findIndex((s) => s.sectionId === piece.place?.sectionId).toString(),
              counts: piece.sections.map((s) => kept?.[s.sectionId]),
              versions: (versions.result as { content: string }[]).map((v) => v.content),
              outlines: (outlines.result as { seq: number; sections: { title: string }[] }[])
                .sort((a, b) => a.seq - b.seq)
                .map((o) => o.sections.map((s) => s.title)),
            })
          }
        }
      }),
  )

const texts = async (page: Page) => (await stored(page)).chapters.map((c) => c.text)

test('§ moves the words from the caret on into a new chapter right after this one, the caret in its title', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'Salt on the')
  await expect(page.locator('.title')).toBeFocused()
  await expect(page.locator('.title')).toHaveText('')
  await expect(page.locator('.body')).toHaveText('Salt on the windows and the rail.')
  await expect(page.locator('.body em')).toHaveText('windows and')
  await expect.poll(() => texts(page)).toEqual(['The ferry at seven.', 'Salt on the *windows and* the rail.', 'The end.'])
  const book = await stored(page)
  expect(book.chapters.map((c) => c.title)).toEqual(['One', '', 'Two'])
  expect(book.place).toBe('1')
})

test('§ in the middle of a mark closes it on each side, and the words read the same', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'and')
  await expect(page.locator('.title')).toBeFocused()
  await expect(page.locator('.body em')).toHaveText('and')
  await expect.poll(() => texts(page)).toEqual(['The ferry at seven.\n\nSalt on the *windows *', '*and* the rail.', 'The end.'])
})

test('the moment before holds the whole chapter, and the moment after both halves', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'Salt on the')
  await expect(page.locator('.title')).toBeFocused()
  await expect.poll(async () => (await stored(page)).outlines.at(-1)).toEqual(['One', '', 'Two'])
  const { versions } = await stored(page)
  expect(versions).toContain('The ferry at seven.\n\nSalt on the *windows and* the rail.')
  expect(versions).toContain('The ferry at seven.')
  expect(versions).toContain('Salt on the *windows and* the rail.')
})

test('a reload straight after a split finds every word once', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'Salt on the')
  await expect(page.locator('.title')).toBeFocused()
  await page.reload()
  await expect(page.locator('.body')).toHaveText('Salt on the windows and the rail.')
  expect(await texts(page)).toEqual(['The ferry at seven.', 'Salt on the *windows and* the rail.', 'The end.'])
})

test('words typed just before § are stored first, and move with the rest', async ({ page }) => {
  await importBook(page, ONE)
  if (!onDesktop(page)) await keyboardUp(page)
  await caretBefore(page, 'the rail')
  await page.keyboard.type('quickly ')
  if (onDesktop(page)) await caretBefore(page, 'Salt', 4)
  else await caretBefore(page, 'Salt')
  await (onDesktop(page) ? inMenu(page) : section(page)).click()
  await expect(page.locator('.title')).toBeFocused()
  await expect.poll(() => texts(page)).toEqual(['The ferry at seven.', 'Salt on the *windows and* quickly the rail.', 'The end.'])
})

test('if the words cannot be stored, § leaves the text as it is, and says so', async ({ page }) => {
  await importBook(page, ONE)
  if (!onDesktop(page)) await keyboardUp(page)
  await caretBefore(page, 'Salt')
  await page.evaluate(() => {
    ;(window as unknown as { __put: unknown }).__put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('The disk is full.', 'QuotaExceededError')
    }
  })
  await page.keyboard.type('Not stored. ')
  if (onDesktop(page)) await caretBefore(page, 'Salt', 4)
  await (onDesktop(page) ? inMenu(page) : section(page)).click()
  await expect(page.getByRole('alert')).toContainText("Can't save right now")
  await expect(page.locator('.title')).toHaveText('One')
  await expect(page.locator('.body')).toContainText('Not stored. Salt on the windows and the rail.')

  // The store comes back: the text is still the writer's to go on with.
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = (window as unknown as { __put: typeof IDBObjectStore.prototype.put }).__put
  })
  await saved(page, 'Not stored.')
  expect((await stored(page)).chapters).toHaveLength(2)
})

test('# at the start of a line takes the rest of it as the title, and what follows moves', async ({ page }) => {
  await importBook(page, '# One\n\nThe ferry.\n\nThe harbour\n\nSalt.\n\n# Two\n\nThe end.\n')
  await caretBefore(page, 'The harbour')
  await page.keyboard.type('# ')
  await expect(page.locator('.title')).toHaveText('The harbour')
  await expect(page.locator('.title')).toBeFocused()
  await expect(page.locator('.body')).toHaveText('Salt.')
  await page.keyboard.type(' in winter')
  await expect(page.locator('.title')).toHaveText('The harbour in winter')
  await expect.poll(() => texts(page)).toEqual(['The ferry.', 'Salt.', 'The end.'])
})

test('at the very start of the text, § goes to the title and splits nothing', async ({ page }) => {
  await importBook(page, ONE)
  if (onDesktop(page)) {
    await caretBefore(page, 'The ferry', 3)
    await inMenu(page).click()
  } else {
    await keyboardUp(page)
    await caretBefore(page, 'The ferry')
    await section(page).click()
  }
  await expect(page.locator('.title')).toBeFocused()
  await expect(page.locator('.title')).toHaveText('One')
  await expect(page.locator('.body')).toContainText('The ferry at seven.')
  expect((await stored(page)).chapters).toHaveLength(2)
})

test('at the very start of the text, # moves its line into an empty title', async ({ page }) => {
  await page.goto('./')
  await write(page, 'Book')
  await page.locator('.title').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Words of the first line.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('And the next.')
  await saved(page, 'And the next.')
  await caretBefore(page, 'Words of')
  await page.keyboard.type('# ')
  await expect(page.locator('.title')).toHaveText('Words of the first line.')
  await expect(page.locator('.title')).toBeFocused()
  await expect(page.locator('.body')).toHaveText('And the next.')
  await saved(page, 'And the next.')
  await expect.poll(async () => (await stored(page)).chapters).toEqual([{ title: 'Words of the first line.', text: 'And the next.' }])
})

test('under a title, # at the very start of the text stays ordinary text', async ({ page }) => {
  await importBook(page, ONE)
  await caretBefore(page, 'The ferry')
  await page.keyboard.type('# ')
  await expect(page.locator('.body')).toContainText('# The ferry at seven.')
  await expect(page.locator('.title')).toHaveText('One')
  await saved(page, '\\# The ferry')
  expect((await stored(page)).chapters).toHaveLength(2)
})

test('at the very end of the text, § adds an empty chapter right after this one, gone if left empty', async ({ page }) => {
  phoneOnly(page)
  await importBook(page, ONE)
  await keyboardUp(page)
  await caretBefore(page, 'the rail.')
  await page.keyboard.press('End')
  await page.evaluate(() => {
    const paragraph = [...document.querySelectorAll('.body p')].at(-1)!
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    range.collapse(false)
    getSelection()!.removeAllRanges()
    getSelection()!.addRange(range)
  })
  await section(page).click()
  await expect(page.locator('.title')).toBeFocused()
  await expect(page.locator('.title')).toHaveText('')
  await page.keyboard.type('Between')
  await saved(page, 'The end.')
  await expect.poll(async () => (await stored(page)).chapters.map((c) => c.title)).toEqual(['One', 'Between', 'Two'])
})

test('pasted headings stay plain paragraphs', async ({ page }) => {
  await importBook(page, ONE)
  await caretBefore(page, 'Salt')
  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', '# Pasted\n\n')
    document.querySelector('.body')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(page.locator('.body')).toContainText('# Pasted')
  await expect(page.locator('.title')).toHaveText('One')
  expect((await stored(page)).chapters).toHaveLength(2)
})

test('a window that is not writing has no § and no # rule', async ({ page, context }) => {
  await importBook(page, ONE)
  const second = await context.newPage()
  await second.goto(page.url())
  await expect(second.getByRole('status').filter({ hasText: 'Open in another window' })).toBeVisible()
  await expect(second.locator('.body')).toHaveAttribute('contenteditable', 'false')
  await expect(section(second)).toHaveCount(0)
  await expect(inMenu(second)).toHaveCount(0)
  expect((await stored(second)).chapters).toHaveLength(2)
})

test('in a journal and an essay, # is ordinary text and § is absent', async ({ page }) => {
  for (const kind of ['Essay', 'Journal'] as const) {
    await page.goto('./#/')
    await write(page, kind)
    const body = page.locator('.body')
    if (kind === 'Essay') {
      await expect(page.locator('.title')).toBeFocused()
      await page.keyboard.press('Enter')
    } else {
      await expect(page.locator('.book-title')).toBeFocused()
      await page.keyboard.press('Enter')
    }
    await body.focus()
    await page.keyboard.type('# Not a chapter')
    await expect(body).toContainText('# Not a chapter')
    await page.keyboard.press('Shift+ArrowLeft')
    await expect(inMenu(page)).toHaveCount(0)
    await expect(section(page)).toHaveCount(0)
  }
})

test('the bar stands as the frame has it, § after the pull quote, inside a phone’s width', async ({ page }) => {
  phoneOnly(page)
  await importBook(page, ONE)
  await keyboardUp(page)
  await caretBefore(page, 'Salt')
  const bar = page.locator('.writing-bar')
  await expect(bar.getByRole('button')).toHaveCount(7)
  const names = await bar.getByRole('button').evaluateAll((all) => all.map((b) => b.getAttribute('aria-label')))
  expect(names).toEqual(['Undo', 'Redo', 'Bold', 'Italic', 'Pull quote', 'New chapter', 'Hide keyboard'])
  const box = (await bar.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
})

test('a title typed into a split chapter stays, and Contents lists it where it stands', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'Salt on the')
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('Salt')
  await expect.poll(async () => (await stored(page)).chapters.map((c) => c.title)).toEqual(['One', 'Salt', 'Two'])
})

const PARAGRAPH = 'The windows of the shop had been salted white by the first storm of November, and Ana scraped a small square clear each morning.'
const LONG = `# One\n\n${Array.from({ length: 16 }, (_, i) => `Part ${i + 1}. ${PARAGRAPH}`).join('\n\n')}\n\n# Two\n\nThe end.\n`

test('the numbers agree after a split: the long chapter is counted again, and the new one for the first time', async ({ page }) => {
  await importBook(page, LONG)
  await expect.poll(async () => (await stored(page)).counts.every((n) => n !== undefined)).toBe(true)
  const was = (await stored(page)).counts[0]!
  await press(page, 'Part 9.')
  await expect(page.locator('.title')).toBeFocused()
  await expect.poll(async () => (await stored(page)).counts.filter((n) => n !== undefined).length, { timeout: 15000 }).toBe(3)
  const counts = (await stored(page)).counts as number[]
  expect(counts[0]).toBeLessThan(was)
  const pages = counts.reduce((a, b) => a + b, 0)
  if (onDesktop(page)) await expect(page.locator('.rail-line')).toHaveText(`3 chapters · ${pages} pages`)
  else {
    await page.locator('.title').blur()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.page-button').click()
    await page.locator('.tools .count').click()
    await expect(page.locator('.contents-pages')).toHaveText(`${pages} pages`)
  }
})
