// The writer's place in a section (DESIGN.md, Behaviour: "Your place travels with the piece"):
// the caret if they were writing, otherwise the first line on screen, kept as a paragraph, an
// offset and its opening words, so it survives edits made elsewhere.

import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { Place } from '../domain/model'

/** Where the writer is: the caret if writing, else the first line on screen. */
export function placeOf(view: EditorView, sectionId: string, page: number, viewport: HTMLElement | null): Place | undefined {
  let pos = view.state.selection.head
  if (!view.hasFocus() && viewport) {
    const r = viewport.getBoundingClientRect()
    pos = view.posAtCoords({ left: r.left + 2, top: r.top + 2 })?.pos ?? pos
  }
  const $head = view.state.doc.resolve(pos)
  const paragraph = $head.index(0)
  const node = view.state.doc.maybeChild(paragraph)
  if (!node) return undefined
  return {
    sectionId,
    paragraph,
    offset: $head.parentOffset,
    snippet: node.textContent.slice(0, 160),
    page: page + 1,
    caret: view.hasFocus(),
    at: Date.now(),
  }
}

/** Finds the place again after edits made elsewhere: by its words, else the nearest paragraph. */
export function restorePlace(view: EditorView, place: Place | undefined, sectionId: string): void {
  if (!place || place.sectionId !== sectionId) return
  const doc = view.state.doc
  const key = place.snippet.slice(0, 40)
  let index = -1
  if (doc.maybeChild(place.paragraph)?.textContent.startsWith(key)) index = place.paragraph
  else
    doc.forEach((node, _, i) => {
      if (index < 0 && key && node.textContent.startsWith(key)) index = i
    })
  if (index < 0 && place.paragraph >= doc.childCount) {
    // Past the end (an empty last paragraph is not stored): the end of the text.
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(doc)))
    return
  }
  if (index < 0) index = place.paragraph
  let pos = 0
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize
  const node = doc.child(index)
  const at = pos + 1 + Math.min(place.offset, node.content.size)
  view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, at)))
}
