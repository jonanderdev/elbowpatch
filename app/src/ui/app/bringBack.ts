import { type BringBack, type BroughtBack, bringBack } from '../../domain/lookBack'
import type { Piece } from '../../domain/model'
import type { Deps } from '../../domain/pieces'
import { forgetUndo } from '../../page/undoMemory'
import type { Saving } from '../page/saving'
import { unsaved } from '../stores/unsaved'

/** Where the app stands to bring a section back. */
export interface BringBackSeams {
  deps: Deps
  pieceId: string
  /** The open page's reshape: it stores what the page holds, waits for any page still closing, and seals the page while the change runs. */
  reshape(): Saving['reshape'] | null
  /** Whether this window holds the piece right now, asked inside the transaction. */
  writes(): boolean
}

/** A bring back that did not happen. Nothing was changed, and the page goes on as before. */
export class NotBroughtBack extends Error {}

/** One section at one moment, as the Time Machine shows it. */
export type MomentOf = Pick<BringBack, 'sectionId' | 'at' | 'content'>

/**
 * Brings a section back to a moment, by its id (0005, 0008). The order is what protects the words (#77): the page
 * stores what it holds and is sealed first, so its closing save can never write over what came back; then one
 * transaction brings the text back; the app reopens the page on the result.
 *
 * The result is the section as it now stands, for the page to open on. Null when the section already held that text:
 * nothing was written, and the page goes on. Throws `NotBroughtBack`, with everything as it was and the page saving
 * again, when the words could not be stored or the transaction refused or failed.
 */
export async function bringSectionBack(seams: BringBackSeams, moment: MomentOf): Promise<BroughtBack | null> {
  const reshape = seams.reshape()
  if (!reshape) throw new NotBroughtBack('No page holds the section')
  let result: BroughtBack | undefined
  let unchanged = false
  await reshape(async (): Promise<Piece | undefined> => {
    try {
      // Read here, past the waits: a closing save that failed keeps its words in the journal as it ends.
      const held = unsaved.get(moment.sectionId)
      const done = await bringBack(seams.deps, seams.pieceId, {
        ...moment,
        ...(held ? { kept: { at: held.at, content: held.markdown } } : {}),
        writes: seams.writes,
      })
      if (!done.changed) unchanged = true
      else result = done
      return done.changed ? done.piece : undefined
    } catch {
      // Said once, by the caller: the page must not take it for a failed save.
      return undefined
    }
  })
  if (result) {
    // The text it replaced is a moment, not an undo step (0003).
    forgetUndo(moment.sectionId)
    return result
  }
  if (unchanged) return null
  throw new NotBroughtBack('Not brought back')
}
