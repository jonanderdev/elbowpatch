import { describe, expect, it } from 'vitest'
import { memoryStore } from '../adapters/memory-store'
import { exportAll } from './archive'
import type { Piece } from './model'
import { history, latest, newPiece, openPiece, outlineAt, putAway, removeChapter, renameSection, restore, takeMoment, withChapter, write } from './pieces'
import { forgetPutAway, type Thinnable, thin, toThin } from './thinning'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 9, 28, 12)

const v = (id: string, seq: number, createdAt: number, isProtected = false): Thinnable => ({ id, seq, createdAt, protected: isProtected })

describe('the thinning rule', () => {
  it('keeps everything from the last hour', () => {
    const items = Array.from({ length: 12 }, (_, i) => v(`v${i}`, i + 1, NOW - (12 - i) * 5 * MIN + MIN))
    expect(toThin(items, NOW).size).toBe(0)
  })

  it('keeps one an hour for a day, the last in each hour', () => {
    // Four versions in the same hour, three hours ago.
    const t = NOW - 3 * HOUR - (NOW % HOUR)
    const items = [v('first', 1, t - 10 * DAY), v('a', 2, t + 1 * MIN), v('b', 3, t + 20 * MIN), v('c', 4, t + 40 * MIN), v('latest', 5, NOW)]
    expect([...toThin(items, NOW)].sort()).toEqual(['a', 'b'])
  })

  it('never removes the first, the latest or a protected version', () => {
    const t = NOW - 40 * DAY
    const items = [
      v('first', 1, t),
      v('kept', 2, t + 1),
      v('plain', 3, t + 2),
      v('beforeBack', 4, t + 3, true),
      v('last-of-day', 5, t + 4),
      v('latest', 6, t + 5),
    ]
    items[1]!.protected = true
    const gone = toThin(items, NOW)
    expect(gone.has('first')).toBe(false)
    expect(gone.has('latest')).toBe(false)
    expect(gone.has('kept')).toBe(false)
    expect(gone.has('beforeBack')).toBe(false)
    expect(gone.has('plain')).toBe(true)
  })

  it('follows order, not the clock: the highest seq in a period stays', () => {
    const t = NOW - 5 * DAY
    // seq 3 has an earlier timestamp than seq 2 (a clock that jumped back).
    const items = [v('first', 1, t - DAY), v('two', 2, t + 10 * MIN), v('three', 3, t + 5 * MIN), v('latest', 4, NOW)]
    expect([...toThin(items, NOW)]).toEqual(['two'])
  })

  it('keeps moments from a clock that ran ahead', () => {
    const items = [v('first', 1, NOW - DAY), v('future', 2, NOW + 3 * DAY), v('latest', 3, NOW + 3 * DAY + 1)]
    expect(toThin(items, NOW).size).toBe(0)
  })

  it('a year of hourly moments thins to about the size 0005 promises', () => {
    const items: Thinnable[] = []
    for (let i = 0; i < 365 * 24; i++) items.push(v(`v${i}`, i + 1, NOW - (365 * 24 - i) * HOUR))
    const left = items.length - toThin(items, NOW).size
    // ~24 hourly + ~29 daily + ~48 weekly + first and latest.
    expect(left).toBeGreaterThan(80)
    expect(left).toBeLessThan(200)
  })
})

function setup() {
  let t = NOW - 400 * DAY
  let n = 0
  const clock = { now: () => t, set: (x: number) => (t = x) }
  const deps = { store: memoryStore(), clock, ids: { next: () => `id${++n}` } }
  return { deps, clock }
}

/** The chapter titles of the outline in force at a section's kept moment, as a Time Machine would ask. */
async function titlesAtKept(deps: ReturnType<typeof setup>['deps'], pieceId: string, sectionId: string): Promise<string[] | undefined> {
  const [outlines, versions] = await deps.store.transaction(async (tx) => [await tx.outlinesOf(pieceId), await tx.versionsOf(sectionId)] as const)
  const kept = versions.find((x) => x.kept)!
  return outlineAt(outlines, kept.createdAt)?.sections.map((s) => s.title)
}

/** More renames that same month, then one two months on: what would thin away the outline before them. */
async function renamesLater(deps: ReturnType<typeof setup>['deps'], clock: ReturnType<typeof setup>['clock'], book: Piece, chapter: string, from: number) {
  for (const [i, title] of ['The quay', 'The pier', 'The lighthouse'].entries()) {
    clock.set(from + i * HOUR)
    await renameSection(deps, book, chapter, title)
    await takeMoment(deps, book.id)
  }
  clock.set(from + 60 * DAY)
  await renameSection(deps, book, chapter, 'Home')
  await takeMoment(deps, book.id)
}

