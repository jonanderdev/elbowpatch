import { countWords, joinHalves, parse, type Seam, wordsIn } from './markdown'
import type { Kind, Outline, OutlineSection, Piece, Place, Screen, Version, Working } from './model'
import type { Clock, Ids, Store, Tx } from './ports'

export interface Deps {
  store: Store
  clock: Clock
  ids: Ids
}

export interface OpenSection {
  sectionId: string
  title: string
  content: string
  /** When this section's text was last stored (its working copy, else its latest version). */
  updatedAt?: number
}

/**
 * A new piece, not yet stored. It is stored by its first write, so a new piece
 * left empty is never kept (DESIGN.md, The library).
 */
export function newPiece(deps: Pick<Deps, 'clock' | 'ids'>, kind: Kind, lang: string): Piece {
  const now = deps.clock.now()
  return {
    id: deps.ids.next(),
    kind,
    lang,
    createdAt: now,
    updatedAt: now,
    title: kind === 'journal' ? 'Journal' : '',
    // A journal's days join as they are written (withDay); an essay is one section, a book starts with one chapter.
    sections: kind === 'journal' ? [] : [{ sectionId: deps.ids.next(), title: '' }],
    outlineId: null,
  }
}

/** Saves a section's text as its working copy. Safe to run twice. */
export function write(deps: Pick<Deps, 'store' | 'clock'>, draft: Piece, sectionId: string, content: string): Promise<void> {
  return deps.store.transaction(async (tx) => {
    const now = deps.clock.now()
    const stored = await tx.piece(draft.id)
    const working = await tx.working(sectionId)
    if (stored && working?.content === content) return
    // A section new in the draft, with nothing in it yet, is not stored: left empty, it was never here.
    if (stored && content === '' && !stored.sections.some((s) => s.sectionId === sectionId)) return
    const piece = stored ?? draft
    // A section new in the draft (today, in a journal, a new chapter) joins the piece with its first words.
    const sections = joined(piece, draft, sectionId)
    const words = { ...piece.words, [sectionId]: countWords(content) }
    await tx.putPiece({ ...piece, sections, words, updatedAt: now })
    await tx.putWorking({
      sectionId,
      pieceId: draft.id,
      content,
      baseVersionId: working?.baseVersionId ?? null,
      updatedAt: now,
    })
  })
}

/** Saves the piece's title like a working copy; the next moment keeps it in an outline version. */
export function rename(deps: Pick<Deps, 'store' | 'clock'>, draft: Piece, title: string): Promise<void> {
  return deps.store.transaction(async (tx) => {
    const stored = await tx.piece(draft.id)
    if (stored?.title === title) return
    await tx.putPiece({ ...(stored ?? draft), title, updatedAt: deps.clock.now() })
  })
}

/** A book's subtitle, on its title page; kept in the outline like the title. */
export function setSubtitle(deps: Pick<Deps, 'store' | 'clock'>, draft: Piece, subtitle: string): Promise<void> {
  return deps.store.transaction(async (tx) => {
    const stored = await tx.piece(draft.id)
    if ((stored?.subtitle ?? '') === subtitle) return
    await tx.putPiece({ ...(stored ?? draft), subtitle, updatedAt: deps.clock.now() })
  })
}

/** A chapter's title: a field, kept in the outline (0005). */
export function renameSection(deps: Pick<Deps, 'store' | 'clock'>, draft: Piece, sectionId: string, title: string): Promise<void> {
  return deps.store.transaction(async (tx) => {
    const piece = (await tx.piece(draft.id)) ?? draft
    const sections = joined(piece, draft, sectionId).map((s) => (s.sectionId === sectionId ? { ...s, title } : s))
    await tx.putPiece({ ...piece, sections, updatedAt: deps.clock.now() })
  })
}

