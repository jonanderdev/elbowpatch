import { describe, expect, it } from 'vitest'
import { memoryStore } from '../adapters/memory-store'
import { momentsOf, momentToOpen } from './lookBack'
import type { Piece } from './model'
import { newPiece, removeChapter, rename, renameSection, takeMoment, withChapter, withDay, write } from './pieces'
import { thin } from './thinning'

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

/** An essay with a moment for each text, a minute apart. */
async function essay(s: Setup, texts: string[]): Promise<{ piece: Piece; sectionId: string }> {
  const piece = newPiece(s.deps, 'essay', 'en')
  const sectionId = piece.sections[0]!.sectionId
  for (const text of texts) {
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, piece, sectionId, text)
    await takeMoment(s.deps, piece.id)
  }
  return { piece, sectionId }
}

const texts = (moments: { content: string }[]): string[] => moments.map((m) => m.content)

describe("a section's moments", () => {
  it('are its versions, oldest first', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two', 'three'])
    expect(texts(await momentsOf(s.deps, piece.id, sectionId))).toEqual(['one', 'two', 'three'])
  })

  it('are none for a piece not stored', async () => {
    const s = setup()
    const piece = newPiece(s.deps, 'essay', 'en')
    expect(await momentsOf(s.deps, piece.id, piece.sections[0]!.sectionId)).toEqual([])
  })

  it('keep their order when the clock jumps back', async () => {
    const s = setup(10 * DAY)
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    s.clock.set(DAY)
    await write(s.deps, piece, sectionId, 'three')
    await takeMoment(s.deps, piece.id)
    s.clock.set(DAY + 60_000)
    await write(s.deps, piece, sectionId, 'four')
    await takeMoment(s.deps, piece.id)
    const moments = await momentsOf(s.deps, piece.id, sectionId)
    expect(texts(moments)).toEqual(['one', 'two', 'three', 'four'])
    expect(moments.map((m) => m.at)).toEqual([...moments.map((m) => m.at)].sort((a, b) => a - b))
  })

  it('fold repeated text into one tick, kept if any of them is', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one'])
    s.clock.set(s.clock.now() + 60_000)
    await takeMoment(s.deps, piece.id, { kept: true })
    await write(s.deps, piece, sectionId, 'two')
    await takeMoment(s.deps, piece.id)
    const moments = await momentsOf(s.deps, piece.id, sectionId)
    expect(texts(moments)).toEqual(['one', 'two'])
    expect(moments.map((m) => m.kept)).toEqual([true, false])
  })

  it('fold only what stands side by side: text that comes back is a moment of its own', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two', 'one'])
    expect(texts(await momentsOf(s.deps, piece.id, sectionId))).toEqual(['one', 'two', 'one'])
  })

  it('stand at the first moment of what they fold', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one'])
    const [first] = await momentsOf(s.deps, piece.id, sectionId)
    s.clock.set(s.clock.now() + 60_000)
    await takeMoment(s.deps, piece.id, { kept: true })
    expect((await momentsOf(s.deps, piece.id, sectionId))[0]!.at).toBe(first!.at)
  })

  it('include the moment an essay was renamed, with the title of each moment', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one'])
    s.clock.set(s.clock.now() + 60_000)
    await rename(s.deps, piece, 'A title')
    await takeMoment(s.deps, piece.id)
    const moments = await momentsOf(s.deps, piece.id, sectionId)
    expect(moments.map((m) => m.title)).toEqual(['', 'A title'])
    expect(texts(moments)).toEqual(['one', 'one'])
  })

  it('leave out what changed elsewhere in the book', async () => {
    const s = setup()
    const book = newPiece(s.deps, 'book', 'en')
    const a = book.sections[0]!.sectionId
    await write(s.deps, book, a, 'chapter one')
    await takeMoment(s.deps, book.id)
    const { piece, sectionId: b } = withChapter(s.deps, book)
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, piece, b, 'chapter two')
    await takeMoment(s.deps, book.id)
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, piece, b, 'chapter two, longer')
    await renameSection(s.deps, piece, b, 'Two')
    await takeMoment(s.deps, book.id)
    expect(texts(await momentsOf(s.deps, book.id, a))).toEqual(['chapter one'])
    const second = await momentsOf(s.deps, book.id, b)
    expect(texts(second)).toEqual(['chapter two', 'chapter two, longer'])
    expect(second.map((m) => m.title)).toEqual(['', 'Two'])
  })

  it('reach a chapter removed from the book, under the title it had', async () => {
    const s = setup()
    const book = newPiece(s.deps, 'book', 'en')
    const a = book.sections[0]!.sectionId
    await write(s.deps, book, a, 'chapter one')
    const { piece, sectionId: b } = withChapter(s.deps, book)
    await write(s.deps, piece, b, 'chapter two')
    await renameSection(s.deps, piece, b, 'Two')
    await takeMoment(s.deps, book.id)
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, piece, b, '')
    await renameSection(s.deps, piece, b, '')
    await removeChapter(s.deps, book.id, { sectionId: b, held: [] })
    const moments = await momentsOf(s.deps, book.id, b)
    expect(texts(moments)).toEqual(['chapter two', ''])
    expect(moments[0]!.title).toBe('Two')
  })

  it("title a journal's day by its date", async () => {
    const s = setup()
    const journal = newPiece(s.deps, 'journal', 'en')
    const { piece, sectionId } = withDay(s.deps, journal, '2026-10-26')
    await write(s.deps, piece, sectionId, 'rain')
    await takeMoment(s.deps, piece.id)
    expect((await momentsOf(s.deps, piece.id, sectionId))[0]!.title).toBe('Monday 26 October')
  })

  it('end on the working copy when it has words no moment holds', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, piece, sectionId, 'three, unsaved')
    const before = await s.store.transaction((tx) => tx.versionsOf(sectionId))
    const moments = await momentsOf(s.deps, piece.id, sectionId)
    expect(texts(moments)).toEqual(['one', 'two', 'three, unsaved'])
    expect(moments[2]!.at).toBeGreaterThan(moments[1]!.at)
    // Reading writes nothing: a window that does not write takes no moment.
    expect(await s.store.transaction((tx) => tx.versionsOf(sectionId))).toEqual(before)
  })

  it('end on the title as it stands when no moment holds it yet', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one'])
    s.clock.set(s.clock.now() + 60_000)
    await rename(s.deps, piece, 'Named since')
    const moments = await momentsOf(s.deps, piece.id, sectionId)
    expect(moments.map((m) => m.title)).toEqual(['', 'Named since'])
  })

  it('survive thinning with their order and their titles', async () => {
    const s = setup(Date.UTC(2026, 0, 1))
    const { piece, sectionId } = await essay(s, ['one', 'two', 'three', 'four'])
    s.clock.set(Date.UTC(2026, 9, 1))
    await write(s.deps, piece, sectionId, 'five')
    await takeMoment(s.deps, piece.id)
    await thin(s.deps)
    const moments = await momentsOf(s.deps, piece.id, sectionId)
    expect(texts(moments)[0]).toBe('one')
    expect(texts(moments).at(-1)).toBe('five')
    expect(moments.length).toBeLessThan(5)
  })
})

describe('the moment the Time Machine opens on', () => {
  it('is the most recent that differs from now', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two', 'three'])
    const moments = await momentsOf(s.deps, piece.id, sectionId)
    expect(momentToOpen(moments)?.content).toBe('two')
  })

  it('differs by its title too', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one'])
    s.clock.set(s.clock.now() + 60_000)
    await rename(s.deps, piece, 'Named since')
    await takeMoment(s.deps, piece.id)
    expect(momentToOpen(await momentsOf(s.deps, piece.id, sectionId))?.title).toBe('')
  })

  it('is none when nothing earlier differs', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one'])
    s.clock.set(s.clock.now() + 60_000)
    await takeMoment(s.deps, piece.id, { kept: true })
    expect(momentToOpen(await momentsOf(s.deps, piece.id, sectionId))).toBeUndefined()
    expect(momentToOpen([])).toBeUndefined()
  })
})
