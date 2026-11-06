import { describe, expect, it } from 'vitest'
import { memoryStore } from '../adapters/memory-store'
import { listingOf, momentsOf, momentToOpen, readingAt, sectionBeyond, sectionsAt, shapeAt, textAt, textIndexOf, timeOf, wordsReader } from './lookBack'
import type { Piece } from './model'
import { newPiece, removeChapter, rename, renameSection, setSubtitle, takeMoment, withChapter, withDay, write } from './pieces'
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

/** A book of two chapters, a minute apart: the second does not exist at the first's moment. */
async function twoChapters(s: Setup): Promise<{ book: Piece; a: string; b: string; first: number; second: number }> {
  const book = newPiece(s.deps, 'book', 'en')
  const a = book.sections[0]!.sectionId
  s.clock.set(s.clock.now() + 60_000)
  await write(s.deps, book, a, 'chapter one')
  await renameSection(s.deps, book, a, 'One')
  await takeMoment(s.deps, book.id)
  const first = s.clock.now()
  s.clock.set(s.clock.now() + 60_000)
  const { piece, sectionId: b } = withChapter(s.deps, book)
  await write(s.deps, piece, b, 'chapter two')
  await renameSection(s.deps, piece, b, 'Two')
  await takeMoment(s.deps, book.id)
  return { book: piece, a, b, first, second: s.clock.now() }
}

const idsAt = async (s: Setup, pieceId: string, at: number): Promise<string[]> => sectionsAt((await listingOf(s.deps, pieceId))!, at).map((x) => x.sectionId)

describe('the sections a piece listed at a time', () => {
  it('are those of the outline then: a chapter added since is absent', async () => {
    const s = setup()
    const { book, a, b, first, second } = await twoChapters(s)
    expect(await idsAt(s, book.id, first)).toEqual([a])
    expect(await idsAt(s, book.id, second)).toEqual([a, b])
  })

  it('carry the titles of that moment', async () => {
    const s = setup()
    const { book, a, first } = await twoChapters(s)
    s.clock.set(s.clock.now() + 60_000)
    await renameSection(s.deps, book, a, 'One, renamed')
    await takeMoment(s.deps, book.id)
    const listing = (await listingOf(s.deps, book.id))!
    expect(sectionsAt(listing, first).map((x) => x.title)).toEqual(['One'])
    expect(sectionsAt(listing, s.clock.now()).map((x) => x.title)).toEqual(['One, renamed', 'Two'])
  })

  it('still list a chapter removed since', async () => {
    const s = setup()
    const { book, a, b, second } = await twoChapters(s)
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, book, b, '')
    await renameSection(s.deps, book, b, '')
    await removeChapter(s.deps, book.id, { sectionId: b, held: [] })
    // Opening the Time Machine takes a moment first.
    s.clock.set(s.clock.now() + 60_000)
    await takeMoment(s.deps, book.id)
    const listing = (await listingOf(s.deps, book.id))!
    expect(sectionsAt(listing, second).map((x) => x.sectionId)).toEqual([a, b])
    expect(sectionsAt(listing, s.clock.now()).map((x) => x.sectionId)).toEqual([a])
  })

  it('are a journal’s days in date order', async () => {
    const s = setup()
    let piece = newPiece(s.deps, 'journal', 'en')
    const days: string[] = []
    for (const iso of ['2026-10-26', '2026-10-24', '2026-10-25']) {
      s.clock.set(s.clock.now() + 60_000)
      const day = withDay(s.deps, piece, iso)
      piece = day.piece
      days.push(day.sectionId)
      await write(s.deps, piece, day.sectionId, `rain ${iso}`)
      await takeMoment(s.deps, piece.id)
    }
    expect(await idsAt(s, piece.id, s.clock.now())).toEqual([days[1], days[2], days[0]])
  })
})

describe('the time a moment stands at', () => {
  it('is its own, except the last, which stands at now: a chapter added after it is there', async () => {
    const s = setup()
    const { book, a, b, first } = await twoChapters(s)
    // Chapter one changes once more, after chapter two is there.
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, book, a, 'chapter one, longer')
    await takeMoment(s.deps, book.id)
    const moments = await momentsOf(s.deps, book.id, a)
    const listing = (await listingOf(s.deps, book.id))!
    expect(timeOf(moments, 0)).toBe(first)
    expect(sectionsAt(listing, timeOf(moments, 0)!).map((x) => x.sectionId)).toEqual([a])
    expect(sectionsAt(listing, timeOf(moments, 1)!).map((x) => x.sectionId)).toEqual([a, b])
  })

  it('is none off the ends', () => {
    expect(timeOf([], 0)).toBeUndefined()
    expect(timeOf([], -1)).toBeUndefined()
  })
})

