import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStore } from '../../adapters/memory-store'
import type { Piece, Place } from '../../domain/model'
import { newPiece, openPiece, renameSection, startChapterAt, takeMoment, write } from '../../domain/pieces'
import { replayJournal } from '../app/replay'
import { unsaved } from '../stores/unsaved'
import { createSaving, type Held } from './saving'

const WHOLE = 'Salt on the windows. The ferry at seven.'
const BEFORE = 'Salt on the windows.'
const AFTER = ' The ferry at seven.'

/** A stored book of one chapter, open on a page holding WHOLE. */
async function openBook() {
  let n = 0
  const clock = { now: () => 1_000_000 }
  const ids = { next: () => `id${++n}` }
  const store = memoryStore()
  const deps = { store, clock, ids }
  const draft = newPiece(deps, 'book', 'en')
  const sectionId = draft.sections[0]!.sectionId
  await write(deps, draft, sectionId, WHOLE)
  await renameSection(deps, draft, sectionId, 'One')
  await takeMoment(deps, draft.id)
  const piece = (await openPiece(deps, draft.id))!.piece
  const page = {
    held: { markdown: WHOLE, title: 'One', bookTitle: '', subtitle: '' } as Held,
    readOnly: false,
    failed: false,
    place: undefined as Place | undefined,
  }
  const saving = createSaving({
    deps,
    piece,
    sectionId,
    stored: { markdown: WHOLE, title: 'One', bookTitle: '', subtitle: '' },
    read: () => page.held,
    readOnly: () => page.readOnly,
    place: () => page.place,
    pages: () => ({ screen: 'phone', count: 9 }),
    onStored: () => {},
    onFailed: (failed) => {
      page.failed = failed
    },
  })
  const split = (whole: string, after = AFTER): Promise<Piece> =>
    startChapterAt(deps, piece.id, { sectionId, whole, before: BEFORE, after, title: '', newSectionId: 'new' })
  const texts = async () => (await openPiece(deps, piece.id))!.sections.map((c) => c.content)
  return { deps, store, piece, sectionId, page, saving, split, texts }
}

afterEach(() => {
  for (const u of unsaved.all()) unsaved.saved(u.sectionId)
  vi.useRealTimers()
})

describe('a split through the page that holds the text', () => {
  it('runs on the words as the page holds them, stored first', async () => {
    const b = await openBook()
    b.page.held = { ...b.page.held, markdown: `${WHOLE} Just typed.` }
    b.saving.touch()
    const whole: string[] = []
    const done = await b.saving.split(async (w) => {
      whole.push(w)
      return b.split(w, `${AFTER} Just typed.`)
    })
    expect(done).toBe(true)
    expect(whole).toEqual([`${WHOLE} Just typed.`])
    expect(await b.texts()).toEqual([BEFORE, `${AFTER} Just typed.`])
  })

  it('stores text the page holds that was never touched, such as an imported chapter written differently', async () => {
    const b = await openBook()
    b.page.held = { ...b.page.held, markdown: `${WHOLE}!` }
    expect(await b.saving.split((w) => b.split(w))).toBe(true)
    expect((await b.texts()).join('')).toBe(BEFORE + AFTER)
  })

  it('takes the closing moment after it', async () => {
    const b = await openBook()
    await b.saving.split((w) => b.split(w))
    const versions = await b.store.transaction((tx) => tx.versionsOf('new'))
    expect(versions.map((v) => v.content)).toEqual([AFTER])
  })

  it('the page closing after it, still holding the whole text, writes nothing back', async () => {
    const b = await openBook()
    await b.saving.split((w) => b.split(w))
    b.saving.touch()
    b.saving.journal()
    await b.saving.flush()
    await b.saving.close()
    expect(await b.texts()).toEqual([BEFORE, AFTER])
    expect(unsaved.get(b.sectionId)).toBeUndefined()
  })

  it('keeps no stale page count: the closing page has laid out the whole text', async () => {
    const b = await openBook()
    await b.saving.split((w) => b.split(w))
    b.saving.touch()
    await b.saving.close()
    expect((await openPiece(b.deps, b.piece.id))!.piece.pages?.phone?.[b.sectionId]).toBeUndefined()
  })

  it('the page hiding while it runs keeps nothing in the journal to bring the words back', async () => {
    const b = await openBook()
    await b.saving.split(async (w) => {
      b.saving.journal()
      const piece = await b.split(w)
      b.saving.journal()
      return piece
    })
    expect(unsaved.get(b.sectionId)).toBeUndefined()
  })

  it('a moment under way as it starts does not take the place back to the chapter left', async () => {
    const b = await openBook()
    const place = { sectionId: b.sectionId, paragraph: 0, offset: 0, snippet: '', page: 1, caret: true, at: 1 }
    b.page.place = place
    const moment = b.saving.flush()
    await b.saving.split((w) => b.split(w))
    await moment
    expect((await openPiece(b.deps, b.piece.id))!.piece.place?.sectionId).toBe('new')
  })

  it('a save waiting on a timer as it runs does not fire after it', async () => {
    const b = await openBook()
    vi.useFakeTimers()
    b.saving.touch()
    const done = b.saving.split((w) => b.split(w))
    await vi.advanceTimersByTimeAsync(10_000)
    await done
    vi.useRealTimers()
    expect(await b.texts()).toEqual([BEFORE, AFTER])
  })

  it('an older journal entry for the chapter does not bring the moved words back, even from the same instant', async () => {
    const b = await openBook()
    await b.saving.split((w) => b.split(w))
    // Kept at the very time the split was stored (the test's clock).
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    unsaved.keep({ piece: b.piece, pieceId: b.piece.id, sectionId: b.sectionId, name: 'x.md', markdown: WHOLE, title: null })
    now.mockRestore()
    await replayJournal(b.deps, {
      hold: async () => ({ release() {}, lost: new Promise(() => {}) }),
      take: async () => ({ release() {}, lost: new Promise(() => {}) }),
    })
    expect(await b.texts()).toEqual([BEFORE, AFTER])
  })

  it('if the words cannot be stored, it does not run, and they go to the journal', async () => {
    const b = await openBook()
    b.page.held = { ...b.page.held, markdown: `${WHOLE} Not stored.` }
    b.saving.touch()
    b.store.failNext(new Error('The disk is full.'))
    let ran = false
    const done = await b.saving.split(async (w) => {
      ran = true
      return b.split(w)
    })
    expect(done).toBe(false)
    expect(ran).toBe(false)
    expect(await b.texts()).toEqual([WHOLE])
    expect(unsaved.get(b.sectionId)?.markdown).toBe(`${WHOLE} Not stored.`)
    expect(b.page.failed).toBe(true)
  })

  it('if the split itself fails, everything stays, and saving goes on', async () => {
    const b = await openBook()
    const done = await b.saving.split(async () => {
      throw new Error('The disk is full.')
    })
    expect(done).toBe(false)
    expect(await b.texts()).toEqual([WHOLE])
    b.page.held = { ...b.page.held, markdown: `${WHOLE} More.` }
    b.saving.touch()
    await b.saving.flush()
    expect(await b.texts()).toEqual([`${WHOLE} More.`])
  })

  it('never runs in a window that is not writing, or on a page that has closed', async () => {
    const b = await openBook()
    b.page.readOnly = true
    expect(await b.saving.split((w) => b.split(w))).toBe(false)
    b.page.readOnly = false
    await b.saving.close()
    expect(await b.saving.split((w) => b.split(w))).toBe(false)
    expect(await b.texts()).toEqual([WHOLE])
  })
})
