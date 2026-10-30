import { type Node, Schema } from 'prosemirror-model'
import { type Block, BREAK, INKS, type Ink, type Mark, type Span } from '../domain/markdown'

// The page's editor schema: the v1 marks of docs/decisions/0003. A `raw` block
// holds Markdown outside them, shown with its symbols and written back as is.
export const schema: Schema<'doc' | 'paragraph' | 'quote' | 'raw' | 'text' | 'hard_break', 'highlight' | 'em' | 'strong'> = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }, { tag: 'h1,h2,h3,h4,h5,h6,li,pre,div', priority: 10 }],
      toDOM: () => ['p', 0],
    },
    quote: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'blockquote.pull' }],
      toDOM: () => ['blockquote', { class: 'pull' }, 0],
    },
    raw: {
      group: 'block',
      content: 'text*',
      marks: '',
      parseDOM: [{ tag: 'p.raw', preserveWhitespace: 'full' }],
      toDOM: () => ['p', { class: 'raw' }, 0],
    },
    text: { group: 'inline' },
    hard_break: {
      group: 'inline',
      inline: true,
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
  },
  marks: {
    // First, so it wraps italic and bold and its band is sized by the body text, not the larger italic.
    highlight: {
      attrs: { ink: { default: 'amber' } },
      // Typing on at its end does not carry the highlight on.
      inclusive: false,
      // Only the app's own highlights are pasted in (0003).
      parseDOM: [
        {
          tag: 'mark[data-ink]',
          getAttrs: (el) => {
            const ink = (el as HTMLElement).dataset.ink as Ink
            return INKS.includes(ink) && { ink }
          },
        },
      ],
      toDOM: (mark) => ['mark', { 'data-ink': mark.attrs.ink }, 0],
    },
    em: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
      toDOM: () => ['em', 0],
    },
    strong: {
      parseDOM: [
        { tag: 'strong' },
        // Some editors wrap a whole paste in <b style="font-weight:normal">.
        { tag: 'b', getAttrs: (el) => (el as HTMLElement).style.fontWeight !== 'normal' && null },
        { style: 'font-weight', getAttrs: (v) => /^(bold(er)?|[6-9]\d{2})$/.test(v as string) && null },
      ],
      toDOM: () => ['strong', 0],
    },
  },
})

export function toDoc(blocks: Block[]): Node {
  const nodes = blocks.map((block) => {
    if (block.type === 'raw') return schema.nodes.raw.create(null, block.text ? schema.text(block.text) : null)
    return schema.nodes[block.type]!.create(null, inlines(block.spans))
  })
  return schema.nodes.doc.create(null, nodes.length ? nodes : [schema.nodes.paragraph.create()])
}

function inlines(spans: Span[]): Node[] {
  const out: Node[] = []
  for (const span of spans) {
    const marks = span.marks.map((m) => schema.marks[m]!.create())
    if (span.ink) marks.unshift(schema.marks.highlight.create({ ink: span.ink }))
    span.text.split(BREAK).forEach((part, i) => {
      if (i > 0) out.push(schema.nodes.hard_break.create())
      if (part) out.push(schema.text(part, marks))
    })
  }
  return out
}

export function toBlocks(doc: Node): Block[] {
  const blocks: Block[] = []
  doc.forEach((node) => {
    if (node.type.name === 'raw') {
      blocks.push({ type: 'raw', text: node.textContent })
      return
    }
    const spans: Span[] = []
    node.forEach((child) => {
      if (child.type.name === 'hard_break') spans.push({ ...spans.at(-1), text: BREAK, marks: spans.at(-1)?.marks ?? [] })
      else spans.push(spanOf(child))
    })
    // An empty paragraph is only space between paragraphs: Markdown cannot hold it.
    if (spans.length === 0) return
    blocks.push({ type: node.type.name as 'paragraph' | 'quote', spans })
  })
  return blocks
}

function spanOf(node: Node): Span {
  const ink = schema.marks.highlight.isInSet(node.marks)?.attrs.ink as Ink | undefined
  const marks = node.marks.filter((m) => m.type !== schema.marks.highlight).map((m) => m.type.name as Mark)
  return { text: node.text ?? '', marks, ...(ink && { ink }) }
}
