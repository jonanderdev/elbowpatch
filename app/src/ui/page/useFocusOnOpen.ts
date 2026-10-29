import { useEffect, useRef } from 'react'
import type { Opened } from './fields'
import type { PageRefs } from './usePageSession'
import type { PageSession } from './session'

interface Options {
  opened: Opened
  session: PageSession | null
  refs: PageRefs
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
export function useFocusOnOpen({ opened, session, refs, covered, readOnly, titlePage, titleEditable }: Options) {
  const firstCover = useRef(true)
  const writingWhenCovered = useRef(false)
  // The caret was placed for this opening (the page is remounted per section, so once per mount).
  const placed = useRef(false)

  useEffect(() => {
    // Nothing to do until the section's session exists (just after the first render).
    if (!session) return
    const first = firstCover.current
    firstCover.current = false
    const desktop = matchMedia('(pointer: fine)').matches
    if (covered) {
      // At launch the last piece is laid out behind the library: nothing to save yet, and its place must stay.
      if (!first) void session.saving.flush()
      return
    }
    if (readOnly) return
    if (writingWhenCovered.current) {
      writingWhenCovered.current = false
      if (desktop) session.editor.focus()
      return
    }
    if (placed.current) return
    placed.current = true
    if (opened.fresh) {
      if (titlePage) {
        const name = refs.bookTitle.current
        name?.focus()
        // A new journal is called "Journal": selected, so typing names it.
        if (name && opened.piece.kind === 'journal') getSelection()?.selectAllChildren(name)
      } else if (titleEditable) refs.title.current?.focus()
      else session.editor.focus()
      return
    }
    const place = opened.piece.place
    if (place?.caret && place.sectionId === opened.sectionId && desktop) session.editor.focus()
    // On covering and uncovering, and once the session for a new section exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covered, readOnly, session])

  return {
    leaving() {
      writingWhenCovered.current = !!session?.editor.view.hasFocus()
    },
  }
}
