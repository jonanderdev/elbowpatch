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
        // Reported at once, so the editor reads it now. Left to the browser's report, it can come after the
        // editor, just given the focus, has put its own caret back.
        document.dispatchEvent(new Event('selectionchange'))
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

/** A key takes the page to the caret, as a writer's would: the menu shows only for words on the page in view. */
async function toPageOf(page: Page, words: string) {
  await caretBefore(page, words)
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(() =>
      page.evaluate((words) => {
        const walker = document.createTreeWalker(document.querySelector('.body')!, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const at = node.textContent!.indexOf(words)
          if (at < 0) continue
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + 1)
          const box = range.getBoundingClientRect()
          const shown = document.querySelector('.pager')!.getBoundingClientRect()
          // A pixel of give, as the selection menu has: WebKit lays a page's first word 1/64 px before its edge.
          return box.left >= shown.left - 1 && box.right <= shown.right + 1
        }
        return false
      }, words),
    )
    .toBe(true)
}

/** § wherever this screen has it: the writing bar on a phone, the selection menu on desktop. */
async function press(page: Page, words: string) {
  if (onDesktop(page)) {
    await toPageOf(page, words)
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
    const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    // Firefox drops the data given to the constructor, so the event is handed it after.
    Object.defineProperty(paste, 'clipboardData', { value: data })
    document.querySelector('.body')!.dispatchEvent(paste)
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

test('a new page keeps no count until it has laid out its text: a number kept before that would be wrong', async ({ page }) => {
  // The fonts settling is what lays a new page's text out: held, that moment stays open. Every count written is noted.
  await page.addInitScript(() => {
    const w = window as unknown as { holdFonts?: Promise<void>; letFontsGo?: () => void; written: Record<string, number>[] }
    w.written = []
    const ready = Object.getOwnPropertyDescriptor(FontFaceSet.prototype, 'ready')!.get!
    Object.defineProperty(document.fonts, 'ready', { get: () => w.holdFonts ?? ready.call(document.fonts) })
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value: { pages?: Record<string, Record<string, number>> }, key?: IDBValidKey) {
      const counts = value?.pages?.[innerWidth < 700 ? 'phone' : 'desktop']
      if (counts) w.written.push({ ...counts })
      return put.call(this, value, key)
    }
  })
  await importBook(page, LONG)
  await expect.poll(async () => (await stored(page)).counts.every((n) => n !== undefined)).toBe(true)
  await page.evaluate(() => {
    const w = window as unknown as { holdFonts?: Promise<void>; letFontsGo?: () => void; written: Record<string, number>[] }
    w.written = []
    w.holdFonts = new Promise((done) => {
      w.letFontsGo = done
    })
  })
  await press(page, 'Part 9.')
  await expect(page.locator('.title')).toBeFocused()
  await page.evaluate(() => (window as unknown as { letFontsGo(): void }).letFontsGo())
  await expect.poll(async () => (await stored(page)).counts.filter((n) => n !== undefined).length, { timeout: 15000 }).toBe(3)

  const { counts } = await stored(page)
  const ids = await page.evaluate(
    () =>
      new Promise<string[]>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const all = open.result.transaction('pieces').objectStore('pieces').getAll()
          all.onsuccess = () => {
            open.result.close()
            done((all.result[0] as { sections: { sectionId: string }[] }).sections.map((s) => s.sectionId))
          }
        }
      }),
  )
  const written = await page.evaluate(() => (window as unknown as { written: Record<string, number>[] }).written)
  const kept = written.map((w) => w[ids[1]!]).filter((n) => n !== undefined)
  expect(kept.length).toBeGreaterThan(0)
  expect(new Set(kept)).toEqual(new Set([counts[1]]))
})

