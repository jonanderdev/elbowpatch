import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, openTools, saved } from './helpers'

const machine = (page: Page) => page.locator('.time-machine')
const oldText = (page: Page) => machine(page).locator('.body')
const menu = (page: Page) => page.getByRole('toolbar', { name: 'Selected words' })
const text = (page: Page) => page.locator('.page-screen:not(.time-machine) .body')
const paragraphs = (page: Page) => text(page).locator('p, blockquote').allTextContents()

/** A new piece of this kind with these words in its text (a new line is a new paragraph), saved. */
async function essay(page: Page, words: string, title = 'Salt', kind: 'essay' | 'book' | 'journal' = 'essay'): Promise<void> {
  await page.goto('./')
  await page.locator(`.start.${kind}`).click()
  if (kind === 'essay') {
    await expect(page.locator('.title')).toBeFocused()
    await page.keyboard.type(title)
    await page.keyboard.press('Enter')
  } else {
    await expect(page.locator('.book-title')).toBeFocused()
    await page.keyboard.type('The Long Winter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    // A book's chapter is named at its opening; a journal's day is named for its date.
    if (kind === 'book') {
      await page.keyboard.type(title)
      await page.keyboard.press('Enter')
    }
  }
  await expect(page.locator('.body')).toBeFocused()
  await page.keyboard.type(words)
  await saved(page, words.split('\n').at(-1)!)
}

/** Replaces all the text. */
async function rewrite(page: Page, words: string): Promise<void> {
  await caretToEnd(page)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(words)
  await saved(page, words.split('\n').at(-1)!)
}

async function open(page: Page): Promise<void> {
  await openTools(page)
  await page.getByRole('button', { name: 'Time Machine' }).click()
  await expect(machine(page)).toBeVisible()
  await expect(machine(page).locator('.moment-name, .moment-note').first()).not.toHaveText('Finding your moments…')
}

/** An essay that was `before`, and is now `now`, with a moment between. */
async function changed(page: Page, before: string, now: string, kind: 'essay' | 'book' | 'journal' = 'essay'): Promise<void> {
  await essay(page, before, 'Salt', kind)
  await open(page)
  await machine(page).getByRole('button', { name: 'Back to now' }).click()
  await expect(machine(page)).toHaveCount(0)
  await rewrite(page, now)
}

/** Selects these words in the old text, as a drag would. */
async function select(page: Page, words: string): Promise<void> {
  await oldText(page).evaluate((body, words) => {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const at = t.textContent!.indexOf(words)
      if (at < 0) continue
      const range = document.createRange()
      range.setStart(t, at)
      range.setEnd(t, at + words.length)
      const selection = getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    throw new Error(`${words} is not in the old text`)
  }, words)
}

async function bring(page: Page, words: string): Promise<void> {
  await open(page)
  await select(page, words)
  await menu(page).getByRole('button', { name: 'Bring part back' }).click()
  await expect(machine(page)).toHaveCount(0)
}

const selected = (page: Page) => page.evaluate(() => getSelection()?.toString())

test('selected old text offers Bring part back and Copy, and cannot be changed', async ({ page }) => {
  await changed(page, 'Alpha one.\nBeta has a lost sentence here. And more.', 'Alpha one.\nBeta has And more.')
  await open(page)
  await expect(menu(page)).toHaveCount(0)
  await select(page, 'a lost sentence here.')
  await expect(menu(page).getByRole('button')).toHaveText(['Bring part back', 'Copy'])
  const words = (await page.evaluate(() => getSelection()?.getRangeAt(0).getBoundingClientRect().toJSON()))!
  const box = (await menu(page).boundingBox())!
  // Above the words, level with their middle, and inside the window.
  expect(box.y + box.height).toBeLessThanOrEqual(words.y)
  expect(box.x).toBeGreaterThanOrEqual(16)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width - 16)
  await page.keyboard.type('x')
  await expect(oldText(page)).toContainText('a lost sentence here.')
  await expect(oldText(page)).not.toContainText('x')
})

test('the menu goes when the selection does, and when the moment changes', async ({ page }) => {
  await changed(page, 'Alpha one.\nBeta has a lost sentence here.', 'Alpha one.')
  await open(page)
  await select(page, 'Beta')
  await expect(menu(page)).toBeVisible()
  await oldText(page).evaluate(() => getSelection()?.removeAllRanges())
  await expect(menu(page)).toHaveCount(0)
  await select(page, 'Beta')
  await expect(menu(page)).toBeVisible()
  await page.keyboard.press('End')
  await expect(menu(page)).toHaveCount(0)
})

