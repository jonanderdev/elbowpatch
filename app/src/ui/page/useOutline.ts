import { useCallback, useState } from 'react'
import type { Piece } from '../../domain/model'
import type { Deps } from '../../domain/pieces'

export interface LiveOutline {
  /** The piece as last stored: its chapters, their titles and their page counts. */
  outline: Piece
  /** A save reported the piece. */
  stored(piece: Piece): void
  /** Reads it again: page counts are kept without a report, and another window may be writing the book. */
  reread(): void
}

/** The open piece's outline as it stands now, for Contents: the piece the page opened with is only a snapshot. */
export function useOutline(deps: Deps, piece: Piece): LiveOutline {
  const [outline, stored] = useState(piece)
  const reread = useCallback(() => {
    void deps.store
      .transaction((tx) => tx.piece(piece.id))
      .then((found) => {
        if (found) stored(found)
      })
      .catch(() => {})
  }, [deps, piece.id])
  return { outline, stored, reread }
}
