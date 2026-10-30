import { describe, expect, it } from 'vitest'
import { memoryStore } from '../adapters/memory-store'
import { exportAll, FORMAT_VERSION, guessKind, importArchive, importMarkdown, readDay } from './archive'
import { newPiece, openPiece, putAway, rename, takeMoment, withDay, write } from './pieces'
import type { Store } from './ports'

function setup(start = Date.UTC(2026, 9, 1)) {
  let t = start
  let n = 0
  const clock = { now: () => t, tick: (ms: number) => (t += ms) }
  const ids = { next: () => `id${++n}` }
  return { store: memoryStore(), clock, ids }
}

/** Everything in a store, as plain data, to compare two stores. */
async function dump(store: Store) {
  return store.transaction(async (tx) => {
    const pieces = (await tx.pieces()).sort((a, b) => a.id.localeCompare(b.id))
    const out = []
    for (const p of pieces) {
      const sections = []
      for (const s of p.sections) {
        sections.push({ working: await tx.working(s.sectionId), versions: (await tx.versionsOf(s.sectionId)).sort((a, b) => a.seq - b.seq) })
      }
      out.push({ piece: p, outlines: (await tx.outlinesOf(p.id)).sort((a, b) => a.seq - b.seq), sections })
    }
    return out
  })
}

async function writeSome(deps: ReturnType<typeof setup>) {
  const essay = newPiece(deps, 'essay', 'en')
  await rename(deps, essay, 'The second draft')
  for (const text of ['One.', 'One. Two.', 'One. *Two*. Three.']) {
    await write(deps, essay, essay.sections[0]!.sectionId, text)
    await takeMoment(deps, essay.id, { kept: text === 'One.' })
    deps.clock.tick(3600_000)
  }
  await write(deps, essay, essay.sections[0]!.sectionId, 'One. *Two*. Three. Not a moment yet.')

  let journal = newPiece(deps, 'journal', 'es')
  for (const day of ['2026-10-26', '2026-10-27']) {
    const opened = withDay(deps, journal, day)
    journal = opened.piece
    await write(deps, journal, opened.sectionId, `Hoy, ${day}.`)
    await takeMoment(deps, journal.id)
    journal = (await openPiece(deps, journal.id))!.piece
  }

  const gone = newPiece(deps, 'essay', 'en')
  await rename(deps, gone, 'Put away one')
  await write(deps, gone, gone.sections[0]!.sectionId, 'Waiting.')
  await takeMoment(deps, gone.id)
  await putAway(deps, gone.id)
  return { essay, journal, gone }
}

