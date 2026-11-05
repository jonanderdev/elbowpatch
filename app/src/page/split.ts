// Where a chapter starts in the text (DESIGN.md, Control): the two halves of a section, cut at a
// point and written by the Markdown serialiser, so marks open across the point close on each side
// and Markdown outside the v1 marks stays as written.

import type { Node, ResolvedPos } from 'prosemirror-model'
import { type Block, BREAK, lastBlock, type Meeting, type Seam, serialize } from '../domain/markdown'
import { schema, toBlocks } from './schema'

export interface Halves {
  /** What stays in the section. */
  before: string
  /** What moves to the new chapter. */
  after: string
  /** The rest of a `# ` line; empty otherwise. */
  title: string
  /** How they met, so undo can put them back. */
  seam: Seam
}

/** The halves of the text at a caret, or at the start of a selection. */
export function halvesAt(doc: Node, pos: number): Halves {
  const $pos = doc.resolve(pos)
  const { text, escaped } = moved(doc.cut(pos))
  const raw = $pos.parent.type === schema.nodes.raw
  const before = written(doc.cut(0, pos))
  return { before, after: text, title: '', seam: { front: meetingAt($pos), ending: lastBlock(before), raw, escaped } }
}

/** The halves at a `# ` line, `pos` just before its `#`: the rest of that line is the title. */
export function halvesAtLine(doc: Node, pos: number): Halves {
  const $pos = doc.resolve(pos)
  const end = lineEnd($pos.parent, $pos.parentOffset) + $pos.start()
  // Past the line's break, if it has one: that goes with it.
  const next = doc.nodeAt(end)?.type === schema.nodes.hard_break ? end + 1 : end
  const { text, escaped } = moved(doc.cut(next))
  const before = written(doc.cut(0, pos))
  return {
    before,
    after: text,
    title: doc.textBetween(pos + 2, end).trim(),
    seam: {
      front: $pos.parentOffset === 0 ? 'apart' : 'line',
      back: next > end && next < $pos.end() ? 'line' : 'apart',
      line: written(doc.cut(pos, end)),
      ending: lastBlock(before),
      raw: false,
      escaped,
    },
  }
}

/** Whether a point is inside its block, and at a line break. One at the block's end is only space. */
function meetingAt($pos: ResolvedPos): Meeting {
  const { parent, parentOffset: at } = $pos
  const size = parent.content.size
  if (at === 0 || at === size) return 'apart'
  const breakAfter = parent.type === schema.nodes.raw ? parent.textContent[at] === BREAK : $pos.nodeAfter?.type === schema.nodes.hard_break
  const breakBefore = parent.type === schema.nodes.raw ? parent.textContent[at - 1] === BREAK : $pos.nodeBefore?.type === schema.nodes.hard_break
  if (breakAfter && at + 1 === size) return 'apart'
  return breakAfter || breakBefore ? 'line' : 'inside'
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
function moved(half: Node): { text: string; escaped: boolean } {
  const text = written(half)
  const escaped = text.startsWith('# ')
  return { text: escaped ? `\\${text}` : text, escaped }
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