test('Bring part back lands the passage as its own paragraph after the one before it, selected, with one line', async ({ page }) => {
  await changed(page, 'Alpha one.\nBeta has a lost sentence here. And more.\nGamma.', 'Alpha one.\nBeta has And more.\nGamma.')
  await bring(page, 'a lost sentence here.')
  await expect.poll(() => paragraphs(page)).toEqual(['Alpha one.', 'a lost sentence here.', 'Beta has And more.', 'Gamma.'])
  await expect(page.locator('.line.calm')).toHaveText('Brought back from just now.')
  await expect.poll(() => selected(page)).toBe('a lost sentence here.')
  await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible()
  await saved(page, 'a lost sentence here.')
})

test('what is brought back is saved like anything typed', async ({ page }) => {
  await changed(page, 'Alpha one.\nBeta has a lost sentence here. And more.', 'Alpha one.\nBeta has And more.')
  await bring(page, 'a lost sentence here.')
  await saved(page, 'a lost sentence here.')
  await page.reload()
  await expect.poll(() => paragraphs(page)).toEqual(['Alpha one.', 'a lost sentence here.', 'Beta has And more.'])
})

test('one undo takes it away', async ({ page }) => {
  await changed(page, 'Alpha one.\nBeta has a lost sentence here. And more.', 'Alpha one.\nBeta has And more.')
  await bring(page, 'a lost sentence here.')
  await expect(text(page)).toContainText('a lost sentence here.')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(text(page)).not.toContainText('a lost sentence here.')
  await expect.poll(() => paragraphs(page)).toEqual(['Alpha one.', 'Beta has And more.'])
})

test('undo takes away the passage and not the words typed just before it', async ({ page }) => {
  await changed(page, 'Alpha one.\nBeta has a lost sentence here. And more.', 'Alpha one.\nBeta has And more.')
  await caretToEnd(page)
  await page.keyboard.type(' Typed.')
  await bring(page, 'a lost sentence here.')
  await expect.poll(() => paragraphs(page)).toEqual(['Alpha one.', 'a lost sentence here.', 'Beta has And more. Typed.'])
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => paragraphs(page)).toEqual(['Alpha one.', 'Beta has And more. Typed.'])
  await saved(page, 'Typed.')
})

test('after heavy edits it lands after the paragraph that came before, wherever that is now', async ({ page }) => {
  await changed(
    page,
    'Alpha one is here.\nBeta had the lost words in it.\nGamma.',
    'A new start.\nAlpha one is here.\nThen Beta, rewritten.\nGamma, longer now.\nMore.',
  )
  await bring(page, 'the lost words')
  await expect
    .poll(() => paragraphs(page))
    .toEqual(['A new start.', 'Alpha one is here.', 'the lost words', 'Then Beta, rewritten.', 'Gamma, longer now.', 'More.'])
})

test('if the paragraph before it is gone, it goes at the end of the section', async ({ page }) => {
  await changed(page, 'Alpha one is here.\nBeta had the lost words in it.', 'Something else.\nAnd more.')
  await bring(page, 'the lost words')
  await expect.poll(() => paragraphs(page)).toEqual(['Something else.', 'And more.', 'the lost words'])
  await expect.poll(() => selected(page)).toBe('the lost words')
})

test('from the first paragraph it goes at the start of the section', async ({ page }) => {
  await changed(page, 'The lost words were first.\nBeta.', 'Beta.\nAnd more.')
  await bring(page, 'The lost words')
  await expect.poll(() => paragraphs(page)).toEqual(['The lost words', 'Beta.', 'And more.'])
})

test('it keeps bold, italic and a pull quote', async ({ page }) => {
  await changed(page, 'Alpha.\nBeta *with* some **bold** words.\n> and a pull quote', 'Alpha.')
  await open(page)
  await oldText(page).evaluate((body) => {
    const range = document.createRange()
    range.setStartBefore(body.querySelector('em')!)
    range.setEndAfter(body.querySelector('blockquote')!.lastChild!)
    const selection = getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await menu(page).getByRole('button', { name: 'Bring part back' }).click()
  await expect(machine(page)).toHaveCount(0)
  await expect(text(page).locator('em')).toHaveText('with')
  await expect(text(page).locator('strong')).toHaveText('bold')
  await expect(text(page).locator('blockquote')).toHaveText('and a pull quote')
  await expect(text(page).locator('p').nth(1)).toHaveText('with some bold words.')
})

test('Copy puts the passage on the clipboard and leaves the Time Machine open', async ({ page }) => {
  // The clipboard itself needs a permission that browsers differ on: what is handed to it is what counts.
  await page.addInitScript(() => {
    const copies: string[] = []
    ;(window as unknown as { copies: string[] }).copies = copies
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void copies.push(t) }, configurable: true })
  })
  await changed(page, 'Alpha one.\nBeta has a lost sentence here. And more.', 'Alpha one.')
  await open(page)
  await select(page, 'a lost sentence here.')
  await menu(page).getByRole('button', { name: 'Copy' }).click()
  await expect(machine(page)).toBeVisible()
  await expect(machine(page).locator('[aria-live]')).toHaveText('Copied')
  expect(await page.evaluate(() => (window as unknown as { copies: string[] }).copies)).toEqual(['a lost sentence here.'])
})

