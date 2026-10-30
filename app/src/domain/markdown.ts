// Only Markdown is stored (docs/decisions/0003). This reads and writes the small
// tree the page shows: paragraphs, pull quotes (`> `), *italic*, **bold** and
// ==highlights== (`==words=={.iris}` in an ink other than amber).
// Anything else is kept exactly as written: a block this tree cannot write back
// to the same text becomes a raw paragraph, shown with its symbols and written
// back untouched.

export type Mark = 'em' | 'strong'

/** A highlight's ink, stored by name. Amber is the default and is written without one. */
export const INKS = ['amber', 'citron', 'sage', 'coral', 'iris', 'sky'] as const
export type Ink = (typeof INKS)[number]

export interface Span {
  text: string
  marks: Mark[]
  ink?: Ink
}

/** A line break inside a block (Markdown's single newline). */
export const BREAK = '\n'

export type Block = { type: 'paragraph'; spans: Span[] } | { type: 'quote'; spans: Span[] } | { type: 'raw'; text: string }

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
  if (block.type === 'quote')
    return text
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n')
  return text
}

// Inline: `\x` escapes, `**` bold, `*` italic, `==` highlight. A run of stars
// is read as the writer below emits it: marks closed innermost first, then
// strong opened before em. Where a run can be read two ways, `closing` picks
// closing as many (eager) or as few (lazy) as fit; the caller keeps whichever
// writes back the same text. Returns null when the markers do not pair up.
//
// `==` opens a highlight only before a letter and with a closing `==` after a
// letter later on; any other `==` is text, so `a == b` and `x==y` written
// before highlights read back as they were.
function parseInline(source: string, closing: 'eager' | 'lazy'): Span[] | null {
  const spans: Span[] = []
  let open: Open[] = []
  let text = ''
  let highlightFrom = 0
  const flush = () => {
    if (text) spans.push({ text, marks: open.filter((m) => m !== 'hl').sort() })
    text = ''
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!
    if (c === '\\' && i + 1 < source.length && ESCAPABLE.includes(source[i + 1]!)) {
      text += source[++i]
    } else if (c === '*') {
      let run = 1
      while (source[i + run] === '*') run++
      i += run - 1
      flush()
      const next = readRun(open, run, closing)
      if (!next) return null
      open = next
    } else if (c === '=') {
      let run = 1
      while (source[i + run] === '=') run++
      const before = source[i - 1]
      const after = source[i + run]
      i += run - 1
      if (run === 2 && open.includes('hl') && before && !/\s/.test(before)) {
        if (open.at(-1) !== 'hl') return null
        flush()
        open.pop()
        const named = /^\{\.([a-z]+)\}/.exec(source.slice(i + 1))
        const ink = INKS.find((k) => k === named?.[1])
        if (ink) i += named![0].length
        for (const span of spans.slice(highlightFrom)) span.ink = ink ?? 'amber'
      } else if (run === 2 && !open.includes('hl') && after && !/\s/.test(after) && closerAfter(source, i + 1)) {
        flush()
        open.push('hl')
        highlightFrom = spans.length
      } else {
        text += '='.repeat(run)
      }
    } else {
      text += c
    }
  }
  flush()
  return open.length === 0 ? merge(spans) : null
}

/** An open highlight, on the same stack as the marks so they nest. */
type Open = Mark | 'hl'

/** Whether a `==` that could close a highlight comes at or after `from`. */
function closerAfter(source: string, from: number): boolean {
  for (let i = from; i < source.length; i++) {
    if (source[i] === '\\' && ESCAPABLE.includes(source[i + 1] ?? '')) i++
    else if (source[i] === '=') {
      let run = 1
      while (source[i + run] === '=') run++
      if (run === 2 && !/\s/.test(source[i - 1]!)) return true
      i += run - 1
    }
  }
  return false
}

const width = (m: Mark) => (m === 'strong' ? 2 : 1)

function readRun(open: Open[], run: number, closing: 'eager' | 'lazy'): Open[] | null {
  // Stars close and open only inside the innermost highlight.
  const base = open.slice(0, open.lastIndexOf('hl') + 1)
  const marks = open.slice(base.length) as Mark[]
  const counts = [...Array(marks.length + 1).keys()]
  for (const closes of closing === 'eager' ? counts.reverse() : counts) {
    const kept = marks.slice(0, marks.length - closes)
    const rest = run - marks.slice(kept.length).reduce((n, m) => n + width(m), 0)
    const opens: Mark[] | undefined = [[], ['em'], ['strong'], ['strong', 'em']][rest] as Mark[] | undefined
    if (rest < 0 || !opens || opens.some((m) => kept.includes(m) || base.includes(m))) continue
    return [...base, ...kept, ...opens]
  }
  return null
}