describe("thinning a kept moment's outline", () => {
  it('a chapter renamed at the kept moment keeps that title, after more renames and a year', async () => {
    const { deps, clock } = setup()
    const t = clock.now()
    const book = newPiece(deps, 'book', 'en')
    const chapter = book.sections[0]!.sectionId
    await write(deps, book, chapter, 'The boats came in.')
    await renameSection(deps, book, chapter, 'Untitled yet')
    await takeMoment(deps, book.id)

    clock.set(t + HOUR)
    await renameSection(deps, book, chapter, 'The harbour')
    await takeMoment(deps, book.id, { kept: true })

    await renamesLater(deps, clock, book, chapter, t + 2 * HOUR)
    clock.set(NOW)
    expect(await thin(deps)).toBeGreaterThan(0)
    expect(await titlesAtKept(deps, book.id, chapter)).toEqual(['The harbour'])
  })

  it('a moment kept when no outline changed keeps the outline from before it', async () => {
    const { deps, clock } = setup()
    const t = clock.now()
    const book = newPiece(deps, 'book', 'en')
    const chapter = book.sections[0]!.sectionId
    await write(deps, book, chapter, 'The boats came in.')
    await renameSection(deps, book, chapter, 'Untitled yet')
    await takeMoment(deps, book.id)

    clock.set(t + HOUR)
    await renameSection(deps, book, chapter, 'The harbour')
    await takeMoment(deps, book.id)
    clock.set(t + 2 * HOUR)
    expect(await takeMoment(deps, book.id, { kept: true })).toBe(1)

    await renamesLater(deps, clock, book, chapter, t + 3 * HOUR)
    clock.set(NOW)
    await thin(deps)
    expect(await titlesAtKept(deps, book.id, chapter)).toEqual(['The harbour'])
  })

  it.each([
    ['a clock that jumped back', -8 * HOUR],
    ['the very same millisecond', 0],
  ])('a rename after a kept moment is still after it, with %s', async (_, jump) => {
    const { deps, clock } = setup()
    const t = clock.now()
    const book = newPiece(deps, 'book', 'en')
    const chapter = book.sections[0]!.sectionId
    await write(deps, book, chapter, 'The boats came in.')
    await renameSection(deps, book, chapter, 'Untitled yet')
    await takeMoment(deps, book.id)

    clock.set(t + HOUR)
    await renameSection(deps, book, chapter, 'The harbour')
    await takeMoment(deps, book.id)
    clock.set(t + 10 * HOUR)
    await takeMoment(deps, book.id, { kept: true })

    clock.set(t + 10 * HOUR + jump)
    await renameSection(deps, book, chapter, 'The quay')
    await takeMoment(deps, book.id)
    await renamesLater(deps, clock, book, chapter, t + 11 * HOUR)
    clock.set(NOW)
    await thin(deps)
    expect(await titlesAtKept(deps, book.id, chapter)).toEqual(['The harbour'])
  })

  it('the outline in place just before a bring back stays, like the text it replaced', async () => {
    const { deps, clock } = setup()
    const t = clock.now()
    const book = newPiece(deps, 'book', 'en')
    const chapter = book.sections[0]!.sectionId
    await write(deps, book, chapter, 'The boats came in.')
    await renameSection(deps, book, chapter, 'Untitled yet')
    await takeMoment(deps, book.id)

    clock.set(t + HOUR)
    await renameSection(deps, book, chapter, 'The harbour')
    await takeMoment(deps, book.id)
    clock.set(t + 2 * HOUR)
    await write(deps, book, chapter, 'The boats went out.')
    await takeMoment(deps, book.id)
    // Nothing brings back yet: this stands for the moment one will take of the text it replaces.
    const before = await deps.store.transaction(async (tx) => {
      const v = latest(await tx.versionsOf(chapter))!
      await tx.putVersion({ ...v, beforeBringBack: true })
      return v
    })

    await renamesLater(deps, clock, book, chapter, t + 3 * HOUR)
    clock.set(NOW)
    await thin(deps)
    const outlines = await deps.store.transaction((tx) => tx.outlinesOf(book.id))
    expect(outlineAt(outlines, before.createdAt)?.sections.map((s) => s.title)).toEqual(['The harbour'])
  })
})

/** A book of two chapters, stored in a first moment: the second is the one that will go. */
async function twoChapters(deps: ReturnType<typeof setup>['deps']) {
  const first = newPiece(deps, 'book', 'en')
  const chapter = first.sections[0]!.sectionId
  const { piece: book, sectionId: second } = withChapter(deps, first, chapter)
  await write(deps, book, chapter, 'The boats came in.')
  await renameSection(deps, book, chapter, 'The harbour')
  await write(deps, book, second, 'Salt on the windows.')
  await renameSection(deps, book, second, 'Salt')
  await takeMoment(deps, book.id)
  return { book, chapter, second }
}

