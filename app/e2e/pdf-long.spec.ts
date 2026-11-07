import { expect, type Page, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { caretToEnd, openTools, saved } from './helpers'

// A very long journal (docs/decisions/0019): about 1,000 printed pages must finish, the app must keep answering
// while it works, and the writer's place and text must be as they were. It takes minutes, so it is tagged @long and
// left out of the normal run; `npm run e2e:long` runs it. It is meant for the desktop projects.

// Friday 30 October 2026, fixed: the journal opens on a day of its own, with no words yet.
const NOW = new Date(2026, 9, 30, 10, 0)
const DAYS = 480
/** Printed pages the piece should come to, give or take. */
const ABOUT = { least: 850, most: 1250 }
/** The longest the page may go without drawing a frame while the file is made, in ms. */
const SLOW_FRAME = 400

const SENTENCES = [
  'Woke before the alarm and lay listening to the rain on the skylight.',
  'The kettle took its time, and the street below was empty except for a cat on the bonnet of a car.',
  'We kept the lamp lit all night, and nobody asked why.',
  'Somebody had left the window open in the stairwell, and the whole building smelled of wet stone.',
  'I wrote down what I could remember of the dream before it went, which was not much: a long table, a door that would not shut.',
  'In the afternoon the light came in low and lay across the floor like something spilled.',
]

/** A day's words: three paragraphs, and a line that is only this day's. */
function words(day: number): string {
  const paragraph = (seed: number, n: number) => Array.from({ length: n }, (_, i) => SENTENCES[(seed + i * 5) % SENTENCES.length]).join(' ')
  return [`Day ${day} began with its own small thing.`, paragraph(day, 14), paragraph(day + 2, 12), paragraph(day + 4, 10)].join('\n\n')
}

/** The journal's days, one every date from 1 January 2025. */
function days(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < DAYS; i++) {
    const date = new Date(Date.UTC(2025, 0, 1 + i))
    out[date.toISOString().slice(0, 10)] = words(i + 1)
  }
  return out
}

async function openJournal(page: Page, title: string, all: Record<string, string>): Promise<void> {
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await expect(page.locator('.start.journal')).toBeVisible()
  const sections = Object.keys(all).map((day, i) => ({ sectionId: `day-${i}`, title: day }))
  const piece = {
    id: 'journal',
    kind: 'journal',
    lang: 'en',
    createdAt: NOW.getTime() - 1000,
    updatedAt: NOW.getTime() - 1000,
    title,
    sections,
    words: Object.fromEntries(sections.map((s) => [s.sectionId, (all[s.title] ?? '').split(/\s+/).filter(Boolean).length])),
    outlineId: null,
  }
  const working = sections.map((s) => ({
    sectionId: s.sectionId,
    pieceId: piece.id,
    content: all[s.title] ?? '',
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

/** Every store's records and the last export date: what making a PDF must leave as it was. */
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Record<string, string>>((done) => {
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
                done(out)
              }
            }
          }
        }
      }),
  )

/** The stores that differ between two looks at what is kept (their contents are too long to show). */
const changed = (before: Record<string, string>, after: Record<string, string>): string[] =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((name) => before[name] !== after[name])

/** Where the writer is and what is open: the address, the text, the caret and the scroll. */
const place = (page: Page) =>
  page.evaluate(() => {
    const body = document.querySelector('.body') as HTMLElement
    const s = getSelection()
    const scroller = document.scrollingElement as Element
    return {
      address: location.hash || location.pathname,
      text: body.innerText,
      caret: s?.anchorNode ? [body.contains(s.anchorNode), s.anchorOffset, s.isCollapsed] : null,
      scroll: [scroller.scrollTop, body.scrollTop],
    }
  })

interface Beat {
  longest: number
  worked: boolean
  dropped: number
  frames: number
  gaps: number[]
  /** The longest task the browser itself reports, where it reports them (Chromium). */
  task: number
}

/**
 * Starts a heartbeat that notes when the page last drew a frame and what the PDF row said each time: the
 * longest wait between frames, and whether the row ever stopped saying it was working before the sheet closed.
 */
async function beat(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __beat: Beat }
    const state: Beat = { longest: 0, worked: false, dropped: 0, frames: 0, gaps: [], task: 0 }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.task = Math.max(state.task, entry.duration)
      }).observe({ type: 'longtask', buffered: false })
    } catch {
      // Not every browser reports long tasks: the frames say the same.
    }
    w.__beat = state
    let last = performance.now()
    const tick = (): void => {
      const now = performance.now()
      const row = [...document.querySelectorAll('[role="dialog"][aria-label="Export"] .sheet-row')].find((r) => r.textContent?.includes('PDF'))
      const says = row?.textContent?.includes('Setting your pages…') ?? false
      if (state.worked || says) {
        // Once it has said so, the row says so until the file is made and the sheet goes.
        if (says) state.worked = true
        else if (row && !row.textContent?.includes('Saved as')) state.dropped++
      }
      if (state.worked) {
        state.frames++
        const gap = now - last
        state.longest = Math.max(state.longest, gap)
        if (gap > 100) state.gaps.push(Math.round(gap))
      }
      last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

const pagesIn = async (bytes: Uint8Array): Promise<number> => (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount()

/** The text of one page of a file. */
async function textOf(bytes: Uint8Array, n: number): Promise<string> {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false })
  const doc = await task.promise
  const page = await doc.getPage(n)
  const { items } = await page.getTextContent()
  const text = (items as { str: string }[]).map((i) => i.str).join('')
  await task.destroy()
  return text
}