describe('turning past a section', () => {
  const sections = [
    { sectionId: 'a', title: 'One' },
    { sectionId: 'b', title: 'Two' },
  ]

  it('reaches the one next to it, on or back', () => {
    expect(sectionBeyond(sections, 'a', 1)).toBe('b')
    expect(sectionBeyond(sections, 'b', -1)).toBe('a')
  })

  it('reaches nothing past the ends, or from a section not listed', () => {
    expect(sectionBeyond(sections, 'a', -1)).toBeUndefined()
    expect(sectionBeyond(sections, 'b', 1)).toBeUndefined()
    expect(sectionBeyond(sections, 'gone', 1)).toBeUndefined()
  })
})

describe('a section reached at a time', () => {
  it('reads as empty when it was listed but had no version yet', async () => {
    const s = setup()
    const book = newPiece(s.deps, 'book', 'en')
    const a = book.sections[0]!.sectionId
    await write(s.deps, book, a, 'chapter one')
    // Chapter two is listed and titled, and has no words yet.
    s.clock.set(s.clock.now() + 60_000)
    const { piece, sectionId: b } = withChapter(s.deps, book)
    await renameSection(s.deps, piece, b, 'Two')
    await takeMoment(s.deps, book.id)
    const listed = s.clock.now()
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, piece, b, 'chapter two')
    await takeMoment(s.deps, book.id)

    expect(sectionBeyond(sectionsAt((await listingOf(s.deps, book.id))!, listed), a, 1)).toBe(b)
    const then = (await momentsOf(s.deps, book.id, b)).findLast((m) => m.at <= listed)
    expect(then?.content).toBe('')
    expect(then?.title).toBe('Two')
  })
})

describe('the outline a piece had at a time', () => {
  it('carries the title and subtitle of that moment', async () => {
    const s = setup()
    const { book, first } = await twoChapters(s)
    s.clock.set(s.clock.now() + 60_000)
    await rename(s.deps, book, 'The harbour')
    await setSubtitle(s.deps, book, 'In winter')
    await takeMoment(s.deps, book.id)
    const listing = (await listingOf(s.deps, book.id))!
    expect(shapeAt(listing, first).title).toBe('')
    expect(shapeAt(listing, first).subtitle).toBeUndefined()
    expect(shapeAt(listing, s.clock.now())).toMatchObject({ title: 'The harbour', subtitle: 'In winter' })
  })

  it('marks a chapter removed since, and none that are still there', async () => {
    const s = setup()
    const { book, a, b, second } = await twoChapters(s)
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, book, b, '')
    await renameSection(s.deps, book, b, '')
    await removeChapter(s.deps, book.id, { sectionId: b, held: [] })
    s.clock.set(s.clock.now() + 60_000)
    await takeMoment(s.deps, book.id)
    const listing = (await listingOf(s.deps, book.id))!
    expect(shapeAt(listing, second).sections.map((x) => [x.sectionId, x.removed])).toEqual([
      [a, false],
      [b, true],
    ])
    expect(shapeAt(listing, s.clock.now()).sections.map((x) => x.removed)).toEqual([false])
  })
})

describe('a section read at a time', () => {
  const moments = [
    { at: 10, content: 'one', title: 'A', kept: false },
    { at: 20, content: 'two', title: 'B', kept: false },
  ]

  it('is the latest moment at or before it', () => {
    expect(readingAt(moments, 15, 'X')).toEqual({ index: 0, content: 'one', title: 'A' })
    expect(readingAt(moments, 20, 'X')).toEqual({ index: 1, content: 'two', title: 'B' })
    expect(readingAt(moments, Number.POSITIVE_INFINITY, 'X').content).toBe('two')
  })

  it('is empty, under the title it was listed with, before its first moment, standing on the first', () => {
    expect(readingAt(moments, 5, 'Listed')).toEqual({ index: 0, content: '', title: 'Listed' })
  })

  it('is nowhere with no moment at all', () => {
    expect(readingAt([], 5, 'Listed')).toEqual({ index: -1, content: '', title: 'Listed' })
    expect(readingAt(moments, undefined, 'Listed').index).toBe(-1)
  })
})

describe('a section’s text at a time, read alone', () => {
  it('is its version then, empty before the first, and the working copy now', async () => {
    const s = setup()
    const { book, a, b, first, second } = await twoChapters(s)
    expect(await textAt(s.deps, a, first)).toBe('chapter one')
    expect(await textAt(s.deps, b, first)).toBe('')
    expect(await textAt(s.deps, b, second)).toBe('chapter two')
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, book, b, 'chapter two, longer')
    expect(await textAt(s.deps, b, Number.POSITIVE_INFINITY)).toBe('chapter two, longer')
    expect(await textAt(s.deps, b, second)).toBe('chapter two')
  })

  it('agrees with the section’s moments', async () => {
    const s = setup()
    const { book, a, first, second } = await twoChapters(s)
    const moments = await momentsOf(s.deps, book.id, a)
    for (const at of [first, second, Number.POSITIVE_INFINITY]) expect(await textAt(s.deps, a, at)).toBe(readingAt(moments, at, '').content)
  })
})