test('after a split no number shows that rests on a count not known yet', async ({ page }) => {
  // Everything waiting for the app to be idle waits for the test.
  await page.addInitScript(() => {
    const w = window as unknown as { held: (() => void)[] | null; requestIdleCallback(f: () => void): number }
    w.held = []
    w.requestIdleCallback = (f) => {
      if (w.held) w.held.push(f)
      else setTimeout(f, 0)
      return 1
    }
  })
  await importBook(page, LONG)
  await press(page, 'Part 9.')
  await expect(page.locator('.title')).toBeFocused()
  if (!onDesktop(page)) {
    await page.locator('.title').blur()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.page-button').click()
    await page.locator('.tools .count').click()
  }
  const pages = page.locator('.contents-row .contents-page')
  await expect(page.locator('.contents-row')).toHaveCount(3)
  // Chapter 1 starts on page 1; everything after it rests on the count the split took away.
  await expect(pages).toHaveCount(1)
  await expect(page.locator('.contents-pages')).toHaveCount(0)

  await page.evaluate(() => {
    const w = window as unknown as { held: (() => void)[] | null }
    const held = w.held ?? []
    w.held = null
    for (const f of held) f()
  })
  await expect(pages).toHaveCount(3, { timeout: 15000 })
})

// Undo across chapters (#61).
const undoKey = 'ControlOrMeta+z'

/** Undo wherever the writer is: the bar with the keyboard up, the keys otherwise. */
async function undo(page: Page) {
  if (onDesktop(page)) await page.keyboard.press(undoKey)
  else await page.locator('.writing-bar').getByRole('button', { name: 'Undo' }).click()
}

/** The chapter's opening page, chosen in Contents. */
async function choose(page: Page, title: string) {
  if (!onDesktop(page)) {
    await page.locator('.title').blur()
    await page.locator('.body').blur()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.page-button').click()
    await page.locator('.tools .count').click()
  }
  await page.locator('.contents-row', { hasText: title }).click()
  await expect(page.locator('.title')).toHaveText(title === 'Untitled' ? '' : title)
}

/** Which position the caret is at in its paragraph, and that paragraph's words. */
const caret = (page: Page) =>
  page.evaluate(() => {
    const s = getSelection()!
    const range = document.createRange()
    const block = s.anchorNode!.parentElement!.closest('p, blockquote')!
    range.selectNodeContents(block)
    range.setEnd(s.anchorNode!, s.anchorOffset)
    return { before: range.toString(), text: block.textContent }
  })

test('one undo straight after § rejoins the text as it was, the caret at the join', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'Salt on the')
  await expect(page.locator('.title')).toBeFocused()
  await expect.poll(() => texts(page)).toEqual(['The ferry at seven.', 'Salt on the *windows and* the rail.', 'The end.'])
  await undo(page)
  await expect(page.locator('.title')).toHaveText('One')
  await expect(page.locator('.body')).toContainText('The ferry at seven.Salt on the windows and the rail.')
  await expect(page.locator('.body')).toBeFocused()
  await expect.poll(() => texts(page)).toEqual(['The ferry at seven.\n\nSalt on the *windows and* the rail.', 'The end.'])
  expect((await caret(page)).before).toBe('The ferry at seven.')
})

test('a cut inside a mark comes back as one mark', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'and')
  await expect(page.locator('.title')).toBeFocused()
  await undo(page)
  await expect(page.locator('.title')).toHaveText('One')
  await expect(page.locator('.body em')).toHaveText('windows and')
  await expect.poll(() => texts(page)).toEqual(['The ferry at seven.\n\nSalt on the *windows and* the rail.', 'The end.'])
  expect(await caret(page)).toEqual({ before: 'Salt on the windows ', text: 'Salt on the windows and the rail.' })
})

test('a title taken from a # line returns as that line', async ({ page }) => {
  await importBook(page, '# One\n\nThe ferry.\n\nThe harbour\n\nSalt.\n\n# Two\n\nThe end.\n')
  if (!onDesktop(page)) await keyboardUp(page)
  await caretBefore(page, 'The harbour')
  await page.keyboard.type('# ')
  await expect(page.locator('.title')).toHaveText('The harbour')
  await expect(page.locator('.title')).toBeFocused()
  await undo(page)
  await expect(page.locator('.title')).toHaveText('One')
  await expect(page.locator('.body')).toContainText('# The harbour')
  await expect.poll(() => texts(page)).toEqual(['The ferry.\n\n\\# The harbour\n\nSalt.', 'The end.'])
})

