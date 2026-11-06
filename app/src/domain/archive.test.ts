import { describe, expect, it } from 'vitest'
import { memoryStore } from '../adapters/memory-store'
import { exportAll, FORMAT_VERSION, guessKind, importArchive, importMarkdown, readDay } from './archive'
import {
  newPiece,
  openPiece,
  putAway,
  recover,
  rejoinChapter,
  removeChapter,
  rename,
  renameSection,
  savePages,
  savePlace,
  startChapterAt,
  takeMoment,
  totalWords,
  withChapter,
  withDay,
  write,
} from './pieces'
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

  it('a book of added chapters, one with only a title, comes back whole, in order, with its moments', async () => {
    const deps = setup()
    const book = newPiece(deps, 'book', 'en')
    const first = book.sections[0]!.sectionId
    await write(deps, book, first, 'The ferry.')
    await renameSection(deps, book, first, 'One')
    const outline = withChapter(deps, book)
    await renameSection(deps, outline.piece, outline.sectionId, 'Only a title')
    const words = withChapter(deps, outline.piece, first)
    await write(deps, words.piece, words.sectionId, 'Between.')
    await renameSection(deps, words.piece, words.sectionId, 'Between them')
    await takeMoment(deps, book.id)

    const files = await exportAll(deps)
    const elsewhere = { ...setup(), store: memoryStore() }
    expect(await importArchive(elsewhere, files)).toMatchObject({ ok: true, added: 1 })
    expect(await dump(elsewhere.store)).toEqual(await dump(deps.store))

    const open = (await openPiece(elsewhere, book.id))!
    expect(open.sections.map((s) => [s.title, s.content])).toEqual([
      ['One', 'The ferry.'],
      ['Between them', 'Between.'],
      ['Only a title', ''],
    ])
    const whole = files.find((f) => f.path === 'Untitled/Untitled.md')!
    expect(whole.text).toBe('# One\n\nThe ferry.\n\n# Between them\n\nBetween.\n\n# Only a title\n')
  })

  it('a book of split and added chapters comes back whole, and as one file has one heading per chapter, in order', async () => {
    const deps = setup()
    const book = newPiece(deps, 'book', 'en')
    const first = book.sections[0]!.sectionId
    const whole = 'The ferry.\n\nSalt on the rail.\n\nThe harbour in winter.'
    await write(deps, book, first, whole)
    await renameSection(deps, book, first, 'One')
    await takeMoment(deps, book.id)
    await startChapterAt(deps, book.id, {
      sectionId: first,
      whole,
      before: 'The ferry.',
      after: 'Salt on the rail.\n\nThe harbour in winter.',
      title: '',
      newSectionId: 'cut',
    })
    await takeMoment(deps, book.id)
    const rest = 'Salt on the rail.\n\nThe harbour in winter.'
    await startChapterAt(deps, book.id, {
      sectionId: 'cut',
      whole: rest,
      before: 'Salt on the rail.',
      after: 'The harbour in winter.',
      title: 'Winter',
      newSectionId: 'line',
    })
    await takeMoment(deps, book.id)
    const added = withChapter(deps, (await openPiece(deps, book.id))!.piece, first)
    await write(deps, added.piece, added.sectionId, 'Added.')
    await renameSection(deps, added.piece, added.sectionId, 'Added')
    await takeMoment(deps, book.id)

    const files = await exportAll(deps)
    const elsewhere = { ...setup(), store: memoryStore() }
    expect(await importArchive(elsewhere, files)).toMatchObject({ ok: true, added: 1 })
    expect(await dump(elsewhere.store)).toEqual(await dump(deps.store))

    const open = (await openPiece(elsewhere, book.id))!
    expect(open.sections.map((s) => [s.title, s.content])).toEqual([
      ['One', 'The ferry.'],
      ['Added', 'Added.'],
      ['', 'Salt on the rail.'],
      ['Winter', 'The harbour in winter.'],
    ])
    const text = files.find((f) => f.path === 'Untitled/Untitled.md')!.text
    expect(text).toBe('# One\n\nThe ferry.\n\n# Added\n\nAdded.\n\n# Untitled\n\nSalt on the rail.\n\n# Winter\n\nThe harbour in winter.\n')
    const read = await importMarkdown(elsewhere, 'again.md', text as string, 'book', 'en')
    expect(read.sections.map((s) => s.title)).toEqual(['One', 'Added', 'Untitled', 'Winter'])
  })

  it("the page of the writer's place stays behind with the counts: it belongs to the screen the export left", async () => {
    const deps = setup()
    const book = newPiece(deps, 'book', 'en')
    const first = book.sections[0]!.sectionId
    await write(deps, book, first, 'One.')
    await savePlace(deps, book.id, { sectionId: first, paragraph: 0, offset: 0, snippet: 'One.', page: 4, screen: 'phone', caret: false, at: 1 })
    await takeMoment(deps, book.id)

    const elsewhere = { ...setup(), store: memoryStore() }
    await importArchive(elsewhere, await exportAll(deps))
    const { place } = (await openPiece(elsewhere, book.id))!.piece
    expect(place).toMatchObject({ sectionId: first, snippet: 'One.' })
    expect(place?.page).toBeUndefined()
  })

  it('a chapter removed stays out of the book, the rest comes along whole, and its versions too', async () => {
    const deps = setup()
    const book = newPiece(deps, 'book', 'en')
    const first = book.sections[0]!.sectionId
    await write(deps, book, first, 'One.')
    await renameSection(deps, book, first, 'One')
    const { piece: more, sectionId: second } = withChapter(deps, book)
    await write(deps, more, second, 'Soon gone.')
    await takeMoment(deps, book.id)
    const { piece: all, sectionId: third } = withChapter(deps, more)
    await write(deps, all, third, 'Three.')
    await renameSection(deps, all, third, 'Three')
    await write(deps, all, second, '')
    await takeMoment(deps, book.id)
    await removeChapter(deps, book.id, { sectionId: second, held: [] })

    const files = await exportAll(deps)
    // Its history travels, as a file the book's own text does not list.
    expect(files.some((f) => f.path.endsWith('.md') && f.text === 'Soon gone.')).toBe(true)
    const whole = files.find((f) => f.path.endsWith('Untitled.md'))!
    expect(whole.text).not.toContain('Untitled')

    const elsewhere = { ...setup(), store: memoryStore() }
    expect(await importArchive(elsewhere, files)).toMatchObject({ ok: true, added: 1 })
    await recover(elsewhere)
    const back = (await openPiece(elsewhere, book.id))!
    expect(back.sections.map((s) => [s.title, s.content])).toEqual([
      ['One', 'One.'],
      ['Three', 'Three.'],
    ])
    expect(Object.keys(back.piece.words!).sort()).toEqual([first, third].sort())
    const versions = await elsewhere.store.transaction((tx) => tx.versionsOf(second))
    expect(versions.map((v) => v.content)).toContain('Soon gone.')
    const outlines = await elsewhere.store.transaction((tx) => tx.outlinesOf(book.id))
    expect(outlines.some((o) => o.sections.some((s) => s.sectionId === second))).toBe(true)
  })

  it('a chapter rejoined stays out of the book, and its versions come along', async () => {
    const deps = setup()
    const book = newPiece(deps, 'book', 'en')
    const first = book.sections[0]!.sectionId
    await write(deps, book, first, 'One.\n\nTwo.')
    await takeMoment(deps, book.id)
    await startChapterAt(deps, book.id, { sectionId: first, whole: 'One.\n\nTwo.', before: 'One.', after: 'Two.', title: '', newSectionId: 'cut' })
    await takeMoment(deps, book.id)
    await rejoinChapter(deps, book.id, { sectionId: 'cut', into: first, whole: 'Two.', seam: { front: 'apart', ending: '', raw: false, escaped: false } })
    await takeMoment(deps, book.id)

    const elsewhere = { ...setup(), store: memoryStore() }
    expect(await importArchive(elsewhere, await exportAll(deps))).toMatchObject({ ok: true, added: 1 })
    expect((await openPiece(elsewhere, book.id))!.sections.map((s) => s.content)).toEqual(['One.\n\nTwo.'])
    expect((await elsewhere.store.transaction((tx) => tx.versionsOf('cut'))).map((v) => v.content)).toEqual(['Two.'])
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

  it('a book arrives with no page counts: they belong to the screen and the text settings it left', async () => {
    const a = setup()
    const book = newPiece(a, 'book', 'en')
    const chapter = book.sections[0]!.sectionId
    await write(a, book, chapter, 'Text.')
    await savePages(a, book.id, 'desktop', chapter, 7)
    const files = await exportAll(a)
    await write(a, book, chapter, 'Changed since the export.')
    await importArchive(a, files)
    const copy = (await a.store.transaction((tx) => tx.pieces())).find((p) => p.copyOf)!
    expect(copy.pages).toBeUndefined()
  })

  it('an imported Markdown book knows its words, chapter by chapter', async () => {
    const a = setup()
    const piece = await importMarkdown(a, 'harbour.md', '# One\n\nThree small words.\n\n# Two\n\nTwo more.\n', 'book', 'en')
    expect(totalWords((await a.store.transaction((tx) => tx.piece(piece.id)))!)).toBe(5)
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