test('it works from a long piece, on the page the passage lands on', async ({ page }) => {
  const filler = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} goes on for a while, so that the text fills more than one page.`)
  const old = ['First.', 'Second has the lost words in it.', ...filler].join('\n')
  const now = ['First.', 'Second has in it.', ...filler].join('\n')
  await changed(page, old, now)
  await bring(page, 'the lost words')
  await expect.poll(async () => (await paragraphs(page)).slice(0, 3)).toEqual(['First.', 'the lost words', 'Second has in it.'])
  // The passage is on the page in view, selected.
  const box = (await page.evaluate(() => getSelection()?.getRangeAt(0).getBoundingClientRect().toJSON()))!
  const pager = (await page.locator('.pager').boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(pager.x - 1)
  expect(box.x).toBeLessThan(pager.x + pager.width)
})

test('the calm line goes after a few seconds', async ({ page }) => {
  await changed(page, 'Alpha one.\nBeta has a lost sentence here.', 'Alpha one.')
  await bring(page, 'a lost sentence here.')
  await expect(page.locator('.line.calm')).toBeVisible()
  await expect(page.locator('.line.calm')).toHaveCount(0, { timeout: 8000 })
})

test('the Time Machine’s history entry is gone after it, so back goes where it would have', async ({ page }) => {
  await changed(page, 'Alpha one.\nBeta has a lost sentence here.', 'Alpha one.')
  await bring(page, 'a lost sentence here.')
  await page.goBack()
  await expect(page.locator('.library, .shelf, .start').first()).toBeVisible()
})

for (const kind of ['book', 'journal'] as const) {
  test(`in a ${kind} it goes into the ${kind === 'book' ? 'chapter' : 'day'} it was read in`, async ({ page }) => {
    await changed(page, 'Alpha one.\nBeta has a lost sentence here. And more.', 'Alpha one.\nBeta has And more.', kind)
    await bring(page, 'a lost sentence here.')
    await expect.poll(() => paragraphs(page)).toEqual(['Alpha one.', 'a lost sentence here.', 'Beta has And more.'])
    await expect(page.locator('.line.calm')).toHaveText('Brought back from just now.')
    await expect.poll(() => selected(page)).toBe('a lost sentence here.')
    await saved(page, 'a lost sentence here.')
  })
}

test('words kept for an unsaved journal day are not written over what is brought back', async ({ page }) => {
  await changed(page, 'Alpha one.\nBeta has a lost sentence here. And more.', 'Alpha one.\nBeta has And more.', 'journal')
  // The day's words, newer than what is stored, left in the unsaved journal as a failed save leaves them.
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((done) => {
      const open = indexedDB.open('elbowpatch')
      open.onsuccess = () => done(open.result)
    })
    const all = <T>(store: string) =>
      new Promise<T[]>((done) => {
        const request = database.transaction(store).objectStore(store).getAll()
        request.onsuccess = () => done(request.result as T[])
      })
    const [working] = await all<{ sectionId: string; pieceId: string }>('working')
    const [piece] = (await all<{ id: string }>('pieces')).filter((p) => p.id === working!.pieceId)
    localStorage.setItem(
      `elbowpatch.unsaved.${working!.sectionId}`,
      JSON.stringify({
        piece,
        pieceId: working!.pieceId,
        sectionId: working!.sectionId,
        name: 'Day.md',
        markdown: 'Alpha one.\n\nBeta has And more.\n\nKept, not stored.',
        title: null,
        at: Date.now() + 1000,
      }),
    )
  })
  await page.reload()
  await expect.poll(() => paragraphs(page)).toEqual(['Alpha one.', 'Beta has And more.', 'Kept, not stored.'])
  // The words it opened on are the stored day; the one before has the sentence.
  await open(page)
  await machine(page).getByRole('slider').press('Home')
  await expect(oldText(page)).toContainText('a lost sentence here.')
  await select(page, 'a lost sentence here.')
  await menu(page).getByRole('button', { name: 'Bring part back' }).click()
  await expect(machine(page)).toHaveCount(0)
  await expect.poll(() => paragraphs(page)).toEqual(['Alpha one.', 'a lost sentence here.', 'Beta has And more.', 'Kept, not stored.'])
  await saved(page, 'a lost sentence here.')
  await page.reload()
  await expect.poll(() => paragraphs(page)).toEqual(['Alpha one.', 'a lost sentence here.', 'Beta has And more.', 'Kept, not stored.'])
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('elbowpatch.unsaved.')))).toEqual([])
})
