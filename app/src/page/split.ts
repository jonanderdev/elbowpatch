// Where a chapter starts in the text (DESIGN.md, Control): the two halves of a section, cut at a
// point and written by the Markdown serialiser, so marks open across the point close on each side
// and Markdown outside the v1 marks stays as written.

import type { Node } from 'prosemirror-model'
import { type Block, BREAK, serialize } from '../domain/markdown'
import { schema, toBlocks } from './schema'

export interface Halves {
  /** What stays in the section. */
  before: string
  /** What moves to the new chapter. */
  after: string
  /** The rest of a `# ` line; empty otherwise. */
  title: string
}

/** The halves of the text at a caret, or at the start of a selection. */
export function halvesAt(doc: Node, pos: number): Halves {
  return { before: written(doc.cut(0, pos)), after: moved(doc.cut(pos)), title: '' }
}

/** The halves at a `# ` line, `pos` just before its `#`: the rest of that line is the title. */
export function halvesAtLine(doc: Node, pos: number): Halves {
  const $pos = doc.resolve(pos)
  const end = lineEnd($pos.parent, $pos.parentOffset) + $pos.start()
  // Past the line's break, if it has one: that goes with it.
  const next = doc.nodeAt(end)?.type === schema.nodes.hard_break ? end + 1 : end
  return { before: written(doc.cut(0, pos)), after: moved(doc.cut(next)), title: doc.textBetween(pos + 2, end).trim() }
}

function lineEnd(block: Node, from: number): number {
  let end = block.content.size
  block.forEach((child, offset) => {
    if (offset >= from && offset < end && child.type === schema.nodes.hard_break) end = offset
  })
  return end
}

const written = (half: Node): string => serialize(withoutEdgeBreaks(toBlocks(half))).replace(/^\n+|\n+$/g, '')

/** A half that moves. Kept as written, a line starting `# ` would read as one more chapter in an exported book. */
function moved(half: Node): string {
  const text = written(half)
  return text.startsWith('# ') ? `\\${text}` : text
}

/** A line break at the point is only space, and Markdown cannot hold one at a block's edge. */
function withoutEdgeBreaks(blocks: Block[]): Block[] {
  return blocks.map((block, i) => {
    if (block.type === 'raw') return block
    const spans = [...block.spans]
    if (i === 0 && spans[0]?.text === BREAK) spans.shift()
    if (i === blocks.length - 1 && spans.at(-1)?.text === BREAK) spans.pop()
    return { ...block, spans }
  })
}
