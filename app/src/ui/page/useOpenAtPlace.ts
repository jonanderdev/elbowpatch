import { useLayoutEffect } from 'react'
import { showCaret } from '../../page/caret'
import type { Editor } from '../../page/editor'
import type { Pager } from '../../page/pager'
import { restorePlace } from '../../page/place'
import type { Opened } from './fields'

/**
 * Opens the section at the writer's place (DESIGN.md, Behaviour), before the first paint, so it
 * never shows a frame of page 1 first; again once the fonts are in, since they move the breaks.
 */
export function useOpenAtPlace(editor: Editor | null, pager: Pager | null, opened: Opened): void {
  useLayoutEffect(() => {
    if (!editor || !pager) return
    const { place } = opened.piece
    restorePlace(editor.view, place, opened.sectionId)
    if (place?.sectionId !== opened.sectionId) return
    showCaret(editor.view, pager, true)
    let alive = true
    void document.fonts.ready.then(() => alive && showCaret(editor.view, pager, true))
    return () => {
      alive = false
    }
    // Once, when the editor and the pager exist; the page is remounted for each section.
    // biome-ignore lint/correctness/useExhaustiveDependencies: `opened` is the section this page was made for.
  }, [editor, pager])
}
