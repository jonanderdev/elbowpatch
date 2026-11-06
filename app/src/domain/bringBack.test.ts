import { describe, expect, it } from 'vitest'
import { memoryStore } from '../adapters/memory-store'
import { exportAll, importArchive } from './archive'
import { BringBackRefused, bringBack, momentsOf } from './lookBack'
import type { Piece } from './model'
import { newPiece, openPiece, rename, renameSection, savePages, takeMoment, withChapter, write } from './pieces'
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

/** An essay with a moment for each text, a minute apart. */
async function essay(s: Setup, texts: string[]): Promise<{ piece: Piece; sectionId: string }> {
  const piece = newPiece(s.deps, 'essay', 'en')
  const sectionId = piece.sections[0]!.sectionId
  await rename(s.deps, piece, 'Salt')
  for (const text of texts) {
    s.clock.set(s.clock.now() + MIN)
    await write(s.deps, piece, sectionId, text)
    await takeMoment(s.deps, piece.id)
  }
  return { piece, sectionId }
}

/** The moment the writer sees: its time and words, as `momentsOf` gives them. */
async function moment(s: Setup, piece: Piece, sectionId: string, content: string) {
  const found = (await momentsOf(s.deps, piece.id, sectionId)).find((m) => m.content === content)!
  return { sectionId, at: found.at, content: found.content, writes: yes }
}

/** Everything stored, to compare two states. */
async function dump(store: Store) {
  return store.transaction(async (tx) => {
    const pieces = (await tx.pieces()).sort((a, b) => a.id.localeCompare(b.id))
    const out = []
    for (const p of pieces) {
      const ids = new Set([p.sections.map((x) => x.sectionId), (await tx.outlinesOf(p.id)).flatMap((o) => o.sections.map((x) => x.sectionId))].flat())
      const sections = []
      for (const id of [...ids].sort()) sections.push({ id, working: await tx.working(id), versions: (await tx.versionsOf(id)).sort((a, b) => a.seq - b.seq) })
      out.push({ piece: p, outlines: (await tx.outlinesOf(p.id)).sort((a, b) => a.seq - b.seq), sections })
    }
    return out
  })
}

const versionsOf = (s: Setup, sectionId: string) => s.store.transaction(async (tx) => (await tx.versionsOf(sectionId)).sort((a, b) => a.seq - b.seq))

