import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, openTools, saved } from './helpers'

// Bring chapter back (#91): a chapter's words, or a chapter removed since, back into the book.
const onDesktop = (page: Page) => page.viewportSize()!.width >= 700
const machine = (page: Page) => page.locator('.time-machine')
const oldText = (page: Page) => machine(page).locator('.body')
const bar = (page: Page) => machine(page).locator('.moment-bar')
const tape = (page: Page) => machine(page).getByRole('slider', { name: 'Moment' })
const contents = (page: Page) => (onDesktop(page) ? page.getByRole('navigation', { name: 'Contents' }) : page.getByRole('dialog', { name: 'Contents' }))
const rowsOf = (page: Page) => contents(page).locator('.contents-row')
const line = (page: Page) => page.locator('.line.calm')

const THREE = '# One\n\nFirst chapter.\n\n# Two\n\nSecond.\n\n# Three\n\nThird.\n'

/** Imports a Markdown file as a book called harbour and opens it. */
async function importBook(page: Page, markdown: string): Promise<void> {
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

async function openContents(page: Page): Promise<void> {
  if (onDesktop(page)) return expect(contents(page)).toBeVisible()
  if (await page.locator('.page-button').isVisible()) await page.locator('.page-button').click()
  await page.locator('.tools .count').click()
  await expect(contents(page)).toBeVisible()
}

async function closeSheet(page: Page): Promise<void> {
  if (onDesktop(page)) return
  await contents(page).getByRole('button', { name: 'Done' }).click()
  await expect(contents(page)).toHaveCount(0)
}

async function goTo(page: Page, name: string): Promise<void> {
  await openContents(page)
  await contents(page).locator('.contents-row', { hasText: name }).click()
  await expect(page.locator('.title')).toHaveText(name)
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

async function typeAtEnd(page: Page, words: string): Promise<void> {
  await caretToEnd(page)
  await page.keyboard.type(words)
  await saved(page, words.trim())
}

async function open(page: Page): Promise<void> {
  await openTools(page)
  await page.getByRole('button', { name: 'Time Machine' }).click()
  await expect(machine(page)).toBeVisible()
}

/** Looking back takes a moment first: this keeps the words as they stand, then comes back. */
async function keepMoment(page: Page): Promise<void> {
  await open(page)
  await expect(machine(page).locator('.moment-name, .moment-note').first()).not.toHaveText('Finding your moments…')
  await page.keyboard.press('Escape')
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'true')
}

async function openMachineContents(page: Page): Promise<void> {
  if (!onDesktop(page)) await machine(page).locator('.running-control').click()
  await expect(contents(page)).toBeVisible()
}

/** Everything in a store, as it stands. */
function stored<T>(page: Page, store: string): Promise<T[]> {
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

/** Empties the chapter on the page, title and text, and waits until that is stored. */
async function emptyHere(page: Page): Promise<void> {
  await page.locator('.title').focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await page.locator('.body').focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await expect
    .poll(
      async () => {
        const [working, pieces] = await Promise.all([stored<{ content: string }>(page, 'working'), stored<{ sections: { title: string }[] }>(page, 'pieces')])
        return working.some((w) => w.content === '') && pieces[0]!.sections.some((x) => x.title === '')
      },
      { timeout: 15000 },
    )
    .toBe(true)
}

interface Version {
  id: string
  sectionId: string
  seq: number
  createdAt: number
  content: string
  beforeBringBack?: boolean
}
interface Outline {
  seq: number
  createdAt: number
  sections: { sectionId: string; title: string }[]
}

const titlesNow = async (page: Page): Promise<string[]> => (await stored<{ sections: { title: string }[] }>(page, 'pieces'))[0]!.sections.map((s) => s.title)

/** The second chapter removed, and the page on the first. */
async function twoRemoved(page: Page): Promise<void> {
  await importBook(page, THREE)
  await goTo(page, 'Two')
  await emptyHere(page)
  await goTo(page, 'One')
  await openContents(page)
  await contents(page).getByRole('button', { name: 'Remove chapter' }).click()
  await expect(rowsOf(page)).toHaveCount(2)
  await closeSheet(page)
  expect(await titlesNow(page)).toEqual(['One', 'Three'])
}

/** The Time Machine opened on the page, then on the removed chapter, as Contents as it was lists it. */
async function onRemoved(page: Page, index: number): Promise<void> {
  await open(page)
  await expect(tape(page)).toBeVisible()
  await openMachineContents(page)
  await rowsOf(page).nth(index).click()
  await expect(tape(page)).toBeVisible()
}

test('Bring chapter back restores that chapter’s words, keeps its title and the rest of the book, and lands on it', async ({ page }) => {
  await importBook(page, THREE)
  await goTo(page, 'Two')
  await keepMoment(page)
  await typeAtEnd(page, ' Changed since.')
  await open(page)
  await expect(oldText(page)).toHaveText('Second.')
  await expect(machine(page).getByRole('button', { name: 'Bring chapter back' })).toBeVisible()
  await machine(page).getByRole('button', { name: 'Bring chapter back' }).click()

  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.title')).toHaveText('Two')
  await expect(page.locator('.body')).toHaveText('Second.')
  await expect(line(page)).toHaveText('Chapter 2 brought back from just now. The rest of the book is as it was.')
  expect(await titlesNow(page)).toEqual(['One', 'Two', 'Three'])
  expect((await stored<{ content: string }>(page, 'working')).map((w) => w.content).sort()).toEqual(['First chapter.', 'Second.', 'Third.'])
  expect((await stored<Version>(page, 'versions')).filter((v) => v.beforeBringBack).map((v) => v.content)).toEqual(['Second. Changed since.'])

  await expect(line(page)).toHaveCount(0, { timeout: 8000 })
  await page.reload()
  await expect(page.locator('.body')).toHaveText('Second.')
  expect((await stored<{ content: string }>(page, 'working')).map((w) => w.content).sort()).toEqual(['First chapter.', 'Second.', 'Third.'])
})

test('a chapter removed since returns in its old place with its old title, in a later outline, and stays through a reload', async ({ page }) => {
  await twoRemoved(page)
  await typeAtEnd(page, ' Then more.')
  await open(page)
  await expect(tape(page)).toBeVisible()
  await openMachineContents(page)
  await expect(rowsOf(page)).toHaveText([/^One/, /^Two\s*removed since$/, /^Three/])
  await rowsOf(page).nth(1).click()
  await expect(machine(page).locator('.title')).toHaveText('Two')
  await expect(oldText(page)).toHaveText('Second.')

  await machine(page).getByRole('button', { name: 'Bring chapter back' }).click()

  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.title')).toHaveText('Two')
  await expect(page.locator('.body')).toHaveText('Second.')
  await expect(line(page)).toHaveText('Chapter 2 brought back from just now. The rest of the book is as it was.')
  expect(await titlesNow(page)).toEqual(['One', 'Two', 'Three'])
  await openContents(page)
  await expect(rowsOf(page)).toHaveText([/^One/, /^Two/, /^Three/])
  await expect(rowsOf(page).nth(1)).toHaveAttribute('aria-current', 'true')
  // The counts follow: three chapters again, and pages once the chapter that came back has been laid out.
  if (onDesktop(page)) await expect(contents(page).locator('.rail-line')).toContainText('3 chapters')
  await expect(contents(page).locator('.contents-pages')).toHaveText(/^\d+ pages?$/, { timeout: 15000 })
  const piece = (await stored<{ words: Record<string, number>; sections: { sectionId: string }[] }>(page, 'pieces'))[0]!
  expect(piece.words[piece.sections[1]!.sectionId]).toBe(1)
  await closeSheet(page)

  // The text it replaced stands marked, and the outline that has the chapter back is stamped later than it.
  const versions = await stored<Version>(page, 'versions')
  const marked = versions.filter((v) => v.beforeBringBack)
  expect(marked).toHaveLength(1)
  const outlines = (await stored<Outline>(page, 'outlines')).sort((a, b) => a.seq - b.seq)
  const last = outlines.at(-1)!
  expect(last.sections.map((s) => s.title)).toEqual(['One', 'Two', 'Three'])
  expect(last.createdAt).toBeGreaterThan(marked[0]!.createdAt)
  expect(outlines.at(-2)!.sections.map((s) => s.title)).toEqual(['One', 'Three'])

  await expect(line(page)).toHaveCount(0, { timeout: 8000 })
  await page.reload()
  await expect(page.locator('.body')).toHaveText('Second.')
  expect(await titlesNow(page)).toEqual(['One', 'Two', 'Three'])
  await openContents(page)
  await expect(rowsOf(page)).toHaveText([/^One/, /^Two/, /^Three/])
  await closeSheet(page)
  await open(page)
  await expect(tape(page)).toBeFocused()
  await expect(oldText(page)).toHaveText('')
  await page.keyboard.press('End')
  await expect(machine(page).locator('.title')).toHaveText('Two')
  await expect(oldText(page)).toHaveText('Second.')
})

test('pressed twice, a removed chapter comes back once', async ({ page }) => {
  await twoRemoved(page)
  await typeAtEnd(page, ' Then more.')
  await onRemoved(page, 1)
  await expect(oldText(page)).toHaveText('Second.')
  const before = (await stored<Outline>(page, 'outlines')).length
  await machine(page)
    .getByRole('button', { name: 'Bring chapter back' })
    .dblclick()
    .catch(() => {})
  await expect(machine(page)).toHaveCount(0)
  expect(await titlesNow(page)).toEqual(['One', 'Two', 'Three'])
  expect((await stored<Outline>(page, 'outlines')).length).toBe(before + 1)
  expect((await stored<Version>(page, 'versions')).filter((v) => v.beforeBringBack)).toHaveLength(1)
})

test('a failed bring back of a removed chapter changes nothing, and Try again brings it', async ({ page }) => {
  await twoRemoved(page)
  await typeAtEnd(page, ' Then more.')
  await onRemoved(page, 1)
  await expect(oldText(page)).toHaveText('Second.')
  const everything = async () => ({
    pieces: await stored(page, 'pieces'),
    outlines: await stored(page, 'outlines'),
    versions: await stored(page, 'versions'),
    working: await stored(page, 'working'),
  })
  const before = await everything()
  await page.evaluate(() => {
    const w = window as unknown as { broken: boolean }
    w.broken = true
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (w.broken && this.name === 'outlines') throw new Error('No room')
      return put.apply(this, args)
    }
  })
  await machine(page).getByRole('button', { name: 'Bring chapter back' }).click()
  await expect(bar(page)).toContainText('Couldn’t bring that back just now. Nothing has changed.')
  expect(await everything()).toEqual(before)

  await page.evaluate(() => {
    ;(window as unknown as { broken: boolean }).broken = false
  })
  await machine(page).getByRole('button', { name: 'Try again' }).click()
  await expect(machine(page)).toHaveCount(0)
  expect(await titlesNow(page)).toEqual(['One', 'Two', 'Three'])
  await expect(page.locator('.body')).toHaveText('Second.')
})

test('Try again after the moment has gone reads the moments again, and writes nothing', async ({ page }) => {
  await importBook(page, THREE)
  await keepMoment(page)
  await typeAtEnd(page, ' Then more.')
  await keepMoment(page)
  await typeAtEnd(page, ' And more.')
  await open(page)
  // Opens on the most recent moment that differs from now: the middle one.
  await expect(oldText(page)).toHaveText('First chapter. Then more.')
  await page.evaluate(() => {
    const w = window as unknown as { broken: boolean }
    w.broken = true
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (w.broken && this.name === 'versions') throw new Error('No room')
      return put.apply(this, args)
    }
  })
  await machine(page).getByRole('button', { name: 'Bring chapter back' }).click()
  await expect(bar(page)).toContainText('Couldn’t bring that back just now.')

  // Another window thinned that moment away meanwhile, which is all thinning can do to a middle one.
  const middle = (await stored<Version>(page, 'versions')).filter((v) => v.content === 'First chapter. Then more.')
  expect(middle).toHaveLength(1)
  await page.evaluate(
    (id) =>
      new Promise<void>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const tx = open.result.transaction('versions', 'readwrite')
          tx.objectStore('versions').delete(id)
          tx.oncomplete = () => {
            open.result.close()
            done()
          }
        }
      }),
    middle[0]!.id,
  )
  await page.evaluate(() => {
    ;(window as unknown as { broken: boolean }).broken = false
  })
  const before = await stored(page, 'versions')

  await machine(page).getByRole('button', { name: 'Try again' }).click()

  // It does not fail again for a moment that is not there: the tape shows what is left, and nothing is written.
  await expect(oldText(page)).toHaveText('First chapter.')
  await expect(bar(page)).not.toContainText('Couldn’t bring that back')
  await expect(machine(page).getByRole('button', { name: 'Bring chapter back' })).toBeVisible()
  expect(await stored(page, 'versions')).toEqual(before)
  // And it brings back what is there.
  await machine(page).getByRole('button', { name: 'Bring chapter back' }).click()
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.body')).toHaveText('First chapter.')
})