const ESCAPABLE = '\\*#>={'

function serializeInline(spans: Span[]): string {
  const merged = trimHighlights(merge(spans))
  const plain = writeInline(merged, false)
  // `=` and `{` are escaped only where, left bare, they would read back as a highlight or its ink.
  if (!merged.some((s) => /[={]/.test(s.text))) return plain
  const same = (['eager', 'lazy'] as const).some((c) => JSON.stringify(parseInline(plain, c)) === JSON.stringify(merged))
  return same ? plain : writeInline(merged, true)
}

function writeInline(spans: Span[], escapeAll: boolean): string {
  let out = ''
  const open: Open[] = []
  let ink: Ink | undefined
  const carries = (span: Span, m: Open) => (m === 'hl' ? span.ink === ink : span.marks.includes(m))
  // Amber goes unnamed, except right before another highlight, where `====` would not read back.
  const close = (m: Open, next?: Span) => {
    if (m !== 'hl') return marker(m)
    const name = ink === 'amber' && !next?.ink ? '' : `{.${ink}}`
    ink = undefined
    return `==${name}`
  }
  spans.forEach((span, k) => {
    // Close what this span does not carry (innermost first), then open what it adds: the highlight first.
    while (open.some((m) => !carries(span, m))) out += close(open.pop()!, span)
    if (span.ink && !open.includes('hl')) {
      // Under any mark that ends inside it, so the highlight is never split.
      const end = spans.findIndex((s, i) => i > k && s.ink !== span.ink)
      const run = spans.slice(k, end < 0 ? undefined : end)
      while (open.some((m) => !run.every((s) => carries(s, m)))) out += close(open.pop()!, span)
      out += '=='
      open.push('hl')
      ink = span.ink
    }
    for (const m of ORDER)
      if (span.marks.includes(m) && !open.includes(m)) {
        out += marker(m)
        open.push(m)
      }
    out += escapeText(span.text, out, escapeAll)
  })
  while (open.length) out += close(open.pop()!)
  return out
}

/** A highlight starts and ends on a letter, as `==` needs: spaces at its edges are left out of it. */
function trimHighlights(spans: Span[]): Span[] {
  const out: Span[] = []
  for (let i = 0; i < spans.length; ) {
    const ink = spans[i]!.ink
    let j = i
    while (j < spans.length && spans[j]!.ink === ink) j++
    const run = spans.slice(i, j)
    i = j
    const all = run.map((s) => s.text).join('')
    const start = all.search(/\S/)
    if (!ink || start < 0) {
      out.push(...run.map(({ text, marks }) => ({ text, marks })))
      continue
    }
    const end = all.trimEnd().length
    let at = 0
    for (const s of run) {
      const from = at
      at += s.text.length
      for (const [a, b, inked] of [
        [from, Math.min(at, start), false],
        [Math.max(from, start), Math.min(at, end), true],
        [Math.max(from, end), at, false],
      ] as const)
        if (b > a) out.push({ text: s.text.slice(a - from, b - from), marks: s.marks, ...(inked && { ink }) })
    }
  }
  return merge(out)
}

const ORDER: Mark[] = ['strong', 'em']
const marker = (m: Mark) => (m === 'strong' ? '**' : '*')

function escapeText(text: string, before: string, escapeAll: boolean): string {
  let out = text.replace(escapeAll ? /[\\*={]/g : /[\\*]/g, '\\$&')
  // `#` or `>` that would start a line means a heading or a quote: escape it (0003).
  out = out.replace(/(^|\n)([#>])/g, (m, nl: string, c: string, offset: number) => (offset === 0 && !atLineStart(before) ? m : `${nl}\\${c}`))
  return out
}

const atLineStart = (before: string) => before === '' || before.endsWith('\n')

function merge(spans: Span[]): Span[] {
  const out: Span[] = []
  for (const span of spans) {
    if (!span.text) continue
    const last = out.at(-1)
    if (last && last.marks.join() === span.marks.join() && last.ink === span.ink) last.text += span.text
    else out.push({ text: span.text, marks: [...span.marks].sort(), ...(span.ink && { ink: span.ink }) })
  }
  return out
}