/** Empties a chapter by hand and takes it out, as the writer can (0005). */
async function emptyAndRemove(deps: ReturnType<typeof setup>['deps'], book: Piece, sectionId: string) {
  await renameSection(deps, book, sectionId, '')
  await write(deps, book, sectionId, '')
  await takeMoment(deps, book.id)
  expect(await removeChapter(deps, book.id, { sectionId, held: [] })).toBeDefined()
}

describe('thinning a book with a chapter removed', () => {
  it('a kept moment still has the chapter removed since, with its title and text', async () => {
    const { deps, clock } = setup()
    const t = clock.now()
    const { book, chapter, second } = await twoChapters(deps)
    clock.set(t + HOUR)
    await renameSection(deps, book, second, 'Salt on the glass')
    await takeMoment(deps, book.id, { kept: true })
    clock.set(t + 2 * HOUR)
    await emptyAndRemove(deps, book, second)

    await renamesLater(deps, clock, book, chapter, t + 3 * HOUR)
    clock.set(NOW)
    await thin(deps)
    expect(await titlesAtKept(deps, book.id, chapter)).toEqual(['The harbour', 'Salt on the glass'])
    const versions = await deps.store.transaction((tx) => tx.versionsOf(second))
    expect(versions.find((x) => x.kept)?.content).toBe('Salt on the windows.')
  })

  it('a removed chapter nobody kept stays in an earlier outline, so its history can still be reached', async () => {
    const { deps, clock } = setup()
    const t = clock.now()
    const first = newPiece(deps, 'book', 'en')
    const chapter = first.sections[0]!.sectionId
    await write(deps, first, chapter, 'The boats came in.')
    await takeMoment(deps, first.id)

    clock.set(t + HOUR)
    const { piece: book, sectionId: second } = withChapter(deps, first, chapter)
    await write(deps, book, second, 'Salt on the windows.')
    await takeMoment(deps, book.id)
    clock.set(t + 2 * HOUR)
    await emptyAndRemove(deps, book, second)

    await renamesLater(deps, clock, book, chapter, t + 3 * HOUR)
    clock.set(NOW)
    await thin(deps)
    const outlines = await deps.store.transaction((tx) => tx.outlinesOf(book.id))
    expect(outlines.some((o) => o.sections.some((s) => s.sectionId === second))).toBe(true)
    const index = (await exportAll(deps)).find((f) => f.path === 'index.json')!
    expect(JSON.parse(index.text).versions.some((x: { sectionId: string }) => x.sectionId === second)).toBe(true)
  })
})

describe('thinning the store', () => {
  it('thins a section written over a year, keeps the text, and is safe to run twice', async () => {
    const { deps, clock } = setup()
    const piece = newPiece(deps, 'essay', 'en')
    const section = piece.sections[0]!.sectionId
    for (let day = 0; day < 400; day += 1) {
      for (const h of [9, 13, 21]) {
        clock.set(NOW - (400 - day) * DAY + h * HOUR)
        await write(deps, piece, section, `Day ${day}, ${h}:00`)
        await takeMoment(deps, piece.id, { kept: day === 100 && h === 13 })
      }
    }
    clock.set(NOW)
    const before = await deps.store.transaction((tx) => tx.versionsOf(section))
    const removed = await thin(deps)
    expect(removed).toBeGreaterThan(900)
    expect(await thin(deps)).toBe(0)
    const after = history(await deps.store.transaction((tx) => tx.versionsOf(section)))
    expect(after.length).toBe(before.length - removed)
    expect(after.at(-1)!.content).toBe('Day 399, 21:00')
    expect(after[0]!.content).toBe('Day 0, 9:00')
    expect(after.some((x) => x.kept && x.content === 'Day 100, 13:00')).toBe(true)
    // The text now is untouched.
    expect((await openPiece(deps, piece.id))?.sections[0]?.content).toBe('Day 399, 21:00')
  })

  it('a put-away piece goes for good after 30 days, not before, and not if brought back', async () => {
    const { deps, clock } = setup()
    const a = newPiece(deps, 'essay', 'en')
    const b = newPiece(deps, 'essay', 'en')
    for (const p of [a, b]) {
      await write(deps, p, p.sections[0]!.sectionId, 'Words.')
      await takeMoment(deps, p.id)
      await putAway(deps, p.id)
    }
    clock.set(clock.now() + 29 * DAY)
    expect(await forgetPutAway(deps)).toBe(0)
    await restore(deps, b.id)
    clock.set(clock.now() + 2 * DAY)
    expect(await forgetPutAway(deps)).toBe(1)
    expect(await openPiece(deps, a.id)).toBeUndefined()
    expect(await deps.store.transaction((tx) => tx.versionsOf(a.sections[0]!.sectionId))).toEqual([])
    expect(await deps.store.transaction((tx) => tx.working(a.sections[0]!.sectionId))).toBeUndefined()
    expect((await openPiece(deps, b.id))?.sections[0]?.content).toBe('Words.')
  })
})
