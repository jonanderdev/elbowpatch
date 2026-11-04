import { useCallback, useState } from 'react'
import type { Piece } from '../../domain/model'
import { type Deps, withDraft } from '../../domain/pieces'

export interface LiveOutline {
  /** The piece as last stored (its chapters, their titles and their page counts), with the open chapter if it is still a draft. */
  outline: Piece
  /** A save reported the piece. */
  stored(piece: Piece): void
  /** Reads it again: page counts are kept without a report, and another window may be writing the book. */
  reread(): void
}

/** The open piece's outline as it stands now, for Contents: the piece the page opened with is only a snapshot. */
export function useOutline(deps: Deps, piece: Piece, sectionId: string): LiveOutline {
  const [last, stored] = useState(piece)
  const reread = useCallback(() => {
    void deps.store
      .transaction((tx) => tx.piece(piece.id))
      .then((found) => {
        if (found) stored(found)
      })
      .catch(() => {})
  }, [deps, piece.id])
  return { outline: withDraft(last, piece, sectionId), stored, reread }
}