/** Opening a journal lands on today: a new day joins the draft, and is stored by its first words. */
export function withDay(deps: Pick<Deps, 'ids'>, piece: Piece, isoDay: string): { piece: Piece; sectionId: string } {
  const day = piece.sections.find((s) => s.title === isoDay)
  if (day) return { piece, sectionId: day.sectionId }
  const sectionId = deps.ids.next()
  const sections = [...piece.sections, { sectionId, title: isoDay }].sort((a, b) => a.title.localeCompare(b.title))
  return { piece: { ...piece, sections }, sectionId }
}

/**
 * A new chapter joins the draft, at the end of the book or right after the chapter given. It is
 * stored by its first words or its first title, so one left empty is gone (as a journal's day is).
 */
export function withChapter(deps: Pick<Deps, 'ids'>, piece: Piece, after?: string): { piece: Piece; sectionId: string } {
  const sectionId = deps.ids.next()
  const found = piece.sections.findIndex((s) => s.sectionId === after)
  const at = found < 0 ? piece.sections.length : found + 1
  return { piece: { ...piece, sections: [...piece.sections.slice(0, at), { sectionId, title: '' }, ...piece.sections.slice(at)] }, sectionId }
}

/** A book with nothing stored yet: its first chapter is all it has, and a chapter left empty in the draft goes. */
export function neverStored(draft: Piece): Piece {
  return { ...draft, sections: draft.sections.slice(0, 1) }
}

/** The piece as stored, with the page's open section where it will join: what Contents lists. */
export function withOpenSection(stored: Piece, draft: Piece, sectionId: string): Piece {
  return { ...stored, sections: joined(stored, draft, sectionId) }
}

export function totalWords(piece: Piece): number {
  return Object.values(piece.words ?? {}).reduce((a, b) => a + b, 0)
}

/**
 * A book's pages on a screen's page: the sum of its chapters', or undefined while a chapter has not been
 * laid out there yet, rather than a count that is short.
 */
export function bookPages(piece: Piece, screen: Screen): number | undefined {
  const counts = piece.pages?.[screen]
  let total = 0
  for (const s of piece.sections) {
    const n = counts?.[s.sectionId]
    if (n === undefined) return undefined
    total += n
  }
  return total
}

/** A line of Contents. Its start page is unknown while a chapter before it has not been laid out on this screen's page. */
export interface ContentsChapter extends OutlineSection {
  startPage?: number
}

/** The open chapter as it stands on the page, newer than what is stored. */
export interface OpenChapter {
  sectionId: string
  title: string
  pages: number
}

/**
 * Contents: each chapter and the page it starts on, and the book's pages, on a screen's page. The title
 * page is part of chapter 1, so chapter 1 starts on page 1. Nothing is guessed: a number that would rest
 * on an unknown count stays unknown.
 */
export function contents(piece: Piece, screen: Screen, open?: OpenChapter): { chapters: ContentsChapter[]; pages?: number } {
  let start: number | undefined = 1
  const chapters = piece.sections.map((s): ContentsChapter => {
    const here = s.sectionId === open?.sectionId
    const chapter: ContentsChapter = { ...s, title: here ? open.title : s.title, ...(start === undefined ? {} : { startPage: start }) }
    const pages = here ? open.pages : piece.pages?.[screen]?.[s.sectionId]
    start = start === undefined || pages === undefined ? undefined : start + pages
    return chapter
  })
  return { chapters, ...(start === undefined ? {} : { pages: start - 1 }) }
}

/** The book's numbers at a page of the open chapter. Each stands aside while it would rest on an unknown count. */
export interface BookCount {
  page?: number
  pages?: number
  words: number
}

/**
 * The folio's and the tools' numbers: `page` is the page in the open chapter, from 0, so the book's first
 * page is the title page, as in Contents. The chapter's start page is known once every chapter before it is
 * laid out, the total once all of them are.
 */
