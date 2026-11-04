import { useLayoutEffect } from 'react'
import { caretToEnd, showCaret, toLastPage, toOpeningPage } from '../../page/caret'
import type { Editor } from '../../page/editor'
import type { Pager } from '../../page/pager'
import { restorePlace } from '../../page/place'
import type { Opened } from './fields'

/**
 * Opens the section at the writer's place (DESIGN.md, Behaviour), before the first paint, so it
 * never shows a frame of page 1 first; again once the fonts are in, since they move the breaks.
 * A chapter chosen in Contents opens at its opening page instead; one turned to, at the page next to
 * the chapter left, with the caret at the end of its text, as any turn leaves it. One that took a
 * chapter back opens at the join, which its stored place holds.
 */
export function useOpenAtPlace(editor: Editor | null, pager: Pager | null, opened: Opened): void {
  // Once, when the editor and the pager exist; the page is remounted for each section.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `opened` is the section this page was made for.
  useLayoutEffect(() => {
    if (!editor || !pager) return
    const { place } = opened.piece
    // Not a turn: nothing says it.
    const show = (): void => {
      pager.opening = true
      showCaret(editor.view, pager, true)
      pager.opening = false
    }
    if (opened.at === 'join') {
      restorePlace(editor.view, place, opened.sectionId)
      show()
    } else if (opened.at === 'last') toLastPage(editor.view, pager)
    else if (opened.at) {
      toOpeningPage(editor.view, pager)
      if (opened.at === 'turned-on') caretToEnd(editor.view, pager.viewport)
    } else {
      restorePlace(editor.view, place, opened.sectionId)
      if (place?.sectionId !== opened.sectionId) return
      showCaret(editor.view, pager, true)
    }
    let alive = true
    void document.fonts.ready.then(() => alive && show())
    return () => {
      alive = false
    }
  }, [editor, pager])
}
