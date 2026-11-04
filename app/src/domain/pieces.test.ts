import { describe, expect, it } from 'vitest'
import { memoryStore } from '../adapters/memory-store'
import type { Piece } from './model'
import {
  bookCount,
  bookPages,
  contents,
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

describe("a book's count", () => {
  const book: Piece = {
    id: 'p',
    kind: 'book',
    lang: 'en',
    createdAt: 0,
    updatedAt: 0,
    title: 'The harbour',
    sections: [
      { sectionId: 'a', title: 'One' },
      { sectionId: 'b', title: 'Two' },
      { sectionId: 'c', title: 'Three' },
    ],
    outlineId: null,
    words: { a: 100, b: 200, c: 300 },
    pages: { phone: { a: 8, b: 8, c: 9 } },
  }
  const open = (sectionId: string, pages: number, words: number) => ({ sectionId, title: '', pages, words })

  it("counts the title page as chapter 1's first page: chapter 1 opens on page 2", () => {
    expect(bookCount(book, 'phone', open('a', 8, 100), 0).page).toBe(1)
    expect(bookCount(book, 'phone', open('a', 8, 100), 1).page).toBe(2)
  })

  it("adds the chapters before it to the page in the chapter, and says the book's pages and words", () => {
    expect(bookCount(book, 'phone', open('c', 9, 300), 1)).toEqual({ page: 18, pages: 25, words: 600 })
  })

  it('takes the open chapter as it stands on the page, newer than what is stored', () => {
    expect(bookCount(book, 'phone', open('b', 10, 250), 9)).toEqual({ page: 18, pages: 27, words: 650 })
  })

  it('never guesses: past a chapter with no count there is no page and no total', () => {
    const unknown = { ...book, pages: { phone: { a: 8, c: 9 } } }
    expect(bookCount(unknown, 'phone', open('c', 9, 300), 1)).toEqual({ words: 600 })
  })

  it('still knows the page when only a later chapter has no count, but not the total', () => {
    const unknown = { ...book, pages: { phone: { a: 8, b: 8 } } }
    expect(bookCount(unknown, 'phone', open('b', 8, 200), 2)).toEqual({ page: 11, words: 600 })
  })

  it("keeps each screen's numbers apart", () => {
    expect(bookCount(book, 'desktop', open('b', 5, 200), 0)).toEqual({ words: 600 })
  })

  it('counts a chapter with no words yet as none', () => {
    const fresh = { ...book, words: { a: 100 } }
    expect(bookCount(fresh, 'phone', open('a', 8, 120), 0).words).toBe(120)
  })
})

describe('Contents', () => {
  const book = (pages?: Piece['pages']): Piece => ({
    id: 'book',
    kind: 'book',
    lang: 'en',
    createdAt: 0,
    updatedAt: 0,
    title: 'The harbour',
    sections: [
      { sectionId: 'a', title: 'The ferry at seven' },
      { sectionId: 'b', title: '' },
      { sectionId: 'c', title: 'Salt on the windows' },
    ],
    outlineId: null,
    ...(pages ? { pages } : {}),
  })

  it('starts each chapter after the pages before it, the title page being part of chapter 1', () => {
    const { chapters, pages } = contents(book({ phone: { a: 8, b: 8, c: 9 } }), 'phone')
    expect(chapters.map((c) => [c.title, c.startPage])).toEqual([
      ['The ferry at seven', 1],
      ['', 9],
      ['Salt on the windows', 17],
    ])
    expect(pages).toBe(25)
  })

  it('never guesses: past a chapter with no count there are no start pages, and no total', () => {
    const { chapters, pages } = contents(book({ phone: { a: 8, c: 9 } }), 'phone')
    expect(chapters.map((c) => c.startPage)).toEqual([1, 9, undefined])
    expect(pages).toBeUndefined()
  })

  it("reads this screen's counts, never the other screen's", () => {
    const { chapters, pages } = contents(book({ desktop: { a: 3, b: 3, c: 3 } }), 'phone')
    expect(chapters.map((c) => c.startPage)).toEqual([1, undefined, undefined])
    expect(pages).toBeUndefined()
  })

  it('takes the open chapter as it stands on the page: its title as typed, its pages as laid out', () => {
    const open = { sectionId: 'b', title: 'A room above', pages: 2 }
    const { chapters, pages } = contents(book({ phone: { a: 8, b: 8, c: 9 } }), 'phone', open)
    expect(chapters.map((c) => [c.title, c.startPage])).toEqual([
      ['The ferry at seven', 1],
      ['A room above', 9],
      ['Salt on the windows', 11],
    ])
    expect(pages).toBe(19)
  })
})

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