export function bookCount(piece: Piece, screen: Screen, open: OpenChapter & { words: number }, page: number): BookCount {
  const { chapters, pages } = contents(piece, screen, open)
  const start = chapters.find((c) => c.sectionId === open.sectionId)?.startPage
  const words = piece.sections.reduce((sum, s) => sum + (s.sectionId === open.sectionId ? open.words : (piece.words?.[s.sectionId] ?? 0)), 0)
  return { ...(start === undefined ? {} : { page: start + page }), ...(pages === undefined ? {} : { pages }), words }
}

/**
 * The page of the writer's place, as the folio shows it there: in a book the book's page, unknown while a chapter
 * before it has not been laid out, or if the place was kept on the other screen's page or no longer says.
 */
export function placePage(piece: Piece, screen: Screen): number | undefined {
  const { place } = piece
  if (piece.kind !== 'book' || !place || place.page === undefined) return place?.page
  if (place.screen ? place.screen !== screen : place.page !== 1) return undefined
  const start = contents(piece, screen).chapters.find((c) => c.sectionId === place.sectionId)?.startPage
  return start === undefined ? undefined : start + place.page - 1
}

/** Keeps a section's page count on a screen's page. Not a change to the piece: its date stays. Safe to run twice. */
export function savePages(deps: Pick<Deps, 'store'>, pieceId: string, screen: Screen, sectionId: string, count: number): Promise<void> {
  return deps.store.transaction(async (tx) => {
    const piece = await tx.piece(pieceId)
    // A section not stored yet: left empty, its count would stay behind.
    if (!piece?.sections.some((s) => s.sectionId === sectionId) || piece.pages?.[screen]?.[sectionId] === count) return
    await tx.putPiece({ ...piece, pages: { ...piece.pages, [screen]: { ...piece.pages?.[screen], [sectionId]: count } } })
  })
}

/** What a chapter's pages depend on, besides the screen and the text settings. */
export interface ChapterToLayOut {
  title: string
  content: string
  lang: string
  /** Chapter 1 carries the book's title page before its text. */
  titlePage: boolean
}

/**
 * Measures the next chapter with no count on a screen's page, the open book's first (0003). Run it when the
 * app is idle: `layOut` lays the chapter out off screen, or gives up with undefined. Like `savePages`, it is
 * not a change to the piece. A count whose text or title changed meanwhile is dropped, and that chapter
 * measured again. True while there may be more to measure.
 */
export async function measureNext(
  deps: Pick<Deps, 'store'>,
  screen: Screen,
  layOut: (chapter: ChapterToLayOut) => Promise<number | undefined>,
  first?: string,
): Promise<boolean> {
  const next = await deps.store.transaction(async (tx) => {
    const books = (await tx.pieces()).filter((p) => p.kind === 'book' && p.putAwayAt === undefined)
    for (const piece of books.sort((a, b) => Number(b.id === first) - Number(a.id === first))) {
      const index = piece.sections.findIndex((s) => piece.pages?.[screen]?.[s.sectionId] === undefined)
      const section = piece.sections[index]
      if (section) return { pieceId: piece.id, section, lang: piece.lang, titlePage: index === 0, content: (await current(tx, section.sectionId)).content }
    }
    return undefined
  })
  if (!next) return false
  const { pieceId, section, lang, titlePage, content } = next
  const count = await layOut({ title: section.title, content, lang, titlePage })
  if (count === undefined) return false
  await deps.store.transaction(async (tx) => {
    const piece = await tx.piece(pieceId)
    if (!piece || piece.pages?.[screen]?.[section.sectionId] !== undefined) return
    const title = piece.sections.find((s) => s.sectionId === section.sectionId)?.title
    if (title !== section.title || (await current(tx, section.sectionId)).content !== content) return
    await tx.putPiece({ ...piece, pages: { ...piece.pages, [screen]: { ...piece.pages?.[screen], [section.sectionId]: count } } })
  })
  return true
}

