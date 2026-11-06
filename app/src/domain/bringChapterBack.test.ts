import { describe, expect, it } from 'vitest'
import { memoryStore } from '../adapters/memory-store'
import { exportAll, importArchive } from './archive'
import { bringBack, listingOf, momentsOf, shapeAt } from './lookBack'
import type { Piece } from './model'
import { newPiece, openPiece, removeChapter, renameSection, savePages, takeMoment, withChapter, write } from './pieces'
import type { Store, Tx } from './ports'
import { thin } from './thinning'

const MIN = 60_000
const DAY = 86_400_000

function setup(start = 10 * DAY) {
  let t = start
  let n = 0
  const clock = { now: () => t, set: (v: number) => (t = v) }
  const ids = { next: () => `id${++n}` }
  const store = memoryStore()
  return { store, clock, ids, deps: { store, clock, ids } }
}
type Setup = ReturnType<typeof setup>

const yes = (): boolean => true
const tick = (s: Setup): void => s.clock.set(s.clock.now() + MIN)

/** Four chapters, each with a title and words, one moment so far. */
async function book(s: Setup): Promise<{ id: string; [k: string]: string }> {
  const first = newPiece(s.deps, 'book', 'en')
  const a = first.sections[0]!.sectionId
  await write(s.deps, first, a, 'a words')
  await renameSection(s.deps, first, a, 'One')
  const ids: Record<string, string> = { a }
  let after = a
  for (const [key, title, words] of [
    ['b', 'The ferry', 'b first words'],
    ['c', 'The quay', 'c words'],
    ['d', 'The lighthouse', 'd words'],
  ] as const) {
    const draft = withChapter(s.deps, (await openPiece(s.deps, first.id))!.piece, after)
    ids[key] = draft.sectionId
    await write(s.deps, draft.piece, draft.sectionId, words)
    await renameSection(s.deps, draft.piece, draft.sectionId, title)
    after = draft.sectionId
  }
  await takeMoment(s.deps, first.id)
  return { id: first.id, ...ids }
}

/** What the writer does before a chapter can go: empties its words and its title, a moment each, then removes it. */
async function remove(s: Setup, b: { id: string }, sectionId: string): Promise<void> {
  const piece = (await openPiece(s.deps, b.id))!.piece
  tick(s)
  await write(s.deps, piece, sectionId, '')
  await renameSection(s.deps, piece, sectionId, '')
  await takeMoment(s.deps, b.id)
  tick(s)
  expect(await removeChapter(s.deps, b.id, { sectionId, held: [] })).toBeDefined()
}

/** The moment the writer sees on the tape: the one holding these words. */
async function moment(s: Setup, pieceId: string, sectionId: string, content: string) {
  const found = (await momentsOf(s.deps, pieceId, sectionId)).find((m) => m.content === content)!
  return { sectionId, at: found.at, content: found.content, writes: yes }
}

async function dump(store: Store) {
  return store.transaction(async (tx) => {
    const out = []
    for (const p of (await tx.pieces()).sort((a, b) => a.id.localeCompare(b.id))) {
      const outlines = (await tx.outlinesOf(p.id)).sort((a, b) => a.seq - b.seq)
      const ids = new Set([...p.sections.map((x) => x.sectionId), ...outlines.flatMap((o) => o.sections.map((x) => x.sectionId))])
      const sections = []
      for (const id of [...ids].sort()) sections.push({ id, working: await tx.working(id), versions: (await tx.versionsOf(id)).sort((a, b) => a.seq - b.seq) })
      out.push({ piece: p, outlines, sections })
    }
    return out
  })
}

const stored = (s: Setup, id: string) => s.store.transaction(async (tx) => (await tx.piece(id))!)
const outlines = (s: Setup, id: string) => s.store.transaction(async (tx) => (await tx.outlinesOf(id)).sort((a, b) => a.seq - b.seq))
const versions = (s: Setup, sectionId: string) => s.store.transaction(async (tx) => (await tx.versionsOf(sectionId)).sort((a, b) => a.seq - b.seq))
const titles = (p: Piece) => p.sections.map((x) => x.title)

