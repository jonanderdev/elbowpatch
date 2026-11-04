import { describe, expect, it } from 'vitest'
import { memoryStore } from '../adapters/memory-store'
import type { Piece } from './model'
import {
  bookPages,
  contents,
  history,
  library,
  newPiece,
  openPiece,
  putAway,
  recover,
  rename,
  renameSection,
  restore,
  savePages,
  savePlace,
  setSubtitle,
  takeMoment,
  totalWords,
  withChapter,
  withDay,
  withDraft,
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

describe('a chapter added to a draft', () => {
  /** A stored book of two chapters, with words, a place and page counts. */
  async function storedBook() {
    const s = setup()
    const piece = newPiece(s, 'book', 'en')
    const first = piece.sections[0]!.sectionId
    await write(s.deps, piece, first, 'The ferry at seven.')
    await renameSection(s.deps, piece, first, 'One')
    const { piece: draft, sectionId: second } = withChapter(s, piece)
    await write(s.deps, draft, second, 'Salt on the windows.')
    await renameSection(s.deps, draft, second, 'Two')
    await savePages(s.deps, piece.id, 'phone', first, 3)
    await savePages(s.deps, piece.id, 'phone', second, 4)
    await savePlace(s.deps, piece.id, { sectionId: second, paragraph: 0, offset: 4, snippet: 'Salt', page: 1, caret: true, at: 1 })
    await takeMoment(s.deps, piece.id)
    const stored = (await openPiece(s.deps, piece.id))!.piece
    return { ...s, stored, first, second }
  }
  const sectionsOf = async (s: Awaited<ReturnType<typeof storedBook>>) => (await openPiece(s.deps, s.stored.id))!.piece.sections.map((c) => c.sectionId)

  it('joins the end of the draft by default, and is not stored by that', async () => {
    const s = await storedBook()
    const { piece: draft, sectionId } = withChapter(s, s.stored)
    expect(draft.sections.map((c) => c.sectionId)).toEqual([s.first, s.second, sectionId])
    expect(draft.sections.at(-1)!.title).toBe('')
    expect(await sectionsOf(s)).toEqual([s.first, s.second])
  })

  it('is stored by its first words, where the draft has it', async () => {
    const s = await storedBook()
    const { piece: draft, sectionId } = withChapter(s, s.stored, s.first)
    await write(s.deps, draft, sectionId, 'In between.')
    expect(await sectionsOf(s)).toEqual([s.first, sectionId, s.second])
    const open = (await openPiece(s.deps, s.stored.id))!
    expect(open.sections.map((c) => c.content)).toEqual(['The ferry at seven.', 'In between.', 'Salt on the windows.'])
  })

  it('is stored by its first title, where the draft has it, and a moment keeps it in the outline', async () => {
    const s = await storedBook()
    const { piece: draft, sectionId } = withChapter(s, s.stored, s.first)
    await write(s.deps, draft, sectionId, '')
    await renameSection(s.deps, draft, sectionId, 'Interlude')
    expect(await sectionsOf(s)).toEqual([s.first, sectionId, s.second])

    expect(await takeMoment(s.deps, s.stored.id)).toBe(1)
    const open = (await openPiece(s.deps, s.stored.id))!
    const outline = await s.store.transaction((tx) => tx.outline(open.piece.outlineId!))
    expect(outline!.sections.map((c) => c.title)).toEqual(['One', 'Interlude', 'Two'])
    expect(open.sections[1]).toMatchObject({ title: 'Interlude', content: '' })
  })

  it('left empty leaves nothing behind: no section, count, place, working copy or moment', async () => {
    const s = await storedBook()
    const before = await s.store.transaction((tx) => tx.piece(s.stored.id))
    const { piece: draft, sectionId } = withChapter(s, s.stored)
    s.clock.set(2_000_000)

    // What a page does on the way out, with nothing written in it.
    await write(s.deps, draft, sectionId, '')
    await savePages(s.deps, s.stored.id, 'phone', sectionId, 1)
    await savePlace(s.deps, s.stored.id, { sectionId, paragraph: 0, offset: 0, snippet: '', page: 0, caret: true, at: 2 })
    expect(await takeMoment(s.deps, s.stored.id)).toBe(0)

    expect(await s.store.transaction((tx) => tx.piece(s.stored.id))).toEqual(before)
    expect(await s.store.transaction((tx) => tx.working(sectionId))).toBeUndefined()
  })

  it('keeps the words and the outline of the rest of the book through all of that', async () => {
    const s = await storedBook()
    const { piece: draft, sectionId } = withChapter(s, s.stored)
    await write(s.deps, draft, sectionId, '')
    await recover(s.deps)
    const open = (await openPiece(s.deps, s.stored.id))!
    expect(open.sections.map((c) => c.content)).toEqual(['The ferry at seven.', 'Salt on the windows.'])
    expect(totalWords(open.piece)).toBe(8)
  })

  it('leaves the book pages unknown until it has been laid out', async () => {
    const s = await storedBook()
    expect(bookPages(s.stored, 'phone')).toBe(7)
    const { piece: draft, sectionId } = withChapter(s, s.stored)
    await write(s.deps, draft, sectionId, 'Words.')
    const open = (await openPiece(s.deps, s.stored.id))!
    expect(bookPages(open.piece, 'phone')).toBeUndefined()
    await savePages(s.deps, s.stored.id, 'phone', sectionId, 1)
    expect(bookPages((await openPiece(s.deps, s.stored.id))!.piece, 'phone')).toBe(8)
  })

  it('stored twice stays once, in the same place', async () => {
    const s = await storedBook()
    const { piece: draft, sectionId } = withChapter(s, s.stored, s.first)
    await write(s.deps, draft, sectionId, 'Words.')
    await write(s.deps, draft, sectionId, 'Words.')
    await renameSection(s.deps, draft, sectionId, 'Title')
    await renameSection(s.deps, draft, sectionId, 'Title')
    expect(await sectionsOf(s)).toEqual([s.first, sectionId, s.second])
  })

  it('keeps its place among the stored chapters when a draft chapter before it was left empty', async () => {
    const s = await storedBook()
    const abandoned = withChapter(s, s.stored, s.first)
    const { piece: draft, sectionId } = withChapter(s, abandoned.piece, abandoned.sectionId)
    await write(s.deps, draft, sectionId, 'Words.')
    expect(await sectionsOf(s)).toEqual([s.first, sectionId, s.second])
  })

  it('joins at the end when the book gained a chapter since the draft was read', async () => {
    const s = await storedBook()
    const a = withChapter(s, s.stored)
    const b = withChapter(s, s.stored)
    await write(s.deps, a.piece, a.sectionId, 'First in.')
    await write(s.deps, b.piece, b.sectionId, 'Second in.')
    expect(await sectionsOf(s)).toEqual([s.first, s.second, a.sectionId, b.sectionId])
  })

  it('reads into what is stored at its draft position, for Contents, and adds nothing once stored', async () => {
    const s = await storedBook()
    const { piece: draft, sectionId } = withChapter(s, s.stored, s.first)
    expect(withDraft(s.stored, draft, sectionId).sections.map((c) => c.sectionId)).toEqual([s.first, sectionId, s.second])
    await write(s.deps, draft, sectionId, 'Words.')
    const stored = (await openPiece(s.deps, s.stored.id))!.piece
    expect(withDraft(stored, draft, sectionId).sections).toEqual(stored.sections)
  })

  it("keeps journal days in date order, whatever the draft's order", async () => {
    const s = setup()
    const journal = newPiece(s, 'journal', 'en')
    const later = withDay(s, journal, '2026-10-28')
    await write(s.deps, later.piece, later.sectionId, 'Later.')
    const early = withDay(s, later.piece, '2026-10-26')
    const out = { ...early.piece, sections: [...early.piece.sections].reverse() }
    await write(s.deps, out, early.sectionId, 'Earlier.')
    const open = (await openPiece(s.deps, journal.id))!
    expect(open.sections.map((d) => d.title)).toEqual(['2026-10-26', '2026-10-28'])
  })

  it('does not store an untouched journal day when the journal is renamed on it', async () => {
    const s = setup()
    const journal = newPiece(s, 'journal', 'en')
    const first = withDay(s, journal, '2026-10-26')
    await write(s.deps, first.piece, first.sectionId, 'Words.')
    const today = withDay(s, first.piece, '2026-10-27')
    await write(s.deps, today.piece, today.sectionId, '')
    expect((await openPiece(s.deps, journal.id))!.sections.map((d) => d.title)).toEqual(['2026-10-26'])
  })
})