describe('a section’s text named by what it rests on', () => {
  it('names the same text the same at any time it holds, and another text another', async () => {
    const s = setup()
    const { book, a, first, second } = await twoChapters(s)
    const index = await textIndexOf(s.deps, a)
    // Chapter one has not changed between the two moments.
    expect(index.keyAt(first)).toBe(index.keyAt(second))
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, book, a, 'chapter one, longer')
    await takeMoment(s.deps, book.id)
    const later = await textIndexOf(s.deps, a)
    expect(later.keyAt(first)).toBe(later.keyAt(second))
    expect(later.keyAt(Number.POSITIVE_INFINITY)).not.toBe(later.keyAt(first))
    // The text is the same from one moment to the next when it was not changed: a moment of another chapter's own.
    expect(later.keyAt(first)).toBe(index.keyAt(first))
  })

  it('reads what a key names, as textAt reads it, now and before the first version too', async () => {
    const s = setup()
    const { book, a, b, first, second } = await twoChapters(s)
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, book, b, 'chapter two, longer')
    for (const id of [a, b]) {
      const index = await textIndexOf(s.deps, id)
      for (const at of [first - 1, first, second, Number.POSITIVE_INFINITY]) expect(await index.read(index.keyAt(at))).toBe(await textAt(s.deps, id, at))
    }
  })

  it('names the same words again once they come back as the same text, apart from a text between, as another', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two', 'one'])
    const index = await textIndexOf(s.deps, sectionId)
    const [a, b, c] = (await momentsOf(s.deps, piece.id, sectionId)).map((m) => index.keyAt(m.at))
    expect(a).not.toBe(b)
    expect(c).not.toBe(b)
    expect(await index.read(a!)).toBe('one')
    expect(await index.read(c!)).toBe('one')
  })

  it('is empty with no history at all', async () => {
    const s = setup()
    const index = await textIndexOf(s.deps, 'nowhere')
    expect(await index.read(index.keyAt(5))).toBe('')
    expect(await index.read(index.keyAt(Number.POSITIVE_INFINITY))).toBe('')
  })

  it('names the working copy now when it has words no version holds', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one'])
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, piece, sectionId, 'one, and more')
    const index = await textIndexOf(s.deps, sectionId)
    expect(await index.read(index.keyAt(Number.POSITIVE_INFINITY))).toBe('one, and more')
    expect(index.keyAt(Number.POSITIVE_INFINITY)).not.toBe(index.keyAt(s.clock.now() - 1))
  })
})

describe('the words of several sections at a time', () => {
  it('are each one’s words then, none before its first version, and the working copy now', async () => {
    const s = setup()
    const { book, a, b, first, second } = await twoChapters(s)
    expect(await wordsReader(s.deps)([a, b], first)).toEqual({ [a]: 2, [b]: 0 })
    expect(await wordsReader(s.deps)([a, b], second)).toEqual({ [a]: 2, [b]: 2 })
    s.clock.set(s.clock.now() + 60_000)
    await write(s.deps, book, b, 'chapter two, longer')
    expect(await wordsReader(s.deps)([a, b], Number.POSITIVE_INFINITY)).toEqual({ [a]: 2, [b]: 3 })
    expect(await wordsReader(s.deps)([a, b], second)).toEqual({ [a]: 2, [b]: 2 })
  })

  it('are read once: a time at which a section held a text already counted reads nothing', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two words'])
    const [one, two] = (await momentsOf(s.deps, piece.id, sectionId)).map((m) => m.at)
    let reads = 0
    const transaction = ((work: never) => {
      reads++
      return s.store.transaction(work)
    }) as typeof s.store.transaction
    const store = { ...s.store, transaction }
    const read = wordsReader({ store })
    expect(await read([sectionId], one!)).toEqual({ [sectionId]: 1 })
    const first = reads
    expect(await read([sectionId], two!)).toEqual({ [sectionId]: 2 })
    expect(reads - first).toBe(1)
    // Both texts are known now.
    expect(await read([sectionId], one!)).toEqual({ [sectionId]: 1 })
    expect(await read([sectionId], two! + 1)).toEqual({ [sectionId]: 2 })
    expect(reads - first).toBe(1)
  })

  it('agree with each section’s text', async () => {
    const s = setup()
    const { a, b, second } = await twoChapters(s)
    for (const id of [a, b])
      expect((await wordsReader(s.deps)([a, b], second))[id]).toBe((await textAt(s.deps, id, second)).split(/\s+/).filter(Boolean).length)
  })
})
