// Looking back (DESIGN.md, The Time Machine; docs/decisions/0005, 0008): the history as the writer walks
// it. It knows the Store and the product's words, and nothing of the page.

import type { Kind, Outline, OutlineSection, Piece } from './model'
import { type Deps, history, outlineAt } from './pieces'
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

/** What is needed to tell the sections a piece listed at any time: the piece as stored, and its outlines. */
export interface Listing {
  piece: Piece
  outlines: Outline[]
}

/** The piece's listings, read once: they are small, and the sections themselves are read only as they are reached. */
export function listingOf(deps: Pick<Deps, 'store'>, pieceId: string): Promise<Listing | undefined> {
  return deps.store.transaction(async (tx) => {
    const piece = await tx.piece(pieceId)
    if (!piece) return undefined
    return { piece, outlines: [...(await tx.outlinesOf(pieceId))].sort((a, b) => a.seq - b.seq) }
  })
}

/**
 * The sections the piece listed at a time, in reading order (0005): the outline in force then, so a
 * chapter added since is absent and one removed since is there. Before its first outline, the oldest;
 * after its last, the piece as it stands, which a window that does not write may know better.
 * A journal's days run oldest first, whatever order they were stored in.
 */
export function sectionsAt(listing: Listing, at: number): OutlineSection[] {
  const { piece, outlines } = listing
  const newest = outlines.at(-1)
  const sections = !newest || at > newest.createdAt ? piece.sections : (outlineAt(outlines, at) ?? outlines[0]!).sections
  return piece.kind === 'journal' ? [...sections].sort((a, b) => a.title.localeCompare(b.title)) : sections
}

/** The section a turn reaches from this one, on (1) or back (-1), or none past the ends or from one not listed. */
export function sectionBeyond(sections: OutlineSection[], sectionId: string, dir: 1 | -1): string | undefined {
  const here = sections.findIndex((s) => s.sectionId === sectionId)
  return here < 0 ? undefined : sections[here + dir]?.sectionId
}

/**
 * The moment the Time Machine opens on: the most recent that differs from now, or none, which is
 * *Nothing earlier*. Each moment differs from the one after it, so that is the one before now.
 */
export function momentToOpen(moments: Moment[]): Moment | undefined {
  return moments.at(-2)
}