/** The text settings changed: every count on this device is stale, and so is a place's page in a book, so none is known until it is laid out again. */
export function forgetPages(deps: Pick<Deps, 'store'>): Promise<void> {
  return deps.store.transaction(async (tx) => {
    for (const { pages, ...piece } of await tx.pieces()) {
      const place = piece.kind === 'book' && piece.place ? withoutPage(piece.place) : piece.place
      if (pages || place !== piece.place) await tx.putPiece(place ? { ...piece, place } : piece)
    }
  })
}

/** The place itself holds on any page; the number it was on a screen's page does not. A chapter's opening page is page 1 on every one. */
export function withoutPage(place: Place): Place {
  if (place.page === undefined || (!place.screen && place.page === 1)) return place
  const { page: _, screen: __, ...left } = place
  return left
}

export function savePlace(deps: Pick<Deps, 'store'>, pieceId: string, place: Place): Promise<void> {
  return deps.store.transaction(async (tx) => {
    const piece = await tx.piece(pieceId)
    // A section not stored yet: the writer's place stays where it was, in case it is left empty.
    if (piece?.sections.some((s) => s.sectionId === place.sectionId)) await tx.putPiece({ ...piece, place })
  })
}

/**
 * A moment: every section whose text changed since its last version gets a new
 * version, and a changed title or section list a new outline version, all with
 * one timestamp. Nothing changed, nothing written — so running it twice is safe.
 * `kept` ("keep this moment") always writes, and is never thinned.
 */
export function takeMoment(deps: Deps, pieceId: string, opts: { kept?: boolean } = {}): Promise<number> {
  return deps.store.transaction((tx) => momentIn(tx, deps, pieceId, opts))
}

async function momentIn(tx: Tx, deps: Pick<Deps, 'clock' | 'ids'>, pieceId: string, opts: { kept?: boolean } = {}): Promise<number> {
  const piece = await tx.piece(pieceId)
  if (!piece) return 0

  const changes: { working: Working; parent: Version | undefined }[] = []
  for (const working of await tx.workingOf(pieceId)) {
    const parent = working.baseVersionId ? await tx.version(working.baseVersionId) : undefined
    const unchanged = parent ? parent.content === working.content : working.content === ''
    if (!unchanged || (opts.kept && parent)) changes.push({ working, parent })
  }
  const outline = piece.outlineId ? await tx.outline(piece.outlineId) : undefined
  const outlineChanged =
    !outline || outline.title !== piece.title || (outline.subtitle ?? '') !== (piece.subtitle ?? '') || !sameSections(outline.sections, piece.sections)
  if (changes.length === 0 && !outlineChanged) return 0

  // One timestamp for the moment, never earlier than anything it follows: clocks jump.
  let at = deps.clock.now()
  for (const { parent } of changes) if (parent) at = Math.max(at, parent.createdAt + 1)
  if (outline) at = Math.max(at, outline.createdAt + 1)

  for (const { working, parent } of changes) {
    const version: Version = {
      id: deps.ids.next(),
      pieceId,
      sectionId: working.sectionId,
      parentId: parent?.id ?? null,
      seq: (parent?.seq ?? 0) + 1,
      createdAt: at,
      content: working.content,
      ...(opts.kept ? { kept: true } : {}),
    }
    await tx.putVersion(version)
    await tx.putWorking({ ...working, baseVersionId: version.id })
  }

  let outlineId = piece.outlineId
  if (outlineChanged) {
    const next: Outline = {
      id: deps.ids.next(),
      pieceId,
      parentId: outline?.id ?? null,
      seq: (outline?.seq ?? 0) + 1,
      createdAt: at,
      title: piece.title,
      ...(piece.subtitle ? { subtitle: piece.subtitle } : {}),
      sections: piece.sections.map((s) => ({ ...s })),
    }
    await tx.putOutline(next)
    outlineId = next.id
  }
  await tx.putPiece({ ...piece, outlineId })
  return changes.length + (outlineChanged ? 1 : 0)
}

