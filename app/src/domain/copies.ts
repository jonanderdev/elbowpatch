// Keeping a copy (DESIGN.md, The Time Machine; docs/decisions/0008): a section as it stood at a moment,
// made a new essay of its own. The piece it came from is only read.

import type { Moment } from './lookBack'
import { countWords } from './markdown'
import type { Outline, Piece, Version, Working } from './model'
import { type Deps, newPiece } from './pieces'

const UNTITLED = 'Untitled'

/** A name's text with nothing in it that a pattern would read as more than words. */
const plain = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * "Salt, draft 2": the name, then the first number from 2 that goes past every copy of it already
 * in use, put-away pieces included, so no two pieces share a name.
 */
function copyName(title: string, inUse: string[]): string {
  const base = title.trim() || UNTITLED
  const drafts = new RegExp(`^${plain(base)}, draft (\\d+)$`)
  const taken = inUse.map((name) => drafts.exec(name.trim())?.[1]).filter((n): n is string => n !== undefined)
  return `${base}, draft ${Math.max(1, ...taken.map(Number)) + 1}`
}

/**
 * Makes the moment's section a new essay: the piece, its outline, its first version and its working
 * copy, in one transaction, or none of it. The moment's title names it and its text fills it. Its
 * history starts now, with today's date, and keeps no link back (0008). The source piece's language
 * goes with it. Nothing in the source is written, so it needs no lock on it.
 */
export function keepCopy(deps: Deps, pieceId: string, from: Pick<Moment, 'title' | 'content'>): Promise<Piece> {
  return deps.store.transaction(async (tx) => {
    const source = await tx.piece(pieceId)
    if (!source) throw new Error('The piece is not here')
    const title = copyName(
      from.title,
      (await tx.pieces()).map((p) => p.title),
    )

    const now = deps.clock.now()
    const blank = newPiece(deps, 'essay', source.lang)
    const sectionId = blank.sections[0]!.sectionId
    const outline: Outline = { id: deps.ids.next(), pieceId: blank.id, parentId: null, seq: 1, createdAt: now, title, sections: blank.sections }
    const version: Version = {
      id: deps.ids.next(),
      pieceId: blank.id,
      sectionId,
      parentId: null,
      seq: 1,
      createdAt: now,
      content: from.content,
    }
    const working: Working = { sectionId, pieceId: blank.id, content: from.content, baseVersionId: version.id, updatedAt: now }
    const piece: Piece = { ...blank, title, outlineId: outline.id, words: { [sectionId]: countWords(from.content) } }

    await tx.putPiece(piece)
    await tx.putOutline(outline)
    await tx.putVersion(version)
    await tx.putWorking(working)
    return piece
  })
}
