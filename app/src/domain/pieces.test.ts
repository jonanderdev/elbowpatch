import { describe, expect, it } from 'vitest'
import { memoryStore } from '../adapters/memory-store'
import {
  bookPages,
  history,
  library,
  newPiece,
  openPiece,
  putAway,
  recover,
  rename,
  restore,
  savePages,
  setSubtitle,
  takeMoment,
  totalWords,
  withDay,
  write,
} from './pieces'

function setup(start = 1_000_000) {
  let t = start
  let n = 0
  const clock = { now: () => t, set: (v: number) => (t = v) }
  const ids = { next: () => `id${++n}` }
  const store = memoryStore()
  return { store, clock, ids, deps: { store, clock, ids } }
}

describe('pieces', () => {
  it("keeps each chapter's pages per screen, without dating the piece; a book counts only when every chapter has", async () => {
    const { deps, clock } = setup()
    const piece = newPiece(deps, 'book', 'en')
    const one = piece.sections[0]!.sectionId
    await write(deps, piece, one, 'Chapter one.')
    clock.set(2_000_000)
    await savePages(deps, piece.id, 'desktop', one, 12)
    await savePages(deps, piece.id, 'desktop', one, 12)
    let stored = (await openPiece(deps, piece.id))!.piece
    expect(stored.updatedAt).toBe(1_000_000)
    expect(bookPages(stored, 'desktop')).toBe(12)
    expect(bookPages(stored, 'phone')).toBeUndefined()
    const withTwo = { ...stored, sections: [...stored.sections, { sectionId: 'two', title: '' }] }
    expect(bookPages(withTwo, 'desktop')).toBeUndefined()
    await savePages(deps, piece.id, 'phone', one, 19)
    stored = (await openPiece(deps, piece.id))!.piece
    expect(stored.pages).toEqual({ desktop: { [one]: 12 }, phone: { [one]: 19 } })
  })

  it('does not keep a new piece until something is written', async () => {
    const { deps } = setup()
    newPiece(deps, 'essay', 'en')
    expect(await library(deps)).toEqual([])
  })

  it('keeps what was written, and reopens it', async () => {
    const { deps } = setup()
    const piece = newPiece(deps, 'essay', 'en')
    const section = piece.sections[0]!.sectionId
    await write(deps, piece, section, 'First line.')
    await rename(deps, piece, 'A title')
    const open = await openPiece(deps, piece.id)
    expect(open?.piece.title).toBe('A title')
    expect(open?.sections[0]?.content).toBe('First line.')
    expect((await library(deps)).map((p) => p.id)).toEqual([piece.id])
  })

  it('a moment writes a version once; a second moment with no change writes nothing', async () => {
    const { deps, store } = setup()
    const piece = newPiece(deps, 'essay', 'en')
    const section = piece.sections[0]!.sectionId
    await write(deps, piece, section, 'One.')
    expect(await takeMoment(deps, piece.id)).toBe(2) // the section, and the first outline
    expect(await takeMoment(deps, piece.id)).toBe(0)
    const versions = await store.transaction((tx) => tx.versionsOf(section))
    expect(versions.map((v) => v.content)).toEqual(['One.'])
  })

  it('orders versions by their parents, even when the clock goes backwards', async () => {
    const { deps, clock, store } = setup()
    const piece = newPiece(deps, 'essay', 'en')
    const section = piece.sections[0]!.sectionId
    for (const [i, text] of ['a', 'b', 'c'].entries()) {
      clock.set(5_000_000 - i * 1000) // each moment earlier on the wall clock
      await write(deps, piece, section, text)
      await takeMoment(deps, piece.id)
    }
    const versions = history(await store.transaction((tx) => tx.versionsOf(section)))
    expect(versions.map((v) => v.content)).toEqual(['a', 'b', 'c'])
    expect(versions[1]!.parentId).toBe(versions[0]!.id)
    // createdAt never earlier than what it follows
    expect(versions[1]!.createdAt).toBeGreaterThan(versions[0]!.createdAt)
    expect(versions[2]!.createdAt).toBeGreaterThan(versions[1]!.createdAt)
  })

  it('keep this moment writes a kept version even when nothing changed', async () => {
    const { deps, store } = setup()
    const piece = newPiece(deps, 'essay', 'en')
    const section = piece.sections[0]!.sectionId
    await write(deps, piece, section, 'Same.')
    await takeMoment(deps, piece.id)
    await takeMoment(deps, piece.id, { kept: true })
    const versions = history(await store.transaction((tx) => tx.versionsOf(section)))
    expect(versions.map((v) => [v.content, v.kept ?? false])).toEqual([
      ['Same.', false],
      ['Same.', true],
    ])
  })

  it('a renamed piece gets a new outline version at the next moment', async () => {
    const { deps, store } = setup()
    const piece = newPiece(deps, 'essay', 'en')
    await write(deps, piece, piece.sections[0]!.sectionId, 'x')
    await rename(deps, piece, 'First')
    await takeMoment(deps, piece.id)
    await rename(deps, piece, 'Second')
    expect(await takeMoment(deps, piece.id)).toBe(1)
    const stored = await store.transaction((tx) => tx.piece(piece.id))
    const outline = await store.transaction((tx) => tx.outline(stored!.outlineId!))
    expect(outline?.title).toBe('Second')
    expect(outline?.seq).toBe(2)
  })

  it('recovers text a crash left in working copies', async () => {
    const { deps, store } = setup()
    const piece = newPiece(deps, 'essay', 'en')
    const section = piece.sections[0]!.sectionId
    await write(deps, piece, section, 'Before the crash.')
    // the app closed before any moment
    expect(await recover(deps)).toBeGreaterThan(0)
    const versions = await store.transaction((tx) => tx.versionsOf(section))
    expect(versions.map((v) => v.content)).toEqual(['Before the crash.'])
  })

  it('a failed save changes nothing, and the same save can run again', async () => {
    const { deps, store } = setup()
    const piece = newPiece(deps, 'essay', 'en')
    const section = piece.sections[0]!.sectionId
    store.failNext(new Error('connection closed'))
    await expect(write(deps, piece, section, 'Kept.')).rejects.toThrow()
    expect(await library(deps)).toEqual([])
    await write(deps, piece, section, 'Kept.')
    await write(deps, piece, section, 'Kept.')
    expect((await openPiece(deps, piece.id))?.sections[0]?.content).toBe('Kept.')
  })

  it('a journal keeps a day only once it is written, in date order', async () => {
    const { deps } = setup()
    let journal = newPiece(deps, 'journal', 'en')
    const a = withDay(deps, journal, '2026-10-27')
    expect(withDay(deps, a.piece, '2026-10-27').sectionId).toBe(a.sectionId)
    await write(deps, a.piece, a.sectionId, 'Tuesday.')
    journal = (await openPiece(deps, journal.id))!.piece
    const b = withDay(deps, journal, '2026-10-26')
    expect(b.piece.sections.map((s) => s.title)).toEqual(['2026-10-26', '2026-10-27'])
    // Monday opened but left empty: not kept.
    expect((await openPiece(deps, journal.id))!.piece.sections.map((s) => s.title)).toEqual(['2026-10-27'])
    await write(deps, b.piece, b.sectionId, 'Monday.')
    const open = await openPiece(deps, journal.id)
    expect(open!.sections.map((s) => [s.title, s.content])).toEqual([
      ['2026-10-26', 'Monday.'],
      ['2026-10-27', 'Tuesday.'],
    ])
    expect(totalWords(open!.piece)).toBe(2)
  })

  it('puts a piece away whole, and brings it back as it was', async () => {
    const { deps, store } = setup()
    const piece = newPiece(deps, 'essay', 'en')
    const section = piece.sections[0]!.sectionId
    await write(deps, piece, section, 'Kept.')
    await takeMoment(deps, piece.id)
    await putAway(deps, piece.id)
    expect(await library(deps)).toEqual([])
    // Nothing is lost while it waits.
    expect((await openPiece(deps, piece.id))?.sections[0]?.content).toBe('Kept.')
    expect(await store.transaction((tx) => tx.versionsOf(section))).toHaveLength(1)
    await restore(deps, piece.id)
    expect((await library(deps)).map((p) => p.id)).toEqual([piece.id])
    expect((await openPiece(deps, piece.id))?.piece.putAwayAt).toBeUndefined()
  })

  it("a book's subtitle is kept in its outline, like the title", async () => {
    const { deps, store } = setup()
    const book = newPiece(deps, 'book', 'en')
    await write(deps, book, book.sections[0]!.sectionId, 'Text.')
    await setSubtitle(deps, book, 'a novel in four seasons')
    await takeMoment(deps, book.id)
    await setSubtitle(deps, book, 'a novel')
    expect(await takeMoment(deps, book.id)).toBe(1)
    const outlines = (await store.transaction((tx) => tx.outlinesOf(book.id))).sort((a, b) => a.seq - b.seq)
    expect(outlines.map((o) => o.subtitle)).toEqual(['a novel in four seasons', 'a novel'])
  })

  it('an empty section with no history gives no version', async () => {
    const { deps, store } = setup()
    const piece = newPiece(deps, 'essay', 'en')
    await rename(deps, piece, 'Only a title')
    await write(deps, piece, piece.sections[0]!.sectionId, '')
    await takeMoment(deps, piece.id)
    expect(await store.transaction((tx) => tx.versionsOf(piece.sections[0]!.sectionId))).toEqual([])
  })
})