/** Opens the export sheet. Leaving the page for the sheet may let the page tidy up after itself: that is not the PDF's doing, so it is given time to. */
async function openSheet(page: Page): Promise<void> {
  const exportButton = page.getByRole('button', { name: 'Export' }).filter({ visible: true })
  await expect(exportButton.or(page.locator('.page-button')).first()).toBeVisible()
  await openTools(page)
  await exportButton.first().click()
  await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible()
  await page.waitForTimeout(1500)
}

/** Makes the PDF from the open sheet and reports how long it took and how the page behaved meanwhile. */
async function make(page: Page, browserName: string, label: string) {
  await beat(page)
  const download = page.waitForEvent('download', { timeout: 540_000 })
  const failed = page.getByRole('dialog', { name: 'Export' }).getByText('Couldn’t make the PDF just now. Nothing has changed; try again.')
  const started = Date.now()
  await page.getByRole('button', { name: /PDF/ }).click()
  // Whichever of the two does not happen is left waiting, and must not reject when the page goes.
  const never = (): Promise<never> => new Promise(() => {})
  const outcome = await Promise.race([
    download.then((file) => ({ file })).catch(never),
    failed
      .waitFor({ timeout: 540_000 })
      .then(() => ({ file: undefined }))
      .catch(never),
  ])
  const seconds = (Date.now() - started) / 1000
  const heart = await page.evaluate(() => (window as unknown as { __beat: Beat }).__beat)
  console.log(
    `[long] ${browserName} ${label}: ${outcome.file ? 'finished' : 'failed with the plain line'} in ${seconds.toFixed(1)} s; longest wait between frames ${Math.round(heart.longest)} ms, longest task reported ${Math.round(heart.task)} ms, over ${heart.frames} frames; waits over 100 ms: ${heart.gaps.length}`,
  )
  return { file: outcome.file, seconds, heart }
}

async function bytesOf(file: NonNullable<Awaited<ReturnType<typeof make>>['file']>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const chunk of (await file.createReadStream()) as unknown as AsyncIterable<Uint8Array>) chunks.push(chunk)
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

test.describe('a journal of about a thousand printed pages @long', () => {
  test.describe.configure({ timeout: 600_000 })

  test('finishes, keeps the app answering and leaves the writer where they were', async ({ page, browserName }) => {
    await openJournal(page, 'Dream journal', days())
    // Words on today's page too, so there is open text and a caret in it.
    await caretToEnd(page)
    await page.keyboard.insertText('Typed a moment ago, not yet saved.')
    await saved(page, 'Typed a moment ago')
    await openSheet(page)
    const before = await place(page)
    const kept = await stored(page)

    const { file, seconds, heart } = await make(page, browserName, 'desktop')
    expect(file, 'the file was made').toBeDefined()
    expect(seconds).toBeGreaterThan(0)
    const bytes = await bytesOf(file as NonNullable<typeof file>)
    const count = await pagesIn(bytes)
    console.log(`[long] ${browserName} desktop: ${count} printed pages (plus the title page), ${(bytes.length / 1e6).toFixed(1)} MB`)
    expect(count).toBeGreaterThan(ABOUT.least)
    expect(count).toBeLessThan(ABOUT.most)
    // The last page is the open day, with the words just typed.
    expect(await textOf(bytes, count)).toContain('Typed a moment ago, not yet saved.')

    // Responsive while it worked: frames kept coming, and the row went on saying so.
    expect(heart.worked, 'the row said it was working').toBe(true)
    expect(heart.dropped, 'frames in which the row stopped saying so before the file was made').toBe(0)
    expect(heart.longest, `waits between frames: ${heart.gaps.join(', ')} ms`).toBeLessThan(SLOW_FRAME)

    await expect(page.getByRole('status').filter({ hasText: 'Saved as Dream journal.pdf.' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Export' })).toBeHidden()
    // As it was: the place, the text and the caret, and nothing written.
    expect(await place(page)).toEqual(before)
    expect(changed(kept, await stored(page)), 'stores that changed').toEqual([])
  })
})

test.describe('the same piece on a phone @long', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test.describe.configure({ timeout: 900_000 })

  test('finishes, or says plainly that it could not, and changes nothing', async ({ page, browserName }) => {
    // A phone is slower than this laptop: Chromium is told so.
    if (browserName === 'chromium') await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await openJournal(page, 'Dream journal', days())
    await openSheet(page)
    const before = await place(page)
    const kept = await stored(page)

    const { file, heart } = await make(page, browserName, 'phone')
    if (file) {
      const bytes = await bytesOf(file)
      expect(await pagesIn(bytes)).toBeGreaterThan(ABOUT.least)
      await expect(page.getByRole('status').filter({ hasText: 'Saved as Dream journal.pdf.' })).toBeVisible()
    } else {
      await expect(page.getByRole('dialog', { name: 'Export' })).toContainText('Couldn’t make the PDF just now. Nothing has changed; try again.')
    }
    expect(heart.dropped).toBe(0)
    expect(await place(page)).toEqual(before)
    expect(changed(kept, await stored(page)), 'stores that changed').toEqual([])
  })
})
