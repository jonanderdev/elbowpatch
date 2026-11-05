import { useCallback, useEffect, useState } from 'react'
import type { Piece } from '../../domain/model'
import { type Deps, storedPiece, withOpenSection } from '../../domain/pieces'

export interface LiveOutline {
  /** The piece as last stored (its chapters, their titles and their page counts), with the open chapter if it is not stored yet. */
  outline: Piece
  /** A save reported the piece. */
  stored(piece: Piece): void
  /** Reads it again: page counts are kept without a report, and another window may be writing the book. */
  reread(): void
}

/**
 * The open piece's outline as it stands now, for Contents and the book's numbers: the piece the page opened
 * with is only a snapshot. `counted` changes when a chapter's count was measured or forgotten.
 */
export function useOutline(deps: Deps, piece: Piece, sectionId: string, counted: number): LiveOutline {
  const [last, stored] = useState(piece)
  const reread = useCallback(() => {
    void storedPiece(deps, piece.id)
      .then((found) => {
        if (found) stored(found)
      })
      .catch(() => {})
  }, [deps, piece.id])
  // Counts kept or forgotten from outside the page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `counted` is the trigger.
  useEffect(reread, [reread, counted])
  return { outline: withOpenSection(last, piece, sectionId), stored, reread }
}
