// Looking back (DESIGN.md, The Time Machine; docs/decisions/0005, 0008): the history as the writer walks
// it. It knows the Store and the product's words, and nothing of the page.

import { countWords } from './markdown'
import type { Kind, Outline, OutlineSection, Piece } from './model'
import { current, type Deps, history, latest, momentIn, openingWords, outlineAt, withoutCounts } from './pieces'
import { dayTitle } from './words'

/** One tick on the tape: a point where the section differs from the tick before it, in its text or its title. */
export interface Moment {
  /** When the section first stood like this. */
  at: number
  content: string
  /** The section's title as shown then: an essay's own, a chapter's, a journal day's date. */
  title: string
  /** The writer chose to keep it, here or in a repeat folded into it. */
  kept: boolean
}

/** The section's title in a piece or an outline, or undefined if a book or journal does not list it there. */
function titleIn(kind: Kind, listing: { title: string; sections: OutlineSection[] }, sectionId: string): string | undefined {
  if (kind === 'essay') return listing.title
  const title = listing.sections.find((s) => s.sectionId === sectionId)?.title
  if (title === undefined) return undefined
  return kind === 'journal' ? dayTitle(title) : title
}

/**
 * A section's moments, oldest first; the last is now. Versions come in `seq` order, and time only picks a
 * point on that chain, which never goes backwards (0005). Only side-by-side repeats fold: text that
 * comes back later is a moment of its own. Works for any section by id, a removed chapter's too.
 *
 * Now is the working copy. Opening the Time Machine takes a moment first, so it is normally the last
 * version; in a window that does not write there may be words and a title no moment holds, and they
 * stand as a last moment, without anything being written.
 */
export function momentsOf(deps: Pick<Deps, 'store'>, pieceId: string, sectionId: string): Promise<Moment[]> {
  return deps.store.transaction(async (tx) => {
    const piece = await tx.piece(pieceId)
    if (!piece) return []
    const versions = history(await tx.versionsOf(sectionId))
    const outlines = [...(await tx.outlinesOf(pieceId))].sort((a, b) => a.seq - b.seq)
    const working = await tx.working(sectionId)
    const moments = walk(piece.kind, versions, outlines, sectionId)
    if (!working && moments.length === 0) return []

    const last = moments.at(-1)
    const content = working?.content ?? last?.content ?? ''
    const title = titleIn(piece.kind, piece, sectionId) ?? last?.title ?? ''
    if (last?.content === content && last.title === title) return moments
    const at = Math.max((last?.at ?? 0) + 1, working?.updatedAt ?? 0, piece.updatedAt)
    return [...moments, { at, content, title, kept: false }]
  })
}

/** The moments on the chains as stored: each time the versions or an outline listing the section changed, folded. */
function walk(kind: Kind, versions: { createdAt: number; content: string; kept?: boolean }[], outlines: Outline[], sectionId: string): Moment[] {
  const listing = outlines.filter((o) => titleIn(kind, o, sectionId) !== undefined)
  const times = [...new Set([...versions.map((v) => v.createdAt), ...listing.map((o) => o.createdAt)])].sort((a, b) => a - b)
  const moments: Moment[] = []
  let next = 0
  let content = ''
  // Thinning can take the outline a section first stood in: until one lists it, the first that does gives its title.
  let title = listing[0] ? (titleIn(kind, listing[0], sectionId) ?? '') : ''
  for (const at of times) {
    let kept = false
    for (; next < versions.length && versions[next]!.createdAt <= at; next++) {
      content = versions[next]!.content
      kept ||= !!versions[next]!.kept
    }
    const outline = outlineAt(outlines, at)
    title = (outline && titleIn(kind, outline, sectionId)) ?? title
    const last = moments.at(-1)
    if (last?.content === content && last.title === title) last.kept ||= kept
    else moments.push({ at, content, title, kept })
  }
  return moments
}

/**
 * The moment the Time Machine opens on: the most recent that differs from now, or none, which is
 * *Nothing earlier*. Each moment differs from the one after it, so that is the one before now.
 */
export function momentToOpen(moments: Moment[]): Moment | undefined {
  return moments.at(-2)
}

// ——— Bring back ———

/** What a bring back asks for: a moment as the writer saw it, of one section. */
export interface BringBack {
  sectionId: string
  /** The moment on screen: when it stands, and the words the writer saw there. */
  at: number
  content: string
  /** Words held for this section outside the database (the unsaved journal), if any. */
  kept?: { at: number; content: string }
  /** Whether this window still writes the piece. Asked inside the transaction, before anything is written. */
  writes(): boolean
}