test('after typing in the new chapter, undo steps through the typing, then rejoins', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'Salt on the')
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.body')).toBeFocused()
  await page.keyboard.type('Typed. ')
  await expect(page.locator('.body')).toContainText('Typed. Salt on the')
  await undo(page)
  await expect(page.locator('.body')).toHaveText('Salt on the windows and the rail.')
  await expect(page.locator('.title')).toHaveText('')
  await undo(page)
  await expect(page.locator('.title')).toHaveText('One')
  await expect.poll(() => texts(page)).toEqual(['The ferry at seven.\n\nSalt on the *windows and* the rail.', 'The end.'])
  const { versions, outlines } = await stored(page)
  expect(versions).toContain('The ferry at seven.')
  expect(outlines).toContainEqual(['One', '', 'Two'])
})

test('a title typed in a split chapter is stepped back first, in the title', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'Salt on the')
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('Salt')
  await expect.poll(async () => (await stored(page)).chapters.map((c) => c.title)).toEqual(['One', 'Salt', 'Two'])
  await undo(page)
  await expect(page.locator('.title')).toHaveText('')
  await undo(page)
  await expect(page.locator('.title')).toHaveText('One')
  await expect.poll(() => texts(page)).toEqual(['The ferry at seven.\n\nSalt on the *windows and* the rail.', 'The end.'])
})

test('a title given in the title, undone past from the text, comes back as a line: no word is lost', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'Salt on the')
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('Salt')
  await page.keyboard.press('Enter')
  await expect(page.locator('.body')).toBeFocused()
  await undo(page)
  await expect(page.locator('.title')).toHaveText('One')
  await expect.poll(() => texts(page)).toEqual(['The ferry at seven.\n\n\\# Salt\n\nSalt on the *windows and* the rail.', 'The end.'])
})

test('change chapter and come back: undo still works there', async ({ page }) => {
  await importBook(page, ONE)
  if (!onDesktop(page)) await keyboardUp(page)
  await caretBefore(page, 'The ferry')
  await page.keyboard.type('Kept. ')
  await saved(page, 'Kept. The ferry')
  await choose(page, 'Two')
  await expect(page.locator('.body')).toHaveText('The end.')
  await choose(page, 'One')
  await expect(page.locator('.body')).toContainText('Kept. The ferry')
  if (!onDesktop(page)) await keyboardUp(page)
  await page.locator('.body').focus()
  await undo(page)
  await expect(page.locator('.body')).not.toContainText('Kept.')
  await expect.poll(async () => (await texts(page))[0]).toBe('The ferry at seven.\n\nSalt on the *windows and* the rail.')
})

test('leaving a split chapter and coming back, undo still rejoins it', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'Salt on the')
  await expect(page.locator('.title')).toBeFocused()
  await expect.poll(() => texts(page)).toHaveLength(3)
  await choose(page, 'Two')
  await choose(page, 'Untitled')
  if (!onDesktop(page)) await keyboardUp(page)
  await page.locator('.body').focus()
  await undo(page)
  await expect(page.locator('.title')).toHaveText('One')
  await expect.poll(() => texts(page)).toEqual(['The ferry at seven.\n\nSalt on the *windows and* the rail.', 'The end.'])
})

test('undo in the chapter left behind by a split never doubles the moved words', async ({ page }) => {
  await importBook(page, ONE)
  if (!onDesktop(page)) await keyboardUp(page)
  await caretBefore(page, 'The ferry')
  await page.keyboard.type('Earlier. ')
  await saved(page, 'Earlier. The ferry')
  if (!onDesktop(page)) {
    await caretBefore(page, 'Salt on the')
    await section(page).click()
  } else {
    await caretBefore(page, 'Salt on the', 11)
    await inMenu(page).click()
  }
  await expect(page.locator('.title')).toBeFocused()
  await expect.poll(() => texts(page)).toHaveLength(3)
  await choose(page, 'One')
  if (!onDesktop(page)) await keyboardUp(page)
  await page.locator('.body').focus()
  await undo(page)
  await expect(page.locator('.body')).toHaveText('Earlier. The ferry at seven.')
  await expect.poll(() => texts(page)).toEqual(['Earlier. The ferry at seven.', 'Salt on the *windows and* the rail.', 'The end.'])
})

