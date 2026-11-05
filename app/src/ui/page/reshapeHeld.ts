import type { Piece } from '../../domain/model'
import type { Editor } from '../../page/editor'
import type { Saving } from './saving'
import { raiseKeyboard } from './useFocusOnOpen'

/**
 * Reshapes the section with the text held still, so what is stored stays what the page read. False, with the
 * text let go again, when it was refused; on true the page is about to close, and stays held.
 */
export async function reshapeHeld(editor: Editor, saving: Saving, keyboard: boolean, change: (whole: string) => Promise<Piece>): Promise<boolean> {
  editor.hold(true)
  if (keyboard) raiseKeyboard()
  const done = await saving.reshape(change)
  if (!done) editor.hold(false)
  return done
}
