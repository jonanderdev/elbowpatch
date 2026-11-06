// What undo keeps for the session (docs/decisions/0003), and only for it: a reload forgets it all,
// and a chapter split before then is simply a chapter. The page holds one section and is made anew
// for each, so a section's history waits here while its page is closed.

import type { EditorState } from 'prosemirror-state'
import { parse, type Seam, serialize } from '../domain/markdown'
import { toBlocks, toDoc } from './schema'

/** How a chapter was split off, for undo to put it back. */
export interface Split {
  /** The chapter it was split from. */
  into: string
  /** The text the split gave it. */
  after: string
  seam: Seam
}

const histories = new Map<string, EditorState>()
const splits = new Map<string, Split>()

/** The text as the page writes it, whatever Markdown it was read from. */
const asWritten = (markdown: string): string => serialize(toBlocks(toDoc(parse(markdown))))

/** A section's page closes: its history waits for the next. A page that was split or rejoined keeps none. */
export function keepUndo(sectionId: string, state: EditorState): void {
  histories.set(sectionId, state)
}

/** Sections whose page was sealed by a change to another section: the next close of that page keeps its history. */
const unchanged = new Set<string>()

/**
 * The page on this section is sealed while another section is brought back (0003: other sections keep their
 * history). The text it holds is still the section's, so its next close keeps its history.
 */
export function keepThroughSeal(sectionId: string): void {
  unchanged.add(sectionId)
}

/**
 * A section's page closes. A page sealed by a split or rejoin holds text that is no longer the section's, and keeps
 * no history, unless the seal was for another section's bring back.
 */
export function closeUndo(sectionId: string, state: EditorState, sealed: boolean): void {
  const same = unchanged.delete(sectionId)
  if (!sealed || same) histories.set(sectionId, state)
}

/**
 * The history to reopen a section with, if it ended on the very text the page opens with. On any other
 * text (the section changed in another window, or by a rejoin) its steps would double or lose words.
 */
export function takeUndo(sectionId: string, content: string): EditorState | undefined {
  const state = histories.get(sectionId)
  histories.delete(sectionId)
  return state && serialize(toBlocks(state.doc)) === asWritten(content) ? state : undefined
}

export function rememberSplit(sectionId: string, split: Split): void {
  splits.set(sectionId, split)
}

/**
 * How this chapter was split off, while it holds the text the split gave it: undo has then stepped
 * back to its start. With other text in it, it stays a chapter.
 */
export function splitOf(sectionId: string, markdown: string): Split | undefined {
  const split = splits.get(sectionId)
  return split && asWritten(split.after) === markdown ? split : undefined
}

export function forgetSplit(sectionId: string): void {
  splits.delete(sectionId)
}

/** A chapter left the book: its history goes, and so does any split that would go back to or from it. */
export function forgetChapter(sectionId: string): void {
  histories.delete(sectionId)
  splits.delete(sectionId)
  for (const [id, split] of splits) if (split.into === sectionId) splits.delete(id)
}

/**
 * A bring back changed what the section holds (0003): its history ends for the session, and so does how it was
 * split off or split into, for the text it now holds may be that of a moment before the split. The text it
 * replaced is a moment, not an undo step.
 */
export function forgetUndo(sectionId: string): void {
  forgetChapter(sectionId)
}
