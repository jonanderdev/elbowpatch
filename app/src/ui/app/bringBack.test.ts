import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStore } from '../../adapters/memory-store'
import { momentsOf } from '../../domain/lookBack'
import type { Piece } from '../../domain/model'
import { newPiece, openPiece, rename, takeMoment, write } from '../../domain/pieces'
import type { Store, WriterLock } from '../../domain/ports'
import { thin } from '../../domain/thinning'
import { keepUndo, takeUndo } from '../../page/undoMemory'
import { keptFor } from '../page/fields'
import { createSaving, type Saving } from '../page/saving'
import { unsaved } from '../stores/unsaved'
import { type BringBackSeams, bringSectionBack, NotBroughtBack } from './bringBack'
import { replayJournal } from './replay'

const MIN = 60_000
const DAY = 86_400_000
const START = Date.UTC(2026, 9, 1)

afterEach(() => {
  for (const u of unsaved.all()) unsaved.saved(u.sectionId)
  vi.useRealTimers()
})

/** A store that can hold a transaction until it is let go, or refuse to write a version. */
function unreliable(store: Store) {
  let waiting: Promise<void> | undefined
  const state = { refuseVersions: false }
  const wrapped: Store = {
    transaction(fn) {
      const wait = waiting
      waiting = undefined
      const run = (): ReturnType<Store['transaction']> =>
        store.transaction((tx) =>
          fn({
            ...tx,
            putVersion: (v) => {
              if (state.refuseVersions) throw new Error('disk full')
              return tx.putVersion(v)
            },
          }),
        )
      return wait ? wait.then(run) : run()
    },
  } as Store
  return {
    store: wrapped,
    state,
    /** The next transaction waits for the returned function. */
    stallNext(): () => void {
      let go = (): void => {}
      waiting = new Promise((r) => {
        go = r
      })
      return go
    },
  }
}

