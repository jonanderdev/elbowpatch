import { useRef } from 'react'
import type { Piece } from '../../domain/model'
import { type Deps, type Rejoined, rejoinChapter } from '../../domain/pieces'
import type { Editor } from '../../page/editor'
import { forgetSplit, type Split, splitOf } from '../../page/undoMemory'
import { settled } from '../app/settled'
import type { Saving } from './saving'
import { raiseKeyboard } from './useFocusOnOpen'

interface Options {
  deps: Deps
  pieceId: string
  sectionId: string
  /** A book, in the window that writes it. */
  writes: boolean
  /** The chapter right before this one, as the book stands now. */
  chapterBefore(): string | undefined
  editor: Editor | null
  saving: Saving | null
  keyboard: boolean
  /** The last page's closing save: the chapter it held must be stored before words join it. */
  closingRef: { current: Promise<void> }
  onRejoined(piece: Piece, sectionId: string, content: string): void
}

/**
 * Undo past the start of a chapter born of a split (0003). The function it returns is called when undo
 * has no step left, in the text or in the title; true when that puts the chapter back onto the one before it.
 */
export function useRejoin({ deps, pieceId, sectionId, writes, chapterBefore, editor, saving, keyboard, closingRef, onRejoined }: Options): () => boolean {
  /** A rejoin is running: a second undo waits for nothing and does nothing. */
  const running = useRef(false)

  async function rejoin(split: Split): Promise<void> {
    if (!editor || !saving) return
    running.current = true
    const inText = editor.view.hasFocus()
    // From here to the end the text cannot change, so what is stored stays what goes back.
    editor.hold(true)
    if (keyboard) raiseKeyboard()
    await settled(closingRef.current)
    let back: Rejoined | undefined
    const done = await saving.split(async (whole) => {
      back = await rejoinChapter(deps, pieceId, { sectionId, into: split.into, whole, seam: split.seam })
      return back.piece
    })
    if (done && back) {
      forgetSplit(sectionId)
      onRejoined(back.piece, back.sectionId, back.content)
      return
    }
    // The text stays as it is, and the writer stays in it.
    editor.hold(false)
    running.current = false
    if (inText) editor.focus()
  }

  return () => {
    if (!writes || !editor || !saving) return false
    const split = splitOf(sectionId, editor.markdown())
    // A chapter added between them since: the words have nowhere that is theirs to go back to.
    if (!split || chapterBefore() !== split.into) return false
    if (!running.current) void rejoin(split)
    return true
  }
}