describe('export and import', () => {
  it('export → import gives identical data, history and put-away pieces included', async () => {
    const a = setup()
    await writeSome(a)
    const files = await exportAll(a)
    const b = setup()
    const result = await importArchive(b, files)
    expect(result).toEqual({ ok: true, added: 3, alreadyHere: 0 })
    // Identical, except that a put-away piece starts a fresh 30 days where it lands.
    const away = (d: Awaited<ReturnType<typeof dump>>) =>
      d.map((x) => ({ ...x, piece: { ...x.piece, putAwayAt: x.piece.putAwayAt === undefined ? undefined : 'put away' } }))
    expect(away(await dump(b.store))).toEqual(away(await dump(a.store)))
  })

  it('writes readable files: the whole piece, each day with its year, the history, and an index', async () => {
    const a = setup()
    await writeSome(a)
    const files = await exportAll(a)
    const at = (path: string) => files.find((f) => f.path === path)?.text
    expect(at('The second draft/The second draft.md')).toBe('# The second draft\n\nOne. *Two*. Three. Not a moment yet.\n')
    expect(at('Journal/01 Monday 26 October.md')).toBe('# Monday 26 October 2026\n\nHoy, 2026-10-26.\n')
    expect(at('Put away/Put away one/Put away one.md')).toContain('Waiting.')
    expect(files.filter((f) => f.path.startsWith('The second draft/history/'))).toHaveLength(4) // 3 versions + the working copy
    expect(JSON.parse(at('index.json')!).formatVersion).toBe(FORMAT_VERSION)
  })

  it('never overwrites: an identical piece is skipped, a different one comes in as new', async () => {
    const a = setup()
    const { essay } = await writeSome(a)
    const files = await exportAll(a)
    expect(await importArchive(a, files)).toEqual({ ok: true, added: 0, alreadyHere: 3 })
    await write(a, essay, essay.sections[0]!.sectionId, 'Changed since the export.')
    expect(await importArchive(a, files)).toEqual({ ok: true, added: 1, alreadyHere: 2 })
    // The piece here is untouched; the export's version sits beside it.
    expect((await openPiece(a, essay.id))?.sections[0]?.content).toBe('Changed since the export.')
    const titles = (await a.store.transaction((tx) => tx.pieces())).map((p) => p.title).filter((t) => t === 'The second draft')
    expect(titles).toHaveLength(2)
  })

  it('the same export imported twice adds one copy, not two', async () => {
    const a = setup()
    const { essay } = await writeSome(a)
    const files = await exportAll(a)
    await write(a, essay, essay.sections[0]!.sectionId, 'Changed since the export.')
    expect(await importArchive(a, files)).toEqual({ ok: true, added: 1, alreadyHere: 2 })
    expect(await importArchive(a, files)).toEqual({ ok: true, added: 0, alreadyHere: 3 })
  })

  it('renamed chapters count as different, so they are not lost', async () => {
    const a = setup()
    const book = newPiece(a, 'book', 'en')
    await write(a, book, book.sections[0]!.sectionId, 'Text.')
    await takeMoment(a, book.id)
    const files = await exportAll(a)
    // Here, the chapter is renamed afterwards: the export's own chapter title must still come in.
    const { renameSection } = await import('./pieces')
    await renameSection(a, book, book.sections[0]!.sectionId, 'A new name')
    expect(await importArchive(a, files)).toEqual({ ok: true, added: 1, alreadyHere: 0 })
  })

  it('a piece put away when exported waits a fresh 30 days', async () => {
    const a = setup()
    const { gone } = await writeSome(a)
    const files = await exportAll(a)
    const b = setup(Date.UTC(2027, 0, 1))
    await importArchive(b, files)
    expect((await openPiece(b, gone.id))?.piece.putAwayAt).toBe(Date.UTC(2027, 0, 1))
  })

  it('refuses an export with a file missing, writing nothing', async () => {
    const a = setup()
    await writeSome(a)
    const files = (await exportAll(a)).filter((f) => !f.path.includes('/history/') || !f.path.endsWith('working.md'))
    const b = setup()
    expect(await importArchive(b, files)).toEqual({ ok: false, reason: 'incomplete' })
    expect(await b.store.transaction((tx) => tx.pieces())).toEqual([])
  })

  it('reads names spelt the other way (NFD) after a zip round trip elsewhere', async () => {
    const a = setup()
    const essay = newPiece(a, 'essay', 'es')
    await rename(a, essay, 'Canción')
    await write(a, essay, essay.sections[0]!.sectionId, 'Letra.')
    await takeMoment(a, essay.id)
    const files = (await exportAll(a)).map((f) => ({ ...f, path: f.path.normalize('NFD') }))
    const b = setup()
    expect(await importArchive(b, files)).toMatchObject({ ok: true, added: 1 })
    expect((await openPiece(b, essay.id))?.sections[0]?.content).toBe('Letra.')
  })

  it('refuses a newer format whole, and what is not an export', async () => {
    const b = setup()
    expect(await importArchive(b, [{ path: 'index.json', text: JSON.stringify({ formatVersion: FORMAT_VERSION + 1, pieces: [] }) }])).toEqual({
      ok: false,
      reason: 'newer-format',
    })
    expect(await importArchive(b, [{ path: 'notes.md', text: '# Hi' }])).toEqual({ ok: false, reason: 'not-an-export' })
    expect(await b.store.transaction((tx) => tx.pieces())).toEqual([])
  })

  it('finds the index inside the zip folder', async () => {
    const a = setup()
    await writeSome(a)
    const files = (await exportAll(a)).map((f) => ({ ...f, path: `Elbowpatch 28 October 2026/${f.path}` }))
    const b = setup()
    expect(await importArchive(b, files)).toMatchObject({ ok: true, added: 3 })
  })
})

describe('loose .md files', () => {
  it('guesses the kind', () => {
    expect(guessKind('Just text.')).toBe('essay')
    expect(guessKind('# A title\n\nText.')).toBe('essay')
    expect(guessKind('# One\n\nA.\n\n# Two\n\nB.')).toBe('book')
    expect(guessKind('# Monday 26 October 2026\n\nA.\n\n# Tuesday 27 October 2026\n\nB.')).toBe('journal')
  })

  it('reads a day heading', () => {
    expect(readDay('Monday 26 October 2026')).toBe('2026-10-26')
    expect(readDay('3 March 2025')).toBe('2025-03-03')
    expect(readDay('Chapter one')).toBeUndefined()
  })

  it('a book gets a chapter per heading; an essay keeps its title line as its title', async () => {
    const d = setup()
    const book = await importMarkdown(d, 'Winter.md', 'A foreword.\n\n# One\n\nFirst.\n\n# Two\n\n> A quote\n\nSecond.', 'book', 'en')
    const openBook = await openPiece(d, book.id)
    expect(openBook?.piece.title).toBe('Winter')
    expect(openBook?.sections.map((s) => [s.title, s.content])).toEqual([
      ['', 'A foreword.'],
      ['One', 'First.'],
      ['Two', '> A quote\n\nSecond.'],
    ])

    const essay = await importMarkdown(d, 'x.md', '# The title\n\nBody *here*.\n\n- a list, kept as written', 'essay', 'en')
    const openEssay = await openPiece(d, essay.id)
    expect(openEssay?.piece.title).toBe('The title')
    expect(openEssay?.sections[0]?.content).toBe('Body *here*.\n\n- a list, kept as written')

    const journal = await importMarkdown(d, 'Diary.md', '# Monday 26 October 2026\n\nRain.', 'journal', 'en')
    expect((await openPiece(d, journal.id))?.piece.sections).toEqual([{ sectionId: expect.any(String), title: '2026-10-26' }])
  })
})
