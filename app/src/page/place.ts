// The writer's place in a section (DESIGN.md, Behaviour: "Your place travels with the piece"):
// the caret if they were writing, otherwise the first line on screen, kept as a paragraph, an
// offset and its opening words, so it survives edits made elsewhere.

import type { Node } from 'prosemirror-model'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { Place, Screen, TitleField } from '../domain/model'

/** Where the writer is: the caret if writing in the text, else the first line on screen, and the title field if writing in one. */
export function placeOf(
  view: EditorView,
  sectionId: string,
  page: number,
  screen: Screen,
  viewport: HTMLElement | null,
  writing: 'text' | TitleField | null,
): Place | undefined {
  let pos = view.state.selection.head
  if (writing !== 'text' && viewport) {
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
    screen,
    caret: writing !== null,
    ...(writing && writing !== 'text' ? { field: writing } : {}),
    at: Date.now(),
  }
}

/** How much of a paragraph's opening finds it again. */
const KEY = 40

/**
 * The paragraph a place or a passage means, found again after edits made elsewhere: the one at its old index if
 * it still opens with the same words, else the first that does, else none. A paragraph that is gone is
 * undefined, which restorePlace answers by taking the nearest and a passage by going to the end.
 */
export function paragraphOf(doc: Node, paragraph: number, snippet: string): number | undefined {
  const key = snippet.slice(0, KEY)
  if (!key) return undefined
  if (doc.maybeChild(paragraph)?.textContent.startsWith(key)) return paragraph
  let found: number | undefined
  doc.forEach((node, _, i) => {
    if (found === undefined && node.textContent.startsWith(key)) found = i
  })
  return found
}

/** Finds the place again after edits made elsewhere: by its words, else the nearest paragraph. */
export function restorePlace(view: EditorView, place: Place | undefined, sectionId: string): void {
  if (!place || place.sectionId !== sectionId) return
  const doc = view.state.doc
  let index = paragraphOf(doc, place.paragraph, place.snippet) ?? -1
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
