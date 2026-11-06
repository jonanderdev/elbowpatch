import { describe, expect, it } from 'vitest'
import { memoryStore } from '../adapters/memory-store'
import { keepCopy } from './copies'
import { momentsOf } from './lookBack'
import type { Piece } from './model'
import { newPiece, putAway, rename, takeMoment, withChapter, withDay, write } from './pieces'

const DAY = 86_400_000

function setup(start = 1_000_000) {
  let t = start
  let n = 0
  const clock = { now: () => t, set: (v: number) => (t = v) }
  const ids = { next: () => `id${++n}` }
  const store = memoryStore()
  return { store, clock, ids, deps: { store, clock, ids } }
}

type Setup = ReturnType<typeof setup>

/** An essay named `title`, with a moment for each text, a minute apart. */
async function essay(s: Setup, title: string, texts: string[]): Promise<{ piece: Piece; sectionId: string }> {
  const piece = { ...newPiece(s.deps, 'essay', 'pt'), title }
  const sectionId = piece.sections[0]!.sectionId
  for (const text of texts) {
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, piece, sectionId, text)
    await rename(s.deps, piece, title)
    await takeMoment(s.deps, piece.id)
  }
  return { piece, sectionId }
}

/** Everything in the store about one piece, as it stands. */
function everythingOf(s: Setup, pieceId: string, sectionIds: string[]) {
  return s.store.transaction(async (tx) => ({
    piece: await tx.piece(pieceId),
    outlines: await tx.outlinesOf(pieceId),
    versions: (await Promise.all(sectionIds.map((id) => tx.versionsOf(id)))).flat(),
    working: await Promise.all(sectionIds.map((id) => tx.working(id))),
  }))
}

/** The copy of the oldest moment of a section. */
async function copyOfFirst(s: Setup, piece: Piece, sectionId: string): Promise<Piece> {
  const [first] = await momentsOf(s.deps, piece.id, sectionId)
  return keepCopy(s.deps, piece.id, first!)
}