/** The section as it stands once brought back, at hand for the page to open on. */
export interface BroughtBack {
  piece: Piece
  sectionId: string
  content: string
  /** When the section's text was stored: kept words older than this never start the page. */
  updatedAt: number
  /** False when the section already held that text, and nothing was written. */
  changed: boolean
}

export type Refusal = 'not-writing' | 'left' | 'gone' | 'unstored'

/** A bring back that did not run, with nothing written. */
export class BringBackRefused extends Error {
  constructor(readonly reason: Refusal) {
    super(`Not brought back: ${reason}`)
  }
}

/**
 * Makes a section's text at a moment its current text (0005, 0008), in one transaction, or not at all:
 * - the text it replaces is written first as a version marked `beforeBringBack`, even if it matches the last
 *   one, with the stamp of any moment (`momentIn`), so it and the outline in force then are never thinned;
 * - then the old text as a new version, stamped later, and the working copy points at it;
 * - the section's word count follows, its page counts are dropped, and a place in it goes to its opening.
 * Only that section's text changes: its title and the rest of the piece stay. Running it again writes
 * nothing, for the section then already holds that text.
 *
 * Refused, with nothing written: when this window no longer writes the piece, when the section is not in the
 * piece, when the moment has gone (thinning in another window took it, so what the writer saw is not what is
 * stored), and when words held for the section outside the database are newer than what is stored, which a
 * brought-back text stamped later would shut out.
 */
export function bringBack(deps: Deps, pieceId: string, request: BringBack): Promise<BroughtBack> {
  return deps.store.transaction(async (tx) => {
    const { sectionId, at, content, kept } = request
    if (!request.writes()) throw new BringBackRefused('not-writing')
    const found = await tx.piece(pieceId)
    if (!found?.sections.some((s) => s.sectionId === sectionId)) throw new BringBackRefused('left')
    const now = await current(tx, sectionId)
    // The versions as stored now, not as the writer saw them: the moment must still stand as it was seen.
    const then = history((await tx.versionsOf(sectionId)).filter((v) => v.createdAt <= at)).at(-1)
    if (then?.content !== content) {
      if (now.content === content) return { piece: found, sectionId, content, updatedAt: now.updatedAt, changed: false }
      throw new BringBackRefused('gone')
    }
    if (now.content === content) return { piece: found, sectionId, content, updatedAt: now.updatedAt, changed: false }
    if (kept && kept.at > now.updatedAt && kept.content !== now.content) throw new BringBackRefused('unstored')

    // A section with versions and no working copy: its text is its latest version, which the moment below needs to hold.
    const head = latest(await tx.versionsOf(sectionId))
    if (!(await tx.working(sectionId))) {
      await tx.putWorking({ sectionId, pieceId, content: head?.content ?? '', baseVersionId: head?.id ?? null, updatedAt: head?.createdAt ?? 0 })
    }
    // The text being replaced, marked. The outline changes only in a later moment, as removing a chapter does (0005).
    await momentIn(tx, deps, pieceId, { beforeBringBack: sectionId })
    const piece = (await tx.piece(pieceId))!
    const working = (await tx.working(sectionId))!
    // Never earlier than what the working copy was stamped: a journal entry overtaken by it must stay overtaken (ruling 8).
    const stamp = Math.max(deps.clock.now(), now.updatedAt + 1)
    await tx.putWorking({ ...working, content, updatedAt: stamp })
    const place: Piece['place'] =
      piece.place?.sectionId === sectionId
        ? { sectionId, paragraph: 0, offset: 0, snippet: openingWords(content), ...(piece.sections[0]?.sectionId === sectionId ? {} : { page: 1 }), caret: false, at: stamp }
        : piece.place
    await tx.putPiece({
      ...piece,
      words: { ...piece.words, [sectionId]: countWords(content) },
      pages: withoutCounts(piece.pages, [sectionId]),
      ...(place ? { place } : {}),
      updatedAt: stamp,
    })
    // The old text as a version of its own, stamped later than the marked one by the same rule.
    await momentIn(tx, deps, pieceId)
    // The version was stamped by the moment rule, which can be later than the clock: the working copy is never earlier than it.
    const version = latest(await tx.versionsOf(sectionId))
    const updatedAt = Math.max(stamp, version?.createdAt ?? 0)
    if (updatedAt !== stamp) await tx.putWorking({ ...(await tx.working(sectionId))!, updatedAt })
    return { piece: (await tx.piece(pieceId))!, sectionId, content, updatedAt, changed: true }
  })
}
