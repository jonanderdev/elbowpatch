import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStore } from '../../adapters/memory-store'
import type { Piece, Place } from '../../domain/model'
import { newPiece, openPiece, rejoinChapter, renameSection, startChapterAt, takeMoment, write } from '../../domain/pieces'
import type { Store } from '../../domain/ports'
import { replayJournal } from '../app/replay'
import { closingAfter, settledWithin } from '../app/settled'
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
    closing: () => Promise.resolve(),
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

  it('words kept earlier that differ stay for Save a copy, and do not replay over it', async () => {
    const b = await openBook()
    const now = vi.spyOn(Date, 'now').mockReturnValue(999_000)
    unsaved.keep({ piece: b.piece, pieceId: b.piece.id, sectionId: b.sectionId, name: 'x.md', markdown: 'Overtaken words.', title: null })
    now.mockRestore()
    await b.saving.split((w) => b.split(w))
    expect(unsaved.get(b.sectionId)?.markdown).toBe('Overtaken words.')
    await replayJournal(b.deps, {
      hold: async () => ({ release() {}, lost: new Promise(() => {}) }),
      take: async () => ({ release() {}, lost: new Promise(() => {}) }),
    })
    expect(await b.texts()).toEqual([BEFORE, AFTER])
    expect(unsaved.get(b.sectionId)?.markdown).toBe('Overtaken words.')
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

  it('a second one asked for while the first waits does not run', async () => {
    const b = await openBook()
    b.page.held = { ...b.page.held, markdown: `${WHOLE} Just typed.` }
    let ran = 0
    const once = (w: string): Promise<Piece> => {
      ran++
      return b.split(w, `${AFTER} Just typed.`)
    }
    const both = await Promise.all([b.saving.split(once), b.saving.split(once)])
    expect(ran).toBe(1)
    expect(both.filter(Boolean)).toHaveLength(1)
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

describe('a rejoin through the page of the chapter going back', () => {
  /** A book just split, open on the new chapter's page. */
  async function openSplit() {
    const b = await openBook()
    const piece = await b.split(WHOLE)
    const page = { held: { markdown: AFTER, title: '', bookTitle: null, subtitle: null } as Held }
    const saving = createSaving({
      deps: b.deps,
      piece,
      sectionId: 'new',
      stored: { markdown: AFTER, title: '', bookTitle: '', subtitle: '' },
      read: () => page.held,
      readOnly: () => false,
      place: () => undefined,
      pages: () => ({ screen: 'phone', count: 9 }),
      onStored: () => {},
      onFailed: () => {},
      closing: () => Promise.resolve(),
    })
    const rejoin = async (whole: string): Promise<Piece> =>
      (await rejoinChapter(b.deps, b.piece.id, { sectionId: 'new', into: b.sectionId, whole, seam: { front: 'inside', raw: false, escaped: false } })).piece
    return { ...b, page, saving, rejoin }
  }
  const replay = (b: Awaited<ReturnType<typeof openSplit>>) =>
    replayJournal(b.deps, {
      hold: async () => ({ release() {}, lost: new Promise(() => {}) }),
      take: async () => ({ release() {}, lost: new Promise(() => {}) }),
    })

  it('stores words typed just before it, and takes them along', async () => {
    const b = await openSplit()
    b.page.held = { ...b.page.held, markdown: `${AFTER} Typed.` }
    expect(await b.saving.split(b.rejoin)).toBe(true)
    expect(await b.texts()).toEqual([`${WHOLE} Typed.`])
  })

  it('the page closing behind it writes nothing, so the words are not doubled and the chapter stays out', async () => {
    const b = await openSplit()
    await b.saving.split(b.rejoin)
    await b.saving.close()
    const { piece, sections } = (await openPiece(b.deps, b.piece.id))!
    expect(sections.map((c) => c.content)).toEqual([WHOLE])
    expect(piece.sections.map((c) => c.sectionId)).toEqual([b.sectionId])
    expect(piece.pages?.phone?.new).toBeUndefined()
  })

  it('words kept earlier, for either chapter, do not replay over it or put the chapter back', async () => {
    const b = await openSplit()
    const now = vi.spyOn(Date, 'now').mockReturnValue(999_000)
    unsaved.keep({ piece: b.piece, pieceId: b.piece.id, sectionId: b.sectionId, name: 'x.md', markdown: 'Overtaken words.', title: null })
    const draft = { ...b.piece, sections: [...b.piece.sections, { sectionId: 'new', title: '' }] }
    unsaved.keep({ piece: draft, pieceId: b.piece.id, sectionId: 'new', name: 'x.md', markdown: 'Overtaken too.', title: null })
    now.mockRestore()
    await b.saving.split(b.rejoin)
    await replay(b)
    expect(await b.texts()).toEqual([WHOLE])
    expect(unsaved.get(b.sectionId)?.markdown).toBe('Overtaken words.')
  })

  it('if it fails, everything stays, and the chapter goes on saving', async () => {
    const b = await openSplit()
    const done = await b.saving.split(async () => {
      throw new Error('The disk is full.')
    })
    expect(done).toBe(false)
    expect(await b.texts()).toEqual([BEFORE, AFTER])
    b.page.held = { ...b.page.held, markdown: `${AFTER} More.` }
    b.saving.touch()
    await b.saving.flush()
    expect(await b.texts()).toEqual([BEFORE, `${AFTER} More.`])
  })
})

/** A store whose next transaction waits until it is let go, as a stalled disk holds a save. The rest carry on. */
function stalling(store: Store): Store & { stallNext(): () => void } {
  let waiting: Promise<void> | undefined
  return {
    stallNext() {
      let go = (): void => {}
      waiting = new Promise((r) => {
        go = r
      })
      return go
    },
    transaction(fn) {
      const wait = waiting
      waiting = undefined
      return wait ? wait.then(() => store.transaction(fn)) : store.transaction(fn)
    },
  }
}

describe('reshaping behind a page still closing', () => {
  const held = (markdown: string, title: string): Held => ({ markdown, title, bookTitle: '', subtitle: '' })

  /** A book split in two, with a page open on each. `closing` is what the page on the new chapter waits for. */
  async function twoPages() {
    let n = 0
    const raw = memoryStore()
    const store = stalling(raw)
    const deps = { store, clock: { now: () => Date.now() }, ids: { next: () => `id${++n}` } }
    const draft = newPiece(deps, 'book', 'en')
    const first = draft.sections[0]!.sectionId
    await write(deps, draft, first, WHOLE)
    await takeMoment(deps, draft.id)
    await startChapterAt(deps, draft.id, { sectionId: first, whole: WHOLE, before: BEFORE, after: AFTER, title: '', newSectionId: 'new' })
    const piece = (await openPiece(deps, draft.id))!.piece
    const pageOn = (sectionId: string, markdown: string, closing: () => Promise<void>) => {
      const page = { held: held(markdown, '') }
      const saving = createSaving({
        deps,
        piece,
        sectionId,
        stored: { markdown, title: '', bookTitle: '', subtitle: '' },
        read: () => page.held,
        readOnly: () => false,
        place: () => undefined,
        pages: () => null,
        onStored: () => {},
        onFailed: () => {},
        closing,
      })
      return { page, saving }
    }
    const rejoin = (whole: string) => async (): Promise<Piece> =>
      (await rejoinChapter(deps, piece.id, { sectionId: 'new', into: first, whole, seam: { front: 'inside', raw: false, escaped: false } })).piece
    const texts = async () => (await openPiece(deps, piece.id))!.sections.map((c) => c.content)
    return { deps, raw, store, piece, first, pageOn, rejoin, texts }
  }

  it('a rejoin is refused while the closing save of the chapter it joins may still land, and no word leaves the book', async () => {
    vi.useFakeTimers()
    const b = await twoPages()
    const left = b.pageOn(b.first, BEFORE, () => Promise.resolve())
    left.page.held = held(`${BEFORE} Typed.`, '')
    left.saving.touch()
    const go = b.store.stallNext()
    const closing = left.saving.close()
    const here = b.pageOn('new', AFTER, () => closing)

    const done = here.saving.split(b.rejoin(AFTER))
    await vi.advanceTimersByTimeAsync(2000)
    expect(await done).toBe(false)

    go()
    await vi.runAllTimersAsync()
    await closing
    expect(await b.texts()).toEqual([`${BEFORE} Typed.`, AFTER])
  })

  it('a rejoin waits for a closing save that ends in time, and takes its words along', async () => {
    const b = await twoPages()
    const left = b.pageOn(b.first, BEFORE, () => Promise.resolve())
    left.page.held = held(`${BEFORE} Typed.`, '')
    left.saving.touch()
    const go = b.store.stallNext()
    const closing = left.saving.close()
    const here = b.pageOn('new', AFTER, () => closing)

    const done = here.saving.split(b.rejoin(AFTER))
    setTimeout(go, 10)
    expect(await done).toBe(true)
    expect(await b.texts()).toEqual([`${BEFORE} Typed.${AFTER}`])
  })

  it('a split is refused while an earlier page of its own chapter may still write the whole text back', async () => {
    vi.useFakeTimers()
    const b = await twoPages()
    const left = b.pageOn(b.first, BEFORE, () => Promise.resolve())
    left.page.held = held(`${BEFORE} Typed.`, '')
    left.saving.touch()
    const go = b.store.stallNext()
    const closing = left.saving.close()
    const back = b.pageOn(b.first, `${BEFORE} Typed.`, () => closing)

    const done = back.saving.split(async (whole) =>
      startChapterAt(b.deps, b.piece.id, { sectionId: b.first, whole, before: BEFORE, after: ' Typed.', title: '', newSectionId: 'later' }),
    )
    await vi.advanceTimersByTimeAsync(2000)
    expect(await done).toBe(false)

    go()
    await vi.runAllTimersAsync()
    await closing
    expect(await b.texts()).toEqual([`${BEFORE} Typed.`, AFTER])
  })

  it('every closing page counts, not only the last', async () => {
    let finish = (): void => {}
    const stuck = new Promise<void>((r) => {
      finish = r
    })
    const both = closingAfter(stuck, Promise.resolve())
    expect(await settledWithin(both, 20)).toBe(false)
    finish()
    expect(await settledWithin(both, 20)).toBe(true)
  })

  it('a closing page that failed has finished: nothing of it can land later', async () => {
    expect(await settledWithin(closingAfter(Promise.reject(new Error('The disk is full.')), Promise.resolve()), 20)).toBe(true)
  })
})