test('bringing back another chapter keeps the undo of the chapter the page was on, and ends that of the one that came back', async ({ page }) => {
  test.skip(!onDesktop(page), 'Undo by key is a desktop’s; the phone’s bar has its own, with the keyboard up.')
  await twoRemoved(page)
  // Typed in One: its undo history is what must outlive the bring back.
  await typeAtEnd(page, ' Typed in one.')
  await onRemoved(page, 1)
  await expect(oldText(page)).toHaveText('Second.')
  await machine(page).getByRole('button', { name: 'Bring chapter back' }).click()
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.title')).toHaveText('Two')
  await expect(page.locator('.body')).toHaveText('Second.')

  // Its own undo is over: nothing to step back to.
  await page.locator('.body').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.body')).toHaveText('Second.')

  // One's stays: a step back takes off what was typed there.
  await goTo(page, 'One')
  await expect(page.locator('.body')).toHaveText('First chapter. Typed in one.')
  await page.locator('.body').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.body')).toHaveText('First chapter.')
})

test('the chapter that was first returns first, with the title page', async ({ page }) => {
  await importBook(page, THREE)
  await goTo(page, 'One')
  await emptyHere(page)
  await goTo(page, 'Two')
  await openContents(page)
  await contents(page).getByRole('button', { name: 'Remove chapter' }).click()
  // The page reopens on the chapter that now has the title page, which closes a phone's sheet.
  await expect.poll(() => titlesNow(page), { timeout: 15000 }).toEqual(['Two', 'Three'])
  if (!onDesktop(page)) await expect(contents(page)).toHaveCount(0)
  await typeAtEnd(page, ' Then more.')
  await open(page)
  await openMachineContents(page)
  await expect(rowsOf(page)).toHaveText([/^One\s*removed since$/, /^Two/, /^Three/])
  await rowsOf(page).nth(0).click()
  await expect(oldText(page)).toHaveText('First chapter.')
  await machine(page).getByRole('button', { name: 'Bring chapter back' }).click()
  await expect(machine(page)).toHaveCount(0)
  await expect(page.locator('.title')).toHaveText('One')
  await expect(page.locator('.book-title')).toHaveText('harbour')
  await expect(line(page)).toHaveText('Chapter 1 brought back from just now. The rest of the book is as it was.')
  expect(await titlesNow(page)).toEqual(['One', 'Two', 'Three'])
  // Two had the title page and has it no more: its undo goes on, though its page was sealed meanwhile.
  if (onDesktop(page)) {
    await goTo(page, 'Two')
    await expect(page.locator('.body')).toHaveText('Second. Then more.')
    await page.locator('.body').focus()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.locator('.body')).toHaveText('Second.')
  }
})