/** Where a chapter starts in the text, and what the page held when it did. */
export interface ChapterStart {
  sectionId: string
  /** The section's text as the page holds it: the split runs only if this is what is stored. */
  whole: string
  /** The two halves: what stays, and what moves. */
  before: string
  after: string
  /** Empty, or the rest of a `# ` line. */
  title: string
  /** Chosen by the caller, which is what makes running it twice safe. */
  newSectionId: string
}

/**
 * Starts a chapter at a point, in one transaction: a moment first, so the undivided chapter stays in
 * history, then the current section shortened and the new one written after it. The working copies
 * carry the text until the next moment, so a crash before it is recovered as usual. Safe to run twice.
 * Refused, with nothing changed, unless `whole` is what is stored. Returns the piece as it now stands.
 */
export function startChapterAt(deps: Deps, pieceId: string, start: ChapterStart): Promise<Piece> {
  return deps.store.transaction(async (tx) => {
    const { sectionId, whole, before, after, title, newSectionId } = start
    const found = await tx.piece(pieceId)
    if (found?.kind !== 'book') throw new Error('Only a book has chapters.')
    if (found.sections.some((s) => s.sectionId === newSectionId)) return found
    const at = found.sections.findIndex((s) => s.sectionId === sectionId)
    if (at < 0 || (await current(tx, sectionId)).content !== whole) throw new Error('The words are not stored yet.')

    await momentIn(tx, deps, pieceId)
    const piece = (await tx.piece(pieceId))!
    const now = deps.clock.now()
    await tx.putWorking({ sectionId, pieceId, content: before, baseVersionId: await baseOf(tx, sectionId), updatedAt: now })
    await tx.putWorking({ sectionId: newSectionId, pieceId, content: after, baseVersionId: null, updatedAt: now })
    const next: Piece = {
      ...piece,
      sections: [...piece.sections.slice(0, at + 1), { sectionId: newSectionId, title }, ...piece.sections.slice(at + 1)],
      words: { ...piece.words, [sectionId]: countWords(before), [newSectionId]: countWords(after) },
      pages: withoutCounts(piece.pages, [sectionId]),
      // Its opening page, which is page 1 of the chapter on any screen's page.
      place: { sectionId: newSectionId, paragraph: 0, offset: 0, snippet: openingWords(after), page: 1, caret: true, at: now },
      updatedAt: now,
    }
    await tx.putPiece(next)
    return next
  })
}

/** What undo puts back together. Only the session that split a chapter knows this. */
export interface ChapterRejoin {
  /** The chapter going back. */
  sectionId: string
  /** The chapter it was split from. */
  into: string
  /** Its text as the page holds it: the rejoin runs only if this is what is stored. */
  whole: string
  seam: Seam
  /** When words not stored yet were kept for `into`, if any: newer than its text, they must reach it first. */
  keptAt?: number
}

/** The chapter the text went back to, as it now stands. */
export interface Rejoined {
  piece: Piece
  sectionId: string
  content: string
}

/**
 * The reverse of a split, in one transaction: a moment first, so the chapter stays in history as it
 * stood, then its text back onto the end of the chapter before it, and the section out of the current
 * outline. Its versions stay, and earlier outlines still list it. Safe to run twice. Refused, with
 * nothing changed, unless `whole` is what is stored and `into` stands right before it, or while words
 * newer than `into`'s text wait to be stored: stamped newer than them, the joined text would shut them out.
 */
