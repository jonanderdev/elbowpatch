import type { Kind, Outline, Piece, Place, Version, Working } from './model'
import { countWords } from './markdown'
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
    const piece = stored ?? draft
    // A section new in the draft (today, in a journal) joins the piece with its first words.
    const sections = piece.sections.some((s) => s.sectionId === sectionId) ? piece.sections : draft.sections
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

/** A chapter's title: a field, kept in the outline (0005). */
export function renameSection(deps: Pick<Deps, 'store' | 'clock'>, draft: Piece, sectionId: string, title: string): Promise<void> {
  return deps.store.transaction(async (tx) => {
    const piece = (await tx.piece(draft.id)) ?? draft
    const sections = (piece.sections.some((s) => s.sectionId === sectionId) ? piece.sections : draft.sections).map((s) =>
      s.sectionId === sectionId ? { ...s, title } : s,
    )
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

export function totalWords(piece: Piece): number {
  return Object.values(piece.words ?? {}).reduce((a, b) => a + b, 0)
}

export function savePlace(deps: Pick<Deps, 'store'>, pieceId: string, place: Place): Promise<void> {
  return deps.store.transaction(async (tx) => {
    const piece = await tx.piece(pieceId)
    if (piece) await tx.putPiece({ ...piece, place })
  })
}

/**
 * A moment: every section whose text changed since its last version gets a new
 * version, and a changed title or section list a new outline version, all with
 * one timestamp. Nothing changed, nothing written — so running it twice is safe.
 * `kept` ("keep this moment") always writes, and is never thinned.
 */
export function takeMoment(deps: Deps, pieceId: string, opts: { kept?: boolean } = {}): Promise<number> {
  return deps.store.transaction(async (tx) => {
    const piece = await tx.piece(pieceId)
    if (!piece) return 0

    const changes: { working: Working; parent: Version | undefined }[] = []
    for (const working of await tx.workingOf(pieceId)) {
      const parent = working.baseVersionId ? await tx.version(working.baseVersionId) : undefined
      const unchanged = parent ? parent.content === working.content : working.content === ''
      if (!unchanged || (opts.kept && parent)) changes.push({ working, parent })
    }
    const outline = piece.outlineId ? await tx.outline(piece.outlineId) : undefined
    const outlineChanged = !outline || outline.title !== piece.title || !sameSections(outline.sections, piece.sections)
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
        sections: piece.sections.map((s) => ({ ...s })),
      }
      await tx.putOutline(next)
      outlineId = next.id
    }
    await tx.putPiece({ ...piece, outlineId })
    return changes.length + (outlineChanged ? 1 : 0)
  })
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
    for (const s of piece.sections) sections.push({ ...s, content: await currentText(tx, s.sectionId) })
    return { piece, sections }
  })
}

async function currentText(tx: Tx, sectionId: string): Promise<string> {
  const working = await tx.working(sectionId)
  if (working) return working.content
  return latest(await tx.versionsOf(sectionId))?.content ?? ''
}

/** Pieces in the library, most recent first. Put-away pieces wait elsewhere (0006). */
export async function library(deps: Pick<Deps, 'store'>): Promise<Piece[]> {
  const pieces = await deps.store.transaction((tx) => tx.pieces())
  return pieces.filter((p) => p.putAwayAt === undefined).sort((a, b) => b.updatedAt - a.updatedAt)
}

/** A section's versions, oldest first, ordered by their parents and never by the clock. */
export function history(versions: Version[]): Version[] {
  return [...versions].sort((a, b) => a.seq - b.seq)
}

export function latest(versions: Version[]): Version | undefined {
  return history(versions).at(-1)
}

function sameSections(a: Piece['sections'], b: Piece['sections']): boolean {
  return a.length === b.length && a.every((s, i) => s.sectionId === b[i]!.sectionId && s.title === b[i]!.title)
}
