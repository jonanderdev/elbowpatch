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
 *
 * A journal opened again lands on today, never on its title page (DESIGN.md, The journal): not when
 * it was left there, not when a place kept at the day's very start is drawn at the title page's end,
 * and not when the library uncovers it as it was left. A new journal stays there, to be named.
 */
export function useOpenAtPlace(editor: Editor | null, pager: Pager | null, opened: Opened, covered: boolean): void {
  const { kind, sections } = opened.piece
  const overTitlePage = kind === 'journal' && !opened.fresh && sections[0]?.sectionId === opened.sectionId
  const toToday = (p: Pager): void => {
    if (!overTitlePage || p.page !== 0) return
    p.opening = true
    p.measure()
    p.turnTo(1)
    p.opening = false
  }

  // Once, when the editor and the pager exist; the page is remounted for each section.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `opened` is the section this page was made for.
  useLayoutEffect(() => {
    if (!editor || !pager) return
    const { place } = opened.piece
    const here = place?.sectionId === opened.sectionId
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
      if (!here && !overTitlePage) return
      if (here) showCaret(editor.view, pager, true)
      toToday(pager)
    }
    let alive = true
    void document.fonts.ready.then(() => {
      if (!alive) return
      if (opened.at || here) show()
      toToday(pager)
    })
    return () => {
      alive = false
    }
  }, [editor, pager])

  // The library uncovering the page it was over, as it was left.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `toToday` reads only what this page was made for.
  useLayoutEffect(() => {
    if (!covered && pager) toToday(pager)
  }, [covered, pager])
}
