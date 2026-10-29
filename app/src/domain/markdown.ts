// Only Markdown is stored (docs/decisions/0003). This reads and writes the small
// tree the page shows: paragraphs, pull quotes (`> `), *italic* and **bold**.
// Anything else is kept exactly as written: a block this tree cannot write back
// to the same text becomes a raw paragraph, shown with its symbols and written
// back untouched.

export type Mark = 'em' | 'strong'

export interface Span {
  text: string
  marks: Mark[]
}

/** A line break inside a block (Markdown's single newline). */
export const BREAK = '\n'

export type Block =
  | { type: 'paragraph'; spans: Span[] }
  | { type: 'quote'; spans: Span[] }
  | { type: 'raw'; text: string }

export function parse(markdown: string): Block[] {
  const source = markdown.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '')
  if (source === '') return []
  return source.split(/\n{2,}/).map(parseBlock)
}

export function serialize(blocks: Block[]): string {
  return blocks.map(serializeBlock).join('\n\n')
}

/** Words as a writer counts them: runs of letters or digits, symbols ignored. */
export function countWords(markdown: string): number {
  let count = 0
  for (const block of parse(markdown)) {
    const text = block.type === 'raw' ? block.text : block.spans.map((s) => s.text).join('')
    count += text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
  }
  return count
}

function parseBlock(source: string): Block {
  const lines = source.split('\n')
  const quoted = lines.every((l) => l.startsWith('> '))
  const body = quoted ? lines.map((l) => l.slice(2)).join('\n') : source
  for (const closing of ['eager', 'lazy'] as const) {
    const spans = parseInline(body, closing)
    if (!spans) continue
    const block: Block = quoted ? { type: 'quote', spans } : { type: 'paragraph', spans }
    if (serializeBlock(block) === source) return block
  }
  return { type: 'raw', text: source }
}

function serializeBlock(block: Block): string {
  if (block.type === 'raw') return block.text
  const text = serializeInline(block.spans)
  if (block.type === 'quote') return text.split('\n').map((l) => `> ${l}`).join('\n')
  return text
}

// Inline: `\x` escapes, `**` bold, `*` italic. A run of stars is read as the
// writer below emits it: marks closed innermost first, then strong opened
// before em. Where a run can be read two ways, `closing` picks closing as many
// (eager) or as few (lazy) as fit; the caller keeps whichever writes back the
// same text. Returns null when the markers do not pair up.
function parseInline(source: string, closing: 'eager' | 'lazy'): Span[] | null {
  const spans: Span[] = []
  let open: Mark[] = []
  let text = ''
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!
    if (c === '\\' && i + 1 < source.length && ESCAPABLE.includes(source[i + 1]!)) {
      text += source[++i]
    } else if (c === '*') {
      let run = 1
      while (source[i + run] === '*') run++
      i += run - 1
      if (text) spans.push({ text, marks: [...open].sort() })
      text = ''
      const next = readRun(open, run, closing)
      if (!next) return null
      open = next
    } else {
      text += c
    }
  }
  if (text) spans.push({ text, marks: [...open].sort() })
  return open.length === 0 ? merge(spans) : null
}

const width = (m: Mark) => (m === 'strong' ? 2 : 1)

function readRun(open: Mark[], run: number, closing: 'eager' | 'lazy'): Mark[] | null {
  const counts = [...Array(open.length + 1).keys()]
  for (const closes of closing === 'eager' ? counts.reverse() : counts) {
    const kept = open.slice(0, open.length - closes)
    const rest = run - open.slice(kept.length).reduce((n, m) => n + width(m), 0)
    const opens: Mark[] | undefined = [[], ['em'], ['strong'], ['strong', 'em']][rest] as Mark[] | undefined
    if (rest < 0 || !opens || opens.some((m) => kept.includes(m))) continue
    return [...kept, ...opens]
  }
  return null
}

const ESCAPABLE = '\\*#>'

function serializeInline(spans: Span[]): string {
  let out = ''
  const open: Mark[] = []
  for (const span of merge(spans)) {
    // Close what this span does not carry (innermost first), then open what it adds.
    while (open.some((m) => !span.marks.includes(m))) out += marker(open.pop()!)
    for (const m of ORDER) if (span.marks.includes(m) && !open.includes(m)) {
      out += marker(m)
      open.push(m)
    }
    out += escapeText(span.text, out)
  }
  while (open.length) out += marker(open.pop()!)
  return out
}

const ORDER: Mark[] = ['strong', 'em']
const marker = (m: Mark) => (m === 'strong' ? '**' : '*')

function escapeText(text: string, before: string): string {
  let out = text.replace(/[\\*]/g, '\\$&')
  // `#` or `>` that would start a line means a heading or a quote: escape it (0003).
  out = out.replace(/(^|\n)([#>])/g, (m, nl: string, c: string, offset: number) =>
    offset === 0 && !atLineStart(before) ? m : `${nl}\\${c}`,
  )
  return out
}

const atLineStart = (before: string) => before === '' || before.endsWith('\n')

function merge(spans: Span[]): Span[] {
  const out: Span[] = []
  for (const span of spans) {
    if (!span.text) continue
    const last = out.at(-1)
    if (last && last.marks.join() === span.marks.join()) last.text += span.text
    else out.push({ text: span.text, marks: [...span.marks].sort() })
  }
  return out
}