describe('keeping a copy', () => {
  it('makes a new essay with the text of that moment, not of now', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, 'Salt', ['The first words.', 'The second words.'])
    const copy = await copyOfFirst(s, piece, sectionId)
    expect(copy.kind).toBe('essay')
    expect(copy.id).not.toBe(piece.id)
    const sectionOfCopy = copy.sections[0]!.sectionId
    expect((await momentsOf(s.deps, copy.id, sectionOfCopy)).map((m) => m.content)).toEqual(['The first words.'])
    expect((await s.store.transaction((tx) => tx.working(sectionOfCopy)))?.content).toBe('The first words.')
  })

  it('names an essay from its title at that moment, even if it was renamed since', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, 'Salt on the windows', ['One.'])
    await rename(s.deps, piece, 'Something else')
    s.clock.set(s.clock.now() + 60_000)
    await takeMoment(s.deps, piece.id)
    const moments = await momentsOf(s.deps, piece.id, sectionId)
    const copy = await keepCopy(s.deps, piece.id, moments[0]!)
    expect(copy.title).toBe('Salt on the windows, draft 2')
    expect(copy.sections[0]!.title).toBe('')
  })

  it('names a copy of a chapter from the chapter, and of a day from its date', async () => {
    const s = setup()
    let book = newPiece(s.deps, 'book', 'en')
    const first = book.sections[0]!.sectionId
    book = { ...book, title: 'The harbour', sections: [{ sectionId: first, title: 'Arrivals' }] }
    await write(s.deps, book, first, 'Ships.')
    await rename(s.deps, book, 'The harbour')
    await takeMoment(s.deps, book.id)
    const [chapter] = await momentsOf(s.deps, book.id, first)
    expect((await keepCopy(s.deps, book.id, chapter!)).title).toBe('Arrivals, draft 2')

    const journal = newPiece(s.deps, 'journal', 'en')
    const { piece: withToday, sectionId: today } = withDay(s.deps, journal, '2026-10-26')
    await write(s.deps, withToday, today, 'Rain.')
    await takeMoment(s.deps, journal.id)
    const [day] = await momentsOf(s.deps, journal.id, today)
    expect((await keepCopy(s.deps, journal.id, day!)).title).toBe('Monday 26 October, draft 2')
  })

  it('calls an untitled section "Untitled"', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, '', ['Words.'])
    expect((await copyOfFirst(s, piece, sectionId)).title).toBe('Untitled, draft 2')
  })

  it('numbers past every name in use, put-away pieces included', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, 'Salt', ['One.'])
    const second = await copyOfFirst(s, piece, sectionId)
    expect(second.title).toBe('Salt, draft 2')
    await putAway(s.deps, second.id)
    expect((await copyOfFirst(s, piece, sectionId)).title).toBe('Salt, draft 3')
    await essay(s, 'Salt, draft 4', ['Other.'])
    expect((await copyOfFirst(s, piece, sectionId)).title).toBe('Salt, draft 5')
  })

  it('reads a title with regular-expression characters as plain words', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, 'Why (not)? [x]', ['One.'])
    expect((await copyOfFirst(s, piece, sectionId)).title).toBe('Why (not)? [x], draft 2')
    expect((await copyOfFirst(s, piece, sectionId)).title).toBe('Why (not)? [x], draft 3')
  })

  it('keeps the source language', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, 'Sal', ['Um.'])
    expect((await copyOfFirst(s, piece, sectionId)).lang).toBe('pt')
  })

  it('starts its history now, with today’s date, and has nothing for launch to recover', async () => {
    const s = setup(10 * DAY)
    const { piece, sectionId } = await essay(s, 'Salt', ['One.'])
    s.clock.set(40 * DAY)
    const copy = await copyOfFirst(s, piece, sectionId)
    const sectionOfCopy = copy.sections[0]!.sectionId
    const [only, ...rest] = await momentsOf(s.deps, copy.id, sectionOfCopy)
    expect(rest).toEqual([])
    expect(only!.at).toBe(40 * DAY)
    expect(copy.createdAt).toBe(40 * DAY)
    expect(await takeMoment(s.deps, copy.id)).toBe(0)
    expect(copy.words).toEqual({ [sectionOfCopy]: 1 })
    expect(copy.copyOf).toBeUndefined()
    const stored = await s.store.transaction((tx) => tx.piece(copy.id))
    expect(stored).toEqual(copy)
  })

  it('leaves the source as it was', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, 'Salt', ['One.', 'Two.'])
    const before = await everythingOf(s, piece.id, [sectionId])
    s.clock.set(s.clock.now() + DAY)
    await copyOfFirst(s, piece, sectionId)
    expect(await everythingOf(s, piece.id, [sectionId])).toEqual(before)
  })

  it('copies one section of a book, even one that has left the book since', async () => {
    const s = setup()
    let book = newPiece(s.deps, 'book', 'en')
    const first = book.sections[0]!.sectionId
    book = { ...book, title: 'The harbour', sections: [{ sectionId: first, title: 'One' }] }
    await write(s.deps, book, first, 'First chapter.')
    ;({ piece: book } = withChapter(s.deps, book, first))
    const second = book.sections[1]!.sectionId
    book = { ...book, sections: book.sections.map((x) => (x.sectionId === second ? { ...x, title: 'Two' } : x)) }
    await write(s.deps, book, second, 'Second chapter.')
    await rename(s.deps, book, 'The harbour')
    await takeMoment(s.deps, book.id)
    const [moment] = await momentsOf(s.deps, book.id, second)
    await s.store.transaction(async (tx) => {
      const stored = (await tx.piece(book.id))!
      await tx.putPiece({ ...stored, sections: stored.sections.filter((x) => x.sectionId !== second) })
    })
    const copy = await keepCopy(s.deps, book.id, moment!)
    expect(copy.title).toBe('Two, draft 2')
    expect(copy.sections).toHaveLength(1)
    expect((await momentsOf(s.deps, copy.id, copy.sections[0]!.sectionId))[0]!.content).toBe('Second chapter.')
  })

  it('leaves nothing behind when it fails part-way', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, 'Salt', ['One.'])
    const [first] = await momentsOf(s.deps, piece.id, sectionId)
    const before = await s.store.transaction((tx) => tx.pieces())
    let calls = 0
    const ids = {
      next: (): string => {
        if (++calls === 4) throw new Error('disk full')
        return `x${calls}`
      },
    }
    await expect(keepCopy({ ...s.deps, ids }, piece.id, first!)).rejects.toThrow('disk full')
    expect(calls).toBe(4)
    expect(await s.store.transaction((tx) => tx.pieces())).toEqual(before)
  })

  it('refuses a piece that is gone, and writes nothing', async () => {
    const s = setup()
    await expect(keepCopy(s.deps, 'nothing', { content: 'x', title: 'y' })).rejects.toThrow()
    expect(await s.store.transaction((tx) => tx.pieces())).toEqual([])
  })
})