describe('bringing a section back', () => {
  it('makes the old text current, with the text it replaced kept as a marked moment', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    s.clock.set(s.clock.now() + MIN)
    const result = await bringBack(s.deps, piece.id, await moment(s, piece, sectionId, 'one'))
    expect(result).toMatchObject({ sectionId, content: 'one', changed: true })
    expect((await openPiece(s.deps, piece.id))!.sections[0]!.content).toBe('one')
    const versions = await versionsOf(s, sectionId)
    expect(versions.map((v) => [v.content, !!v.beforeBringBack])).toEqual([
      ['one', false],
      ['two', false],
      ['two', true],
      ['one', false],
    ])
    expect(versions.map((v) => v.seq)).toEqual([1, 2, 3, 4])
  })

  it('keeps words typed just before, though no moment had taken them', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    s.clock.set(s.clock.now() + MIN)
    await write(s.deps, piece, sectionId, 'two and the last words')
    await bringBack(s.deps, piece.id, await moment(s, piece, sectionId, 'one'))
    const marked = (await versionsOf(s, sectionId)).filter((v) => v.beforeBringBack)
    expect(marked.map((v) => v.content)).toEqual(['two and the last words'])
    // The working copy is the old text, and points at the version holding it.
    const working = await s.store.transaction((tx) => tx.working(sectionId))
    expect(working?.content).toBe('one')
    expect((await versionsOf(s, sectionId)).at(-1)).toMatchObject({ id: working?.baseVersionId, content: 'one' })
  })

  it('marks the replaced text even when it matches the last version', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    await bringBack(s.deps, piece.id, await moment(s, piece, sectionId, 'one'))
    const versions = await versionsOf(s, sectionId)
    expect(versions.filter((v) => v.content === 'two').map((v) => !!v.beforeBringBack)).toEqual([false, true])
  })

  it('stamps the marked moment and the old text later than anything before, after the clock jumped back', async () => {
    const s = setup(10 * DAY)
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    s.clock.set(DAY)
    const result = await bringBack(s.deps, piece.id, await moment(s, piece, sectionId, 'one'))
    expect(result.changed).toBe(true)
    const versions = await versionsOf(s, sectionId)
    const stamps = versions.map((v) => v.createdAt)
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b))
    expect(new Set(stamps).size).toBe(stamps.length)
    // The outline in force at the marked moment is the one the piece had.
    const outlines = await s.store.transaction((tx) => tx.outlinesOf(piece.id))
    const marked = versions.find((v) => v.beforeBringBack)!
    const stands = [...outlines].sort((a, b) => b.seq - a.seq).find((o) => o.createdAt <= marked.createdAt)
    expect(stands?.title).toBe('Salt')
  })

  it('writes nothing a second time', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    const request = await moment(s, piece, sectionId, 'one')
    await bringBack(s.deps, piece.id, request)
    const after = await dump(s.store)
    s.clock.set(s.clock.now() + MIN)
    const again = await bringBack(s.deps, piece.id, request)
    expect(again.changed).toBe(false)
    expect(await dump(s.store)).toEqual(after)
  })

  it('writes nothing for the text that is already current', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    const before = await dump(s.store)
    const result = await bringBack(s.deps, piece.id, await moment(s, piece, sectionId, 'two'))
    expect(result.changed).toBe(false)
    expect(await dump(s.store)).toEqual(before)
  })

  it('leaves everything as it was when the transaction fails part way', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    await write(s.deps, piece, sectionId, 'two, and more')
    const request = await moment(s, piece, sectionId, 'one')
    const before = await dump(s.store)
    for (const failing of ['putVersion', 'putPiece', 'putWorking'] as const) {
      for (const nth of [1, 2]) {
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
        await expect(bringBack({ ...s.deps, store }, piece.id, request)).rejects.toThrow('disk full')
        expect(await dump(s.store)).toEqual(before)
      }
    }
    // And it still runs, once the disk is back.
    expect((await bringBack(s.deps, piece.id, request)).changed).toBe(true)
  })

  it('is refused, writing nothing, when this window no longer writes the piece', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    const before = await dump(s.store)
    const request = { ...(await moment(s, piece, sectionId, 'one')), writes: () => false }
    await expect(bringBack(s.deps, piece.id, request)).rejects.toMatchObject({ reason: 'not-writing' })
    expect(await dump(s.store)).toEqual(before)
  })

  it('asks whether this window writes inside the transaction, after what ran before it', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    let writes = true
    const request = { ...(await moment(s, piece, sectionId, 'one')), writes: () => writes }
    // Lost between asking for it and the transaction running.
    const pending = bringBack(s.deps, piece.id, request)
    writes = false
    await expect(pending).rejects.toBeInstanceOf(BringBackRefused)
  })

  it('is refused when the moment on screen has gone, thinned by another window', async () => {
    const s = setup(400 * DAY)
    const piece = newPiece(s.deps, 'essay', 'en')
    const sectionId = piece.sections[0]!.sectionId
    // Two moments a minute apart in one old hour: thinning keeps the last of them.
    const old = s.clock.now() - 300 * DAY
    s.clock.set(old)
    await write(s.deps, piece, sectionId, 'a')
    await takeMoment(s.deps, piece.id)
    s.clock.set(old + MIN)
    await write(s.deps, piece, sectionId, 'b')
    await takeMoment(s.deps, piece.id)
    s.clock.set(old + 2 * MIN)
    await write(s.deps, piece, sectionId, 'c')
    await takeMoment(s.deps, piece.id)
    s.clock.set(old + 3 * MIN)
    await write(s.deps, piece, sectionId, 'd')
    await takeMoment(s.deps, piece.id)
    const seen = await moment(s, piece, sectionId, 'b')
    s.clock.set(400 * DAY)
    await thin(s.deps)
    const before = await dump(s.store)
    await expect(bringBack(s.deps, piece.id, seen)).rejects.toMatchObject({ reason: 'gone' })
    expect(await dump(s.store)).toEqual(before)
  })

  it('is refused while words held outside the database are newer than what is stored', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    const request = await moment(s, piece, sectionId, 'one')
    const before = await dump(s.store)
    s.clock.set(s.clock.now() + MIN)
    await expect(bringBack(s.deps, piece.id, { ...request, kept: { at: s.clock.now(), content: 'two, and held words' } })).rejects.toMatchObject({
      reason: 'unstored',
    })
    expect(await dump(s.store)).toEqual(before)
    // Words already stored, or older than what is stored, do not stand in the way.
    const older = { at: 1, content: 'something else' }
    expect((await bringBack(s.deps, piece.id, { ...request, kept: older })).changed).toBe(true)
  })

  it('is refused for a section that is not in the piece', async () => {
    const s = setup()
    const { piece } = await essay(s, ['one', 'two'])
    await expect(bringBack(s.deps, piece.id, { sectionId: 'nowhere', at: 0, content: 'x', writes: yes })).rejects.toMatchObject({ reason: 'left' })
  })

  it('makes word counts follow, and drops the page counts of that section alone', async () => {
    const s = setup()
    const first = newPiece(s.deps, 'book', 'en')
    const one = first.sections[0]!.sectionId
    const { piece: book, sectionId: two } = withChapter(s.deps, first, one)
    await write(s.deps, book, one, 'Chapter one words here.')
    await write(s.deps, book, two, 'short')
    await renameSection(s.deps, book, one, 'One')
    await takeMoment(s.deps, book.id)
    s.clock.set(s.clock.now() + MIN)
    await write(s.deps, book, one, 'Chapter one has been rewritten with many more words than before.')
    await takeMoment(s.deps, book.id)
    await savePages(s.deps, book.id, 'phone', one, 4)
    await savePages(s.deps, book.id, 'phone', two, 1)
    const result = await bringBack(s.deps, book.id, await moment(s, book, one, 'Chapter one words here.'))
    expect(result.piece.words).toMatchObject({ [one]: 4, [two]: 1 })
    expect(result.piece.pages?.phone).toEqual({ [two]: 1 })
    // Only that chapter's text changes: its title stays, and so does the other chapter.
    const opened = await openPiece(s.deps, book.id)
    expect(opened!.sections.map((x) => [x.title, x.content])).toEqual([
      ['One', 'Chapter one words here.'],
      ['', 'short'],
    ])
  })

  it('shows the replaced text afterwards as an ordinary moment on the tape', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    await bringBack(s.deps, piece.id, await moment(s, piece, sectionId, 'one'))
    const moments = await momentsOf(s.deps, piece.id, sectionId)
    expect(moments.map((m) => [m.content, m.kept])).toEqual([
      ['one', false],
      ['two', false],
      ['one', false],
    ])
  })

  it('keeps the replaced text, and the outline in force then, through thinning a year later', async () => {
    const s = setup(10 * DAY)
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    s.clock.set(s.clock.now() + MIN)
    await bringBack(s.deps, piece.id, await moment(s, piece, sectionId, 'one'))
    s.clock.set(s.clock.now() + 3 * MIN)
    await renameOften(s, piece)
    const marked = (await versionsOf(s, sectionId)).find((v) => v.beforeBringBack)!
    s.clock.set(s.clock.now() + 400 * DAY)
    await thin(s.deps)
    const versions = await versionsOf(s, sectionId)
    expect(versions.map((v) => v.id)).toContain(marked.id)
    const outlines = await s.store.transaction((tx) => tx.outlinesOf(piece.id))
    const stands = [...outlines].sort((a, b) => b.seq - a.seq).find((o) => o.createdAt <= marked.createdAt)
    expect(stands?.title).toBe('Salt')
  })

  it('survives export and import', async () => {
    const s = setup()
    const { piece, sectionId } = await essay(s, ['one', 'two'])
    await bringBack(s.deps, piece.id, await moment(s, piece, sectionId, 'one'))
    const files = await exportAll(s.deps)
    const t = setup()
    expect((await importArchive(t.deps, files)).ok).toBe(true)
    const imported = await t.store.transaction(async (tx) => (await tx.pieces())[0]!.sections[0]!.sectionId)
    const versions = (await versionsOf(t, imported)).map((v) => [v.content, !!v.beforeBringBack])
    expect(versions).toContainEqual(['two', true])
  })
})

/** A few renames over a few minutes, each its own moment. */
async function renameOften(s: Setup, piece: Piece): Promise<void> {
  for (const title of ['Salt 2', 'Salt 3', 'Salt 4']) {
    s.clock.set(s.clock.now() + MIN)
    await rename(s.deps, piece, title)
    await takeMoment(s.deps, piece.id)
  }
}
