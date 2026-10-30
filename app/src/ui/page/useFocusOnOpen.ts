import { useEffect, useRef } from 'react'
import type { Editor } from '../../page/editor'
import type { Opened, TitleRefs } from './fields'
import type { Saving } from './saving'

interface Options {
  opened: Opened
  editor: Editor | null
  saving: Saving | null
  titles: TitleRefs
  /** The library shows over the page. */
  covered: boolean
  readOnly: boolean
  titlePage: boolean
  titleEditable: boolean
}

/**
 * Where the caret goes when the page shows (DESIGN.md, Behaviour):
 * - a new piece: its title (its name on a title page; the text, in a journal);
 * - a piece left while writing, reopened or back from the library: the caret where it was;
 * - a piece left while reading: nowhere, the page opens on their place.
 * On a phone the caret waits for a tap, so the keyboard does not cover the page unasked.
 *
 * Going to the library keeps a moment. Returns `leaving()`, for the Library button to call first:
 * it remembers whether the writer was writing, since the library takes the focus away.
 */
export function useFocusOnOpen({ opened, editor, saving, titles, covered, readOnly, titlePage, titleEditable }: Options): { leaving(): void } {
  const firstCover = useRef(true)
  const writingWhenCovered = useRef(false)
  // The caret was placed for this opening (the page is remounted per section, so once per mount).
  const placed = useRef(false)

  // On covering and uncovering, and once the editor and saving exist.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the rest is this page's, fixed while it is open.
  useEffect(() => {
    // Nothing to do until the section's editor and saving exist (just after the first render).
    if (!editor || !saving) return
    const first = firstCover.current
    firstCover.current = false
    const desktop = matchMedia('(pointer: fine)').matches
    if (covered) {
      // At launch the last piece is laid out behind the library: nothing to save yet, and its place must stay.
      if (!first) void saving.flush()
      return
    }
    if (readOnly) return
    if (writingWhenCovered.current) {
      writingWhenCovered.current = false
      if (desktop) editor.focus()
      return
    }
    if (placed.current) return
    placed.current = true
    if (opened.fresh) {
      if (titlePage) {
        const name = titles.bookTitle.current
        name?.focus()
        // A new journal is called "Journal": selected, so typing names it.
        if (name && opened.piece.kind === 'journal') getSelection()?.selectAllChildren(name)
      } else if (titleEditable) titles.title.current?.focus()
      else editor.focus()
      return
    }
    const place = opened.piece.place
    if (place?.caret && place.sectionId === opened.sectionId && desktop) editor.focus()
  }, [covered, readOnly, editor, saving])

  return {
    leaving() {
      writingWhenCovered.current = !!editor?.view.hasFocus()
    },
  }
}