describe('bringing a chapter back', () => {
  it('brings only that chapter’s words back, and leaves its current title and the rest of the book', async () => {
    const s = setup()
    const b = await book(s)
    tick(s)
    await write(s.deps, (await openPiece(s.deps, b.id))!.piece, b.b!, 'b rewritten, much changed')
    await renameSection(s.deps, (await openPiece(s.deps, b.id))!.piece, b.b!, 'The ferry at seven')
    await takeMoment(s.deps, b.id)
    tick(s)
    const result = await bringBack(s.deps, b.id, await moment(s, b.id, b.b!, 'b first words'))
    expect(result).toMatchObject({ sectionId: b.b, content: 'b first words', changed: true })
    const opened = (await openPiece(s.deps, b.id))!
    expect(opened.sections.map((x) => [x.title, x.content])).toEqual([
      ['One', 'a words'],
      ['The ferry at seven', 'b first words'],
      ['The quay', 'c words'],
      ['The lighthouse', 'd words'],
    ])
  })

  describe('one removed since', () => {
    it('returns in its old place with its old title, after a marked moment, in a later outline', async () => {
      const s = setup()
      const b = await book(s)
      tick(s)
      await remove(s, b, b.b!)
      expect(titles((await stored(s, b.id)))).toEqual(['One', 'The quay', 'The lighthouse'])
      const before = await outlines(s, b.id)
      tick(s)
      const result = await bringBack(s.deps, b.id, await moment(s, b.id, b.b!, 'b first words'))
      expect(result.changed).toBe(true)
      expect(result.piece.sections.map((x) => [x.sectionId, x.title])).toEqual([
        [b.a, 'One'],
        [b.b, 'The ferry'],
        [b.c, 'The quay'],
        [b.d, 'The lighthouse'],
      ])
      expect((await openPiece(s.deps, b.id))!.sections.map((x) => x.content)).toEqual(['a words', 'b first words', 'c words', 'd words'])

      // The text it replaced stands marked, stamped earlier than the outline that has the chapter back.
      const marked = (await versions(s, b.b!)).filter((v) => v.beforeBringBack)
      expect(marked.map((v) => v.content)).toEqual([''])
      const after = await outlines(s, b.id)
      expect(after).toHaveLength(before.length + 1)
      const latest = after.at(-1)!
      expect(latest.sections.map((x) => x.title)).toEqual(['One', 'The ferry', 'The quay', 'The lighthouse'])
      expect(latest.createdAt).toBeGreaterThan(marked[0]!.createdAt)
      expect(latest.createdAt).toBeGreaterThan(before.at(-1)!.createdAt)
      // The outline in force at the marked moment is the one without it: the version just before is read as it stood.
      const stood = [...after].reverse().find((o) => o.createdAt <= marked[0]!.createdAt)!
      expect(stood.sections.map((x) => x.sectionId)).not.toContain(b.b)
      // And the new text is stamped later than that marked one, in the same moment as the outline.
      const last = (await versions(s, b.b!)).at(-1)!
      expect(last).toMatchObject({ content: 'b first words' })
      expect(last.createdAt).toBeGreaterThan(marked[0]!.createdAt)
    })

    it('returns after the chapter that came before it then, and at the start when it was the first', async () => {
      const s = setup()
      const b = await book(s)
      tick(s)
      await remove(s, b, b.a!)
      tick(s)
      await bringBack(s.deps, b.id, await moment(s, b.id, b.a!, 'a words'))
      expect((await stored(s, b.id)).sections.map((x) => x.sectionId)).toEqual([b.a, b.b, b.c, b.d])
    })

    it('returns at the end when the chapter before it is gone too', async () => {
      const s = setup()
      const b = await book(s)
      tick(s)
      await remove(s, b, b.c!)
      await remove(s, b, b.b!)
      expect((await stored(s, b.id)).sections.map((x) => x.sectionId)).toEqual([b.a, b.d])
      // Standing where the book stood before either went: c followed b, and b is gone.
      const listing = (await listingOf(s.deps, b.id))!
      const whole = (await outlines(s, b.id)).find((o) => o.sections.length === 4)!
      expect(shapeAt(listing, whole.createdAt).sections.map((x) => x.sectionId)).toEqual([b.a, b.b, b.c, b.d])
      tick(s)
      const result = await bringBack(s.deps, b.id, { ...(await moment(s, b.id, b.c!, 'c words')), listedAt: whole.createdAt })
      expect(result.piece.sections.map((x) => [x.sectionId, x.title])).toEqual([
        [b.a, 'One'],
        [b.d, 'The lighthouse'],
        [b.c, 'The quay'],
      ])
    })

    it('goes where Contents stood, not where an older moment had it', async () => {
      const s = setup()
      const b = await book(s)
      tick(s)
      await remove(s, b, b.c!)
      const standing = (await outlines(s, b.id)).find((o) => o.sections.length === 4)!
      tick(s)
      // The moment is old; Contents stood later, in a book without b.
      await remove(s, b, b.b!)
      const between = (await outlines(s, b.id)).find((o) => o.sections.length === 3 && !o.sections.some((x) => x.sectionId === b.c))!
      expect(between.sections.map((x) => x.sectionId)).toEqual([b.a, b.b, b.d])
      tick(s)
      const result = await bringBack(s.deps, b.id, { ...(await moment(s, b.id, b.c!, 'c words')), listedAt: standing.createdAt - 1 })
      // The book then: a, b, c, d: c came after b, which is gone: at the end.
      expect(result.piece.sections.map((x) => x.sectionId)).toEqual([b.a, b.d, b.c])
    })

    it('leaves the text alone when the chapter is brought back as it already stands, and still puts it in the book', async () => {
      const s = setup()
      const b = await book(s)
      tick(s)
      await remove(s, b, b.b!)
      tick(s)
      // Its last moment: empty, as it stands.
      const now = (await momentsOf(s.deps, b.id, b.b!)).at(-1)!
      const result = await bringBack(s.deps, b.id, { sectionId: b.b!, at: now.at, content: now.content, writes: yes })
      expect(result.changed).toBe(true)
      expect((await stored(s, b.id)).sections.map((x) => x.sectionId)).toEqual([b.a, b.b, b.c, b.d])
      expect((await versions(s, b.b!)).filter((v) => v.beforeBringBack)).toEqual([])
      const all = await outlines(s, b.id)
      expect(all.at(-1)!.createdAt).toBeGreaterThan((await versions(s, b.d!)).at(-1)!.createdAt)
    })

    it('writes nothing a second time', async () => {
      const s = setup()
      const b = await book(s)
      tick(s)
      await remove(s, b, b.b!)
      tick(s)
      const request = await moment(s, b.id, b.b!, 'b first words')
      await bringBack(s.deps, b.id, request)
      const after = await dump(s.store)
      tick(s)
      const again = await bringBack(s.deps, b.id, request)
      expect(again.changed).toBe(false)
      expect(await dump(s.store)).toEqual(after)
    })

    it('leaves everything untouched when the transaction fails at any write', async () => {
      const s = setup()
      const b = await book(s)
      tick(s)
      await remove(s, b, b.b!)
      tick(s)
      const request = await moment(s, b.id, b.b!, 'b first words')
      const before = await dump(s.store)
      for (const failing of ['putVersion', 'putPiece', 'putWorking', 'putOutline'] as const) {
        for (const nth of failing === 'putOutline' ? [1] : [1, 2]) {
          let calls = 0
          const store: Store = {
            transaction: (fn) =>
              s.store.transaction((tx) => {
                const wrapped: Tx = {
                  ...tx,
                  [failing]: async (x: never) => {
                    if (++calls === nth) throw new Error('disk full')
                    return (tx[failing] as (v: never) => Promise<void>)(x)
                  },
                }
                return fn(wrapped)
              }),
          }
          await expect(bringBack({ ...s.deps, store }, b.id, request)).rejects.toThrow('disk full')
          expect(await dump(s.store)).toEqual(before)
        }
      }
      expect((await bringBack(s.deps, b.id, request)).changed).toBe(true)
    })

    it('is refused, writing nothing, when the moment has gone, or this window no longer writes', async () => {
      const s = setup(100 * DAY)
      const b = await book(s)
      const old = s.clock.now()
      // Three moments of one old hour for chapter b, so thinning keeps the last of them.
      const piece = (await openPiece(s.deps, b.id))!.piece
      for (const [i, text] of ['b one', 'b two', 'b three'].entries()) {
        s.clock.set(old + i * MIN)
        await write(s.deps, piece, b.b!, text)
        await takeMoment(s.deps, b.id)
      }
      s.clock.set(old + 5 * MIN)
      await remove(s, b, b.b!)
      const seen = await moment(s, b.id, b.b!, 'b two')
      s.clock.set(400 * DAY)
      await thin(s.deps)
      const before = await dump(s.store)
      await expect(bringBack(s.deps, b.id, seen)).rejects.toMatchObject({ reason: 'gone' })
      await expect(bringBack(s.deps, b.id, { ...seen, writes: () => false })).rejects.toMatchObject({ reason: 'not-writing' })
      expect(await dump(s.store)).toEqual(before)
    })

    it('is refused for a section no outline of the book ever listed', async () => {
      const s = setup()
      const b = await book(s)
      await expect(bringBack(s.deps, b.id, { sectionId: 'nowhere', at: 0, content: 'x', writes: yes })).rejects.toMatchObject({ reason: 'left' })
    })

    it('makes the word counts follow and forgets the page counts of the chapters whose pages move', async () => {
      const s = setup()
      const b = await book(s)
      await savePages(s.deps, b.id, 'phone', b.a!, 3)
      await savePages(s.deps, b.id, 'phone', b.c!, 2)
      tick(s)
      await remove(s, b, b.a!)
      await savePages(s.deps, b.id, 'phone', b.b!, 4)
      tick(s)
      const result = await bringBack(s.deps, b.id, await moment(s, b.id, b.a!, 'a words'))
      expect(result.piece.words).toMatchObject({ [b.a!]: 2 })
      // a is first again, with the title page: its pages and b's, which had it, are laid out anew. c's stay.
      expect(result.piece.pages?.phone).toEqual({ [b.c!]: 2 })
      expect(result.piece.place).toMatchObject({ sectionId: b.a, paragraph: 0, offset: 0 })
      expect(result.piece.place?.page).toBeUndefined()
    })

    it('shows the chapter on the tape with its text back, and the book as it was before, as it was', async () => {
      const s = setup()
      const b = await book(s)
      tick(s)
      await remove(s, b, b.b!)
      // A moment kept while the chapter was away: it must read as the book was.
      tick(s)
      await takeMoment(s.deps, b.id, { kept: true })
      const kept = (await versions(s, b.c!)).find((v) => v.kept)!
      tick(s)
      await bringBack(s.deps, b.id, await moment(s, b.id, b.b!, 'b first words'))

      const tape = await momentsOf(s.deps, b.id, b.b!)
      expect(tape.map((m) => m.content)).toEqual(['b first words', '', 'b first words'])
      expect(tape.at(-1)).toMatchObject({ title: 'The ferry' })

      const listing = (await listingOf(s.deps, b.id))!
      const then = shapeAt(listing, kept.createdAt)
      expect(then.sections.map((x) => [x.title, x.removed])).toEqual([
        ['One', false],
        ['The quay', false],
        ['The lighthouse', false],
      ])
      // Now, the chapter is in the book and no longer "removed since".
      expect(shapeAt(listing, Number.POSITIVE_INFINITY).sections.map((x) => x.removed)).toEqual([false, false, false, false])
      // The kept moment is still kept, and still holds what it held.
      expect((await momentsOf(s.deps, b.id, b.c!)).find((m) => m.kept)).toMatchObject({ content: 'c words' })
    })

    it('keeps the marked moment and every outline the kept ones stood in, through thinning a year later', async () => {
      const s = setup()
      const b = await book(s)
      tick(s)
      await remove(s, b, b.b!)
      tick(s)
      await takeMoment(s.deps, b.id, { kept: true })
      const keptAt = (await versions(s, b.c!)).find((v) => v.kept)!.createdAt
      tick(s)
      await bringBack(s.deps, b.id, await moment(s, b.id, b.b!, 'b first words'))
      const marked = (await versions(s, b.b!)).find((v) => v.beforeBringBack)!
      s.clock.set(s.clock.now() + 400 * DAY)
      await thin(s.deps)
      expect((await versions(s, b.b!)).map((v) => v.id)).toContain(marked.id)
      const listing = (await listingOf(s.deps, b.id))!
      expect(shapeAt(listing, keptAt).sections.map((x) => x.title)).toEqual(['One', 'The quay', 'The lighthouse'])
      expect(shapeAt(listing, marked.createdAt).sections.map((x) => x.title)).toEqual(['One', 'The quay', 'The lighthouse'])
      expect(shapeAt(listing, Number.POSITIVE_INFINITY).sections.map((x) => x.title)).toEqual(['One', 'The ferry', 'The quay', 'The lighthouse'])
    })

    it('survives export and import, and what is read back is the book with the chapter in place', async () => {
      const s = setup()
      const b = await book(s)
      tick(s)
      await remove(s, b, b.b!)
      tick(s)
      await bringBack(s.deps, b.id, await moment(s, b.id, b.b!, 'b first words'))
      const files = await exportAll(s.deps)
      const t = setup()
      expect((await importArchive(t.deps, files)).ok).toBe(true)
      const imported = (await openPiece(t.deps, b.id))!
      expect(imported.sections.map((x) => [x.title, x.content])).toEqual([
        ['One', 'a words'],
        ['The ferry', 'b first words'],
        ['The quay', 'c words'],
        ['The lighthouse', 'd words'],
      ])
      expect((await versions(t, b.b!)).map((v) => [v.content, !!v.beforeBringBack])).toContainEqual(['', true])
      expect((await outlines(t, b.id)).map((o) => o.sections.length)).toEqual((await outlines(s, b.id)).map((o) => o.sections.length))
    })

    it('stamps its moments later than anything before it after the clock jumped back', async () => {
      const s = setup(10 * DAY)
      const b = await book(s)
      tick(s)
      await remove(s, b, b.b!)
      const latestStamp = Math.max(...(await outlines(s, b.id)).map((o) => o.createdAt))
      s.clock.set(DAY)
      await bringBack(s.deps, b.id, await moment(s, b.id, b.b!, 'b first words'))
      const all = await outlines(s, b.id)
      expect(all.at(-1)!.createdAt).toBeGreaterThan(latestStamp)
      const marked = (await versions(s, b.b!)).find((v) => v.beforeBringBack)!
      expect(all.at(-1)!.createdAt).toBeGreaterThan(marked.createdAt)
      expect(new Set(all.map((o) => o.createdAt)).size).toBe(all.length)
    })
  })
})
