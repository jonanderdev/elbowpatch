import { useLayoutEffect } from 'react'
import { showCaret } from '../../page/caret'
import type { Editor } from '../../page/editor'
import type { Pager } from '../../page/pager'
import { restorePlace } from '../../page/place'
import type { Opened } from './fields'

/**
 * Opens the section at the writer's place (DESIGN.md, Behaviour), before the first paint, so it
 * never shows a frame of page 1 first; again once the fonts are in, since they move the breaks.
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
    p.measure()
    p.turnTo(1)
  }

  // Once, when the editor and the pager exist; the page is remounted for each section.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `opened` is the section this page was made for.
  useLayoutEffect(() => {
    if (!editor || !pager) return
    const { place } = opened.piece
    restorePlace(editor.view, place, opened.sectionId)
    const here = place?.sectionId === opened.sectionId
    if (!here && !overTitlePage) return
    const open = (): void => {
      if (here) showCaret(editor.view, pager, true)
      toToday(pager)
    }
    open()
    let alive = true
    void document.fonts.ready.then(() => alive && open())
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