/** An essay written as `one` then `two`, a minute apart, with a page open on `two`. Time is the real clock, which the journal stamps by. */
async function setup() {
  vi.useFakeTimers({ now: START, toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  let n = 0
  const raw = unreliable(memoryStore())
  const deps = { store: raw.store, clock: { now: () => Date.now() }, ids: { next: () => `id${++n}` } }
  const piece = newPiece(deps, 'essay', 'en')
  const sectionId = piece.sections[0]!.sectionId
  await rename(deps, piece, 'Salt')
  for (const text of ['one', 'two']) {
    vi.setSystemTime(Date.now() + MIN)
    await write(deps, piece, sectionId, text)
    await takeMoment(deps, piece.id)
  }
  vi.setSystemTime(Date.now() + MIN)
  const lock = { writes: true }

  /** A page opened on the section as it is stored now: what App does, and so a page that is closed and opened anew. */
  async function pageOpen() {
    const found = (await openPiece(deps, piece.id))!
    const content = found.sections[0]!.content
    const page = { markdown: content, failed: false }
    const saving: Saving = createSaving({
      deps,
      piece: found.piece,
      sectionId,
      stored: { markdown: content, title: 'Salt', bookTitle: '', subtitle: '' },
      read: () => ({ markdown: page.markdown, title: 'Salt', bookTitle: null, subtitle: null }),
      readOnly: () => false,
      place: () => undefined,
      pages: () => null,
      onStored: () => {},
      onFailed: (failed) => {
        page.failed = failed
      },
      closing: () => Promise.resolve(),
    })
    const seams: BringBackSeams = { deps, pieceId: piece.id, reshape: () => saving.reshape, writes: () => lock.writes }
    return { page, saving, seams }
  }
  const at = async (content: string) => {
    const m = (await momentsOf(deps, piece.id, sectionId)).find((x) => x.content === content)!
    return { sectionId, at: m.at, content: m.content }
  }
  const versions = async () => (await deps.store.transaction((tx) => tx.versionsOf(sectionId))).sort((a, b) => a.seq - b.seq)
  const stored = async () => (await openPiece(deps, piece.id))!.sections[0]!.content
  const dump = () =>
    deps.store.transaction(async (tx) => ({
      working: await tx.working(sectionId),
      versions: await tx.versionsOf(sectionId),
      outlines: await tx.outlinesOf(piece.id),
      piece: await tx.piece(piece.id),
    }))
  return { deps, raw, piece, sectionId, lock, pageOpen, at, versions, stored, dump }
}

describe('bringing an essay back through the page that holds it', () => {
  it('keeps words typed just before in the replaced moment, and the page closing afterwards writes nothing over what came back', async () => {
    const s = await setup()
    const { page, saving, seams } = await s.pageOpen()
    // Typed, and the save has not run: only the page holds these words.
    page.markdown = 'two, and typed just now'
    saving.touch()

    const done = await bringSectionBack(seams, await s.at('one'))

    expect(done).toMatchObject({ content: 'one', changed: true })
    expect(await s.stored()).toBe('one')
    const replaced = (await s.versions()).find((v) => v.beforeBringBack)
    expect(replaced?.content).toBe('two, and typed just now')
    // The page unmounts, still holding what it typed: its closing save, its place and its moment write nothing.
    await saving.close()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await s.stored()).toBe('one')
    expect((await openPiece(s.deps, s.piece.id))!.piece.place).toBeUndefined()
    expect((await s.versions()).map((v) => v.content)).toEqual(['one', 'two', 'two, and typed just now', 'one'])
  })

  it('waits for a save under way, and the old text still stands once that save has landed', async () => {
    const s = await setup()
    const { page, saving, seams } = await s.pageOpen()
    page.markdown = 'two, and typed just now'
    saving.touch()
    const release = s.raw.stallNext()
    await vi.advanceTimersByTimeAsync(1100)

    let finished = false
    const run = bringSectionBack(seams, await s.at('one')).then((r) => {
      finished = true
      return r
    })
    await vi.advanceTimersByTimeAsync(500)
    expect(finished).toBe(false)
    expect(await s.stored()).toBe('two')

    release()
    await vi.advanceTimersByTimeAsync(10)
    expect(await run).toMatchObject({ content: 'one', changed: true })
    expect(await s.stored()).toBe('one')
    expect((await s.versions()).find((v) => v.beforeBringBack)?.content).toBe('two, and typed just now')
    await saving.close()
    expect(await s.stored()).toBe('one')
  })

  it('is refused when a save is still running after the wait, writes nothing, and the page goes on saving', async () => {
    const s = await setup()
    const { page, saving, seams } = await s.pageOpen()
    page.markdown = 'two, and typed just now'
    saving.touch()
    const release = s.raw.stallNext()
    await vi.advanceTimersByTimeAsync(1100)

    const run = bringSectionBack(seams, await s.at('one')).then(
      () => 'brought',
      (e) => e,
    )
    await vi.advanceTimersByTimeAsync(2000)
    expect(await run).toBeInstanceOf(NotBroughtBack)
    release()
    await vi.advanceTimersByTimeAsync(10)
    // What the page typed is stored by its own save; nothing came back.
    expect(await s.stored()).toBe('two, and typed just now')
    expect((await s.versions()).some((v) => v.beforeBringBack)).toBe(false)
    expect(page.failed).toBe(false)
    page.markdown = 'two, and typed just now, and more'
    saving.touch()
    await vi.advanceTimersByTimeAsync(1100)
    expect(await s.stored()).toBe('two, and typed just now, and more')
  })

  it('leaves everything as it was when the transaction fails, and the page saves again without saying it failed', async () => {
    const s = await setup()
    const { page, saving, seams } = await s.pageOpen()
    page.markdown = 'two, and typed'
    saving.touch()
    await saving.flush()
    const before = await s.dump()
    s.raw.state.refuseVersions = true

    await expect(bringSectionBack(seams, await s.at('one'))).rejects.toBeInstanceOf(NotBroughtBack)

    s.raw.state.refuseVersions = false
    expect(await s.dump()).toEqual(before)
    expect(page.failed).toBe(false)
    page.markdown = 'two, and typed, and more'
    saving.touch()
    await vi.advanceTimersByTimeAsync(1100)
    expect(await s.stored()).toBe('two, and typed, and more')
  })

  it('refuses a moment on screen that thinning has taken in another window, and writes nothing', async () => {
    const s = await setup()
    const { seams } = await s.pageOpen()
    const request = await s.at('one')
    // Another window's launch thinned the moment away: what is stored at that time is no longer what was seen.
    await s.deps.store.transaction(async (tx) => {
      const [first] = (await tx.versionsOf(s.sectionId)).sort((a, b) => a.seq - b.seq)
      await tx.putVersion({ ...first!, content: 'something else' })
    })
    const before = await s.dump()
    await expect(bringSectionBack(seams, request)).rejects.toBeInstanceOf(NotBroughtBack)
    expect(await s.dump()).toEqual(before)
  })

  it('is refused, writing nothing, in a window that lost the piece to another while it ran', async () => {
    const s = await setup()
    const { seams } = await s.pageOpen()
    const request = await s.at('one')
    const before = await s.dump()
    s.lock.writes = false
    await expect(bringSectionBack(seams, request)).rejects.toBeInstanceOf(NotBroughtBack)
    expect(await s.dump()).toEqual(before)
  })

  it('run again on the page that reopened writes nothing more, and says nothing came back', async () => {
    const s = await setup()
    const request = await s.at('one')
    const first = await s.pageOpen()
    await bringSectionBack(first.seams, request)
    const after = await s.dump()
    vi.setSystemTime(Date.now() + MIN)

    const again = await s.pageOpen()
    expect(await bringSectionBack(again.seams, request)).toBeNull()
    expect(await s.dump()).toEqual(after)
    // The page goes on as before: it still saves.
    again.page.markdown = 'one, then more'
    again.saving.touch()
    await vi.advanceTimersByTimeAsync(1100)
    expect(await s.stored()).toBe('one, then more')
  })

  it('stays the current text after a reload, and its replaced text is never thinned', async () => {
    const s = await setup()
    const { page, saving, seams } = await s.pageOpen()
    page.markdown = 'two, and typed just now'
    saving.touch()
    await bringSectionBack(seams, await s.at('one'))
    await saving.close()
    vi.setSystemTime(Date.now() + 400 * DAY)
    await thin(s.deps)
    // A reload: nothing but what is stored.
    expect(await s.stored()).toBe('one')
    expect((await s.versions()).find((v) => v.beforeBringBack)?.content).toBe('two, and typed just now')
    const reopened = await s.pageOpen()
    expect(reopened.page.markdown).toBe('one')
  })

  it('ends the section’s undo for the session', async () => {
    const s = await setup()
    const { seams } = await s.pageOpen()
    const { EditorState } = await import('prosemirror-state')
    const { history } = await import('prosemirror-history')
    const { toDoc } = await import('../../page/schema')
    const { parse } = await import('../../domain/markdown')
    keepUndo(s.sectionId, EditorState.create({ doc: toDoc(parse('one')), plugins: [history()] }))
    await bringSectionBack(seams, await s.at('one'))
    expect(takeUndo(s.sectionId, 'one')).toBeUndefined()
  })
})

describe('words held in the unsaved journal, and what came back', () => {
  const held = (piece: Piece, sectionId: string, markdown: string) => ({
    piece,
    pieceId: piece.id,
    sectionId,
    name: 'salt.md',
    markdown,
    title: null,
  })
  const lock = { hold: async () => ({ release() {} }) } as unknown as WriterLock

  it('an older entry never starts the page or replays over the text that came back, though the clock jumped back', async () => {
    const s = await setup()
    // Kept a moment ago, by the real clock, and since overtaken by what is stored.
    unsaved.keep(held(s.piece, s.sectionId, 'two, and words a failed save kept'), Date.now())
    vi.setSystemTime(Date.now() + MIN)
    await write(s.deps, s.piece, s.sectionId, 'two, and more')
    const { seams } = await s.pageOpen()
    const request = await s.at('one')
    // The clock went back, behind the entry and the stored copy.
    vi.setSystemTime(START - 10 * DAY)

    const done = await bringSectionBack(seams, request)

    expect(done?.content).toBe('one')
    const entry = unsaved.get(s.sectionId)!
    expect(entry.at).toBeGreaterThan(START - 10 * DAY)
    expect(keptFor({ piece: done!.piece, sectionId: s.sectionId, content: 'one', updatedAt: done!.updatedAt, readAt: 1 })).toBeUndefined()
    await replayJournal(s.deps, lock)
    expect(await s.stored()).toBe('one')
  })

  it('newer words that were not stored stop it, and stay for the page to open with', async () => {
    const s = await setup()
    const { page, seams } = await s.pageOpen()
    page.markdown = 'two'
    // A save that failed an instant ago left these words, which no moment holds.
    vi.setSystemTime(Date.now() + MIN)
    unsaved.keep(held(s.piece, s.sectionId, 'two, and words a failed save kept'))
    const before = await s.dump()

    await expect(bringSectionBack(seams, await s.at('one'))).rejects.toBeInstanceOf(NotBroughtBack)

    expect(await s.dump()).toEqual(before)
    expect(unsaved.get(s.sectionId)?.markdown).toBe('two, and words a failed save kept')
  })
})
