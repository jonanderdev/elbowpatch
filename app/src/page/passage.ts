// A passage of old text, and where it goes back (DESIGN.md, The Time Machine). It is taken from the
// words selected in a moment, and put into the section's text as its own paragraph, after the
// paragraph that came before it. Nothing here is React or touches the page: it works on documents.

import { closeHistory } from 'prosemirror-history'
import type { Node } from 'prosemirror-model'
import { type EditorState, Selection, TextSelection, type Transaction } from 'prosemirror-state'
import { parse } from '../domain/markdown'
import { asMarkdown } from './editor'
import { toDoc } from './schema'

/** The paragraph before the passage, as a reading place holds a paragraph: where it was, and its opening words. */
export interface Anchor {
  paragraph: number
  snippet: string
}

/** Words to bring back: as Markdown, so they cross from one section's page to another's, and where they go. */
export interface Passage {
  markdown: string
  /** The paragraph it follows, or null when it came from the first, and goes at the start. */
  after: Anchor | null
}

/** How much of a paragraph's opening finds it again. */
const KEY = 40
/** How much of it is kept to find it by. */
const SNIPPET = 160

/** The words between `from` and `to` of old text, or null when they hold none. */
export function passageOf(doc: Node, from: number, to: number): Passage | null {
  const markdown = asMarkdown(doc.slice(from, to, true)).trim()
  if (!markdown) return null
  const index = doc.resolve(from).index(0)
  const before = doc.maybeChild(index - 1)
  return { markdown, after: before ? { paragraph: index - 1, snippet: before.textContent.slice(0, SNIPPET) } : null }
}

/**
 * Where the paragraph is in the text now: by its opening words, and among paragraphs that begin alike the one
 * nearest where it was. Unlike restorePlace, which falls back to the same index, it can say the paragraph is
 * gone, which is undefined.
 */
export function paragraphFound(doc: Node, anchor: Anchor): number | undefined {
  const key = anchor.snippet.slice(0, KEY)
  if (!key) return undefined
  let found: number | undefined
  doc.forEach((node, _offset, i) => {
    if (!node.textContent.startsWith(key)) return
    if (found === undefined || Math.abs(i - anchor.paragraph) < Math.abs(found - anchor.paragraph)) found = i
  })
  return found
}

/**
 * The passage in the text, as paragraphs of its own that replace and merge nothing, and left selected. One
 * transaction, closed off from the typing before it, so one undo takes it away. Null when it holds no words.
 */
export function bringPassage(state: EditorState, passage: Passage): Transaction | null {
  const blocks = toDoc(parse(passage.markdown)).content
  if (!blocks.textBetween(0, blocks.size, ' ').trim()) return null
  const doc = state.doc
  const found = passage.after ? paragraphFound(doc, passage.after) : undefined
  let from: number
  if (!passage.after) from = 0
  else if (found === undefined) from = doc.content.size
  else {
    from = 0
    doc.forEach((node, offset, i) => {
      if (i === found) from = offset + node.nodeSize
    })
  }
  let to = from
  // An empty paragraph where it lands (an empty section is one) gives way: the passage stands in its place.
  const last = doc.lastChild
  const empty = (n: Node | null | undefined): boolean => !!n && n.type.name === 'paragraph' && n.content.size === 0
  if (doc.childCount === 1 && empty(last)) {
    from = 0
    to = doc.content.size
  } else if (from === doc.content.size && empty(last)) from = to - last!.nodeSize
  const tr = closeHistory(state.tr.replaceWith(from, to, blocks))
  const start = Selection.findFrom(tr.doc.resolve(from), 1, true)
  const end = Selection.findFrom(tr.doc.resolve(from + blocks.size), -1, true)
  if (start && end) tr.setSelection(TextSelection.create(tr.doc, start.from, end.to))
  return tr.scrollIntoView()
}