test('after a reload a chapter is no longer rejoined by undo, and nothing is lost', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'Salt on the')
  await expect(page.locator('.title')).toBeFocused()
  await expect.poll(() => texts(page)).toHaveLength(3)
  // The keyboard goes with the page: the app starts again at the screen's whole height.
  if (!onDesktop(page)) await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.locator('.body')).toHaveText('Salt on the windows and the rail.')
  if (!onDesktop(page)) await keyboardUp(page)
  await page.locator('.body').focus()
  await undo(page)
  await expect(page.locator('.body')).toHaveText('Salt on the windows and the rail.')
  expect(await texts(page)).toEqual(['The ferry at seven.', 'Salt on the *windows and* the rail.', 'The end.'])
})

test('if a rejoin cannot be stored, everything stays as it was', async ({ page }) => {
  await importBook(page, ONE)
  await press(page, 'Salt on the')
  await expect(page.locator('.title')).toBeFocused()
  await expect.poll(() => texts(page)).toHaveLength(3)
  await page.evaluate(() => {
    ;(window as unknown as { __put: unknown }).__put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('The disk is full.', 'QuotaExceededError')
    }
  })
  await undo(page)
  await expect(page.getByRole('alert')).toContainText("Can't save right now")
  await expect(page.locator('.body')).toHaveText('Salt on the windows and the rail.')
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = (window as unknown as { __put: typeof IDBObjectStore.prototype.put }).__put
  })
  expect(await texts(page)).toEqual(['The ferry at seven.', 'Salt on the *windows and* the rail.', 'The end.'])
})

test('the numbers follow a rejoin: the chapter is counted again, and the other is gone', async ({ page }) => {
  await importBook(page, LONG)
  await expect.poll(async () => (await stored(page)).counts.every((n) => n !== undefined)).toBe(true)
  const { counts: was } = await stored(page)
  await press(page, 'Part 9.')
  await expect(page.locator('.title')).toBeFocused()
  await expect.poll(async () => (await stored(page)).counts.filter((n) => n !== undefined).length, { timeout: 15000 }).toBe(3)
  await undo(page)
  await expect(page.locator('.title')).toHaveText('One')
  await expect.poll(async () => (await stored(page)).counts, { timeout: 15000 }).toEqual(was)
  if (onDesktop(page)) await expect(page.locator('.rail-line')).toContainText('2 chapters')
})

test('a long chapter opens on the page of the join, and says the chapter, not a turn', async ({ page }) => {
  await importBook(page, LONG)
  await press(page, 'Part 9.')
  await expect(page.locator('.title')).toBeFocused()
  await expect.poll(() => texts(page)).toHaveLength(3)
  await undo(page)
  await expect(page.locator('.title')).toHaveText('One')
  await expect(page.locator('.body')).toBeFocused()
  await expect(page.locator('.chapter-said')).toHaveText('One')
  expect((await caret(page)).before.startsWith('Part 8.')).toBe(true)
  const seen = await page.evaluate(() => {
    const range = getSelection()!.getRangeAt(0).cloneRange()
    const box = range.getClientRects()[0] ?? (getSelection()!.anchorNode as Element).getBoundingClientRect()
    const pager = document.querySelector('.pager')!.getBoundingClientRect()
    return box.left >= pager.left && box.left <= pager.right
  })
  expect(seen).toBe(true)
})

test('two splits undo in turn, back to the text as it was', async ({ page }) => {
  await importBook(page, '# One\n\nFirst part.\n\nSecond part.\n\nThird part.\n\n# Two\n\nThe end.\n')
  await press(page, 'Second part.')
  await expect(page.locator('.body')).toContainText('Third part.')
  await expect(page.locator('.title')).toBeFocused()
  await expect.poll(() => texts(page)).toHaveLength(3)
  await page.locator('.title').press('Enter')
  await expect(page.locator('.body')).toBeFocused()
  await press(page, 'Third part.')
  await expect(page.locator('.body')).toHaveText('Third part.')
  await expect(page.locator('.title')).toBeFocused()
  await expect.poll(() => texts(page)).toEqual(['First part.', 'Second part.', 'Third part.', 'The end.'])
  await undo(page)
  await expect.poll(() => texts(page)).toEqual(['First part.', 'Second part.\n\nThird part.', 'The end.'])
  await expect(page.locator('.body')).toBeFocused()
  await undo(page)
  await expect(page.locator('.title')).toHaveText('One')
  await expect.poll(() => texts(page)).toEqual(['First part.\n\nSecond part.\n\nThird part.', 'The end.'])
})
