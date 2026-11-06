import type { EditorView } from 'prosemirror-view'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { selectionBox } from '../../page/editor'
import { type Passage, passageOf } from '../../page/passage'

/** Words selected in old text, and where they are on the page in view. */
export interface SelectedPart {
  passage: Passage
  rect: DOMRect
}

/**
 * The words selected in the old text, for the part menu. `follow` is told when the selection changes. `look`
 * reads where the words are again, for when the page moves under them: the menu follows them when the window
 * scrolls or resizes by itself, and the screen calls `look` when the page turns.
 */
export function usePart(viewport: RefObject<HTMLDivElement | null>): { part: SelectedPart | null; follow(view: EditorView): void; look(): void } {
  const [part, setPart] = useState<SelectedPart | null>(null)
  /** The old text's view, to read the words from when the page moves under them. */
  const reading = useRef<EditorView | null>(null)
  /** Whether the menu is up. */
  const shown = useRef(false)

  const follow = useCallback(
    (view: EditorView): void => {
      reading.current = view
      const { from, to } = view.state.selection
      const rect = selectionBox(view, viewport.current, true)
      const passage = rect ? passageOf(view.state.doc, from, to) : null
      shown.current = !!(rect && passage)
      setPart(rect && passage ? { passage, rect } : null)
    },
    [viewport],
  )

  const look = useCallback((): void => {
    if (reading.current && !reading.current.state.selection.empty) follow(reading.current)
  }, [follow])

  // The selection leaving the old text altogether (a tap on the margin, on the title) is not heard by the editor's
  // view, which ignores a selection that is no longer inside it. And the same words selected again are no change
  // to its state, so it does not say so either: this does.
  const heard = useCallback((): void => {
    const view = reading.current
    if (!view) return
    const there = document.getSelection()?.anchorNode
    if (!there || !view.dom.contains(there)) {
      shown.current = false
      setPart(null)
    } else if (!shown.current && !view.state.selection.empty) follow(view)
  }, [follow])

  useEffect(() => {
    window.addEventListener('resize', look)
    window.addEventListener('scroll', look, true)
    document.addEventListener('selectionchange', heard)
    return () => {
      window.removeEventListener('resize', look)
      window.removeEventListener('scroll', look, true)
      document.removeEventListener('selectionchange', heard)
    }
  }, [look, heard])

  return { part, follow, look }
}