export function rejoinChapter(deps: Deps, pieceId: string, rejoin: ChapterRejoin): Promise<Rejoined> {
  return deps.store.transaction(async (tx) => {
    const { sectionId, into, whole, seam, keptAt } = rejoin
    const found = await tx.piece(pieceId)
    if (found?.kind !== 'book') throw new Error('Only a book has chapters.')
    const at = found.sections.findIndex((s) => s.sectionId === sectionId)
    if (at < 0) return { piece: found, sectionId: into, content: (await current(tx, into)).content }
    if (found.sections[at - 1]?.sectionId !== into) throw new Error('The chapter it came from is not before it.')
    if ((await current(tx, sectionId)).content !== whole) throw new Error('The words are not stored yet.')
    if (keptAt !== undefined && keptAt > (await current(tx, into)).updatedAt) throw new Error('The chapter it joins has words not stored yet.')

    await momentIn(tx, deps, pieceId)
    const piece = (await tx.piece(pieceId))!
    const now = deps.clock.now()
    const before = (await current(tx, into)).content
    const content = joinHalves(before, whole, seam, piece.sections[at]!.title)
    await tx.putWorking({ sectionId: into, pieceId, content, baseVersionId: await baseOf(tx, into), updatedAt: now })
    // The chapter's copy stays, stamped now: words kept for it earlier are older, and never replay it into the book.
    const left = await tx.working(sectionId)
    if (left) await tx.putWorking({ ...left, updatedAt: now })
    const { [sectionId]: _, ...words } = piece.words ?? {}
    const next: Piece = {
      ...piece,
      sections: piece.sections.filter((s) => s.sectionId !== sectionId),
      words: { ...words, [into]: countWords(content) },
      pages: withoutCounts(piece.pages, [sectionId, into]),
      // Which page the join fell on is not known here: the page says, once it has opened there.
      place: { sectionId: into, ...joinIn(before, content), caret: true, at: now },
      updatedAt: now,
    }
    await tx.putPiece(next)
    return { piece: next, sectionId: into, content }
  })
}

/** The version a section's working copy grew from: its own, else the section's latest. */
async function baseOf(tx: Tx, sectionId: string): Promise<string | null> {
  return (await tx.working(sectionId))?.baseVersionId ?? latest(await tx.versionsOf(sectionId))?.id ?? null
}

/** Where the two texts join: the end of what was there before. */
function joinIn(before: string, content: string): Pick<Place, 'paragraph' | 'offset' | 'snippet'> {
  const blocks = parse(before)
  const paragraph = Math.max(blocks.length - 1, 0)
  const last = blocks.at(-1)
  const there = parse(content)[paragraph]
  return { paragraph, offset: last ? wordsIn(last).length : 0, snippet: there ? wordsIn(there).replaceAll('\n', '').slice(0, 160) : '' }
}

/** A changed section's count no longer holds on any screen: it is unknown until it is laid out again. */
function withoutCounts(pages: Piece['pages'], sectionIds: string[]): Piece['pages'] {
  if (!pages) return pages
  const left = (counts: Record<string, number> | undefined): Record<string, number> =>
    Object.fromEntries(Object.entries(counts ?? {}).filter(([id]) => !sectionIds.includes(id)))
  return { ...pages, phone: left(pages.phone), desktop: left(pages.desktop) }
}

/** A place's snippet: the first paragraph's words, as the page shows them. */
function openingWords(markdown: string): string {
  const first = parse(markdown)[0]
  return first ? wordsIn(first).slice(0, 160) : ''
}

/** On launch: text left in working copies by a crash enters history first (0005, 0010). */
export async function recover(deps: Deps): Promise<number> {
  const pieces = await deps.store.transaction((tx) => tx.pieces())
  let written = 0
  for (const piece of pieces) written += await takeMoment(deps, piece.id)
  return written
}

/** The piece as it is now: each section's working copy, or its latest version. */
export function openPiece(deps: Pick<Deps, 'store'>, pieceId: string): Promise<{ piece: Piece; sections: OpenSection[] } | undefined> {
  return deps.store.transaction(async (tx) => {
    const piece = await tx.piece(pieceId)
    if (!piece) return undefined
    const sections: OpenSection[] = []
    for (const s of piece.sections) sections.push({ ...s, ...(await current(tx, s.sectionId)) })
    return { piece, sections }
  })
}

