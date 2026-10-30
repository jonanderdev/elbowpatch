import type { Piece } from '../../domain/model'
import { type Deps, rename, renameSection, setSubtitle, write } from '../../domain/pieces'
import type { WriterLock } from '../../domain/ports'
import { unsaved } from '../stores/unsaved'

/**
 * Words the last session could not store before it closed (see page/saving.ts, journal)
 * go into the database first, under the piece's lock (one writer, 0010). An
 * entry already stored is dropped. One older than its section's stored copy
 * was overtaken elsewhere: it is not applied, and waits for Save a copy.
 */
export async function replayJournal(deps: Deps, lock: WriterLock): Promise<void> {
  for (const u of unsaved.all()) {
    const stored = await deps.store.transaction(async (tx) => ({ working: await tx.working(u.sectionId), piece: await tx.piece(u.pieceId) }))
    const sameText = stored.working?.content === u.markdown
    const sameTitle =
      (u.title === null || titleIn(stored.piece, u.sectionId) === u.title) &&
      (!u.bookTitle || stored.piece?.title === u.bookTitle) &&
      (u.subtitle == null || (stored.piece?.subtitle ?? '') === u.subtitle)
    if (sameText && sameTitle) {
      unsaved.saved(u.sectionId)
      continue
    }
    if (stored.working && stored.working.updatedAt > u.at) continue
    const held = await lock.hold(u.pieceId, async () => {})
    if (!held) continue // another window writes it now; the words wait for Save a copy
    try {
      // The journal's piece is only a draft: write() keeps what is stored and adds a section it lacks.
      await write(deps, u.piece, u.sectionId, u.markdown)
      // A title only if it changed here and nothing renamed the piece since.
      if (!stored.piece || stored.piece.updatedAt <= u.at) {
        if (u.title !== null) {
          if (u.piece.kind === 'essay') await rename(deps, u.piece, u.title)
          else await renameSection(deps, u.piece, u.sectionId, u.title)
        }
        if (u.bookTitle) await rename(deps, u.piece, u.bookTitle)
        if (u.subtitle != null) await setSubtitle(deps, u.piece, u.subtitle)
      }
      unsaved.saved(u.sectionId)
    } finally {
      held.release()
    }
  }
}

function titleIn(piece: Piece | undefined, sectionId: string): string | undefined {
  if (!piece) return undefined
  return piece.kind === 'essay' ? piece.title : piece.sections.find((s) => s.sectionId === sectionId)?.title
}