/** The piece as stored now, for what reads it again without opening it. */
export function storedPiece(deps: Pick<Deps, 'store'>, pieceId: string): Promise<Piece | undefined> {
  return deps.store.transaction((tx) => tx.piece(pieceId))
}

/** What is stored of a section: its piece, its working copy, and whether it has ever been kept in a moment. */
export interface StoredSection {
  piece: Piece | undefined
  working: Working | undefined
  hasVersions: boolean
}

export function storedSection(deps: Pick<Deps, 'store'>, pieceId: string, sectionId: string): Promise<StoredSection> {
  return deps.store.transaction(async (tx) => ({
    piece: await tx.piece(pieceId),
    working: await tx.working(sectionId),
    hasVersions: (await tx.versionsOf(sectionId)).length > 0,
  }))
}

async function current(tx: Tx, sectionId: string): Promise<{ content: string; updatedAt: number }> {
  const working = await tx.working(sectionId)
  if (working) return { content: working.content, updatedAt: working.updatedAt }
  const version = latest(await tx.versionsOf(sectionId))
  return { content: version?.content ?? '', updatedAt: version?.createdAt ?? 0 }
}

/** Pieces in the library, most recent first. Put-away pieces wait elsewhere (0006). */
export async function library(deps: Pick<Deps, 'store'>): Promise<Piece[]> {
  const pieces = await deps.store.transaction((tx) => tx.pieces())
  return pieces.filter((p) => p.putAwayAt === undefined).sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Puts a piece away: out of the library, kept whole, for 30 days (0006). Never asks first; `restore` undoes it. */
export function putAway(deps: Pick<Deps, 'store' | 'clock'>, pieceId: string): Promise<void> {
  return deps.store.transaction(async (tx) => {
    const piece = await tx.piece(pieceId)
    if (piece && piece.putAwayAt === undefined) await tx.putPiece({ ...piece, putAwayAt: deps.clock.now() })
  })
}

/** Brings a put-away piece back to the library as it was, with all its moments. */
export function restore(deps: Pick<Deps, 'store'>, pieceId: string): Promise<void> {
  return deps.store.transaction(async (tx) => {
    const piece = await tx.piece(pieceId)
    if (!piece || piece.putAwayAt === undefined) return
    const { putAwayAt: _, ...back } = piece
    await tx.putPiece(back)
  })
}

/** A section's versions, oldest first, ordered by their parents and never by the clock. */
export function history(versions: Version[]): Version[] {
  return [...versions].sort((a, b) => a.seq - b.seq)
}

export function latest(versions: Version[]): Version | undefined {
  return history(versions).at(-1)
}

/**
 * The stored sections, with this one added from the draft if it is new: journal days in date order,
 * anything else where the draft has it, before the next section that is stored, else at the end.
 */
function joined(stored: Piece, draft: Piece, sectionId: string): Piece['sections'] {
  const known = (id: string): boolean => stored.sections.some((s) => s.sectionId === id)
  if (known(sectionId)) return stored.sections
  const at = draft.sections.findIndex((s) => s.sectionId === sectionId)
  if (at < 0) return stored.sections
  const added = draft.sections[at]!
  if (stored.kind === 'journal') return [...stored.sections, added].sort((a, b) => a.title.localeCompare(b.title))
  const next = draft.sections.slice(at + 1).find((s) => known(s.sectionId))
  const before = next ? stored.sections.findIndex((s) => s.sectionId === next.sectionId) : stored.sections.length
  return [...stored.sections.slice(0, before), added, ...stored.sections.slice(before)]
}

function sameSections(a: Piece['sections'], b: Piece['sections']): boolean {
  return a.length === b.length && a.every((s, i) => s.sectionId === b[i]!.sectionId && s.title === b[i]!.title)
}
