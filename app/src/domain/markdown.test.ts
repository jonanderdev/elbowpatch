import { describe, expect, it } from 'vitest'
import { type Block, countWords, INKS, type Mark, parse, type Span, serialize } from './markdown'

const roundTrip = (md: string) => serialize(parse(md))

describe('markdown', () => {
  it('reads paragraphs, pull quotes, italic and bold', () => {
    expect(parse('One *two* **three**.\n\n> A quote.')).toEqual([
      {
        type: 'paragraph',
        spans: [
          { text: 'One ', marks: [] },
          { text: 'two', marks: ['em'] },
          { text: ' ', marks: [] },
          { text: 'three', marks: ['strong'] },
          { text: '.', marks: [] },
        ],
      },
      { type: 'quote', spans: [{ text: 'A quote.', marks: [] }] },
    ])
  })

  it.each([
    'Plain.',
    'One *two* **three**.',
    '***both***',
    '**bold *and italic* inside**',
    '*italic **and bold** inside*',
    '**a*b****c*',
    '> A quote with *italic*.',
    '> two\n> lines',
    'A line\nbreak inside',
    'Escaped \\* star and \\\\ backslash',
    '\\# not a heading',
    '\\> not a quote',
    // Outside the v1 marks: kept exactly as written.
    '# A heading',
    '- a\n- list',
    '1. one\n2. two',
    '[a link](https://example.com)',
    '`code` and _underscores_',
    '```\ncode block\n```',
    'Unpaired *star',
    '| a | b |\n|---|---|',
    '<b>html</b>',
    '> quote\nnot quoted',
    '  indented text',
    // A highlight in another order than the writer's.
    '**==bold outside==**',
  ])('gives back the same text: %j', (md) => {
    expect(roundTrip(md)).toBe(md)
  })

  it.each(['***both***', '*italic **and bold** inside*', '**a*b****c*', '**bold *and italic* inside**'])(
    'reads nested and overlapping marks as marks, not raw text: %j',
    (md) => expect(parse(md)[0]?.type).toBe('paragraph'),
  )

  it('gives back whole documents, unsupported blocks included', () => {
    const md = '# Title\n\nA *paragraph*.\n\n- list\n- items\n\n> A quote.\n\nEnd.'
    expect(roundTrip(md)).toBe(md)
  })

  it('escapes what is typed so it reads back as typed', () => {
    const typed: Block[] = [
      { type: 'paragraph', spans: [{ text: '# not a heading, a * star, a \\ slash', marks: [] }] },
      { type: 'paragraph', spans: [{ text: '> not a quote', marks: [] }] },
      { type: 'paragraph', spans: [{ text: 'mid-line # and > stay', marks: [] }] },
    ]
    const md = serialize(typed)
    expect(md).toBe('\\# not a heading, a \\* star, a \\\\ slash\n\n\\> not a quote\n\nmid-line # and > stay')
    expect(parse(md)).toEqual(typed)
  })

  it('writes nested marks so they read back', () => {
    const blocks: Block[] = [
      {
        type: 'paragraph',
        spans: [
          { text: 'a', marks: ['strong'] },
          { text: 'b', marks: ['em', 'strong'] },
          { text: 'c', marks: ['em'] },
        ],
      },
    ]
    expect(parse(serialize(blocks))).toEqual(blocks)
  })

  it('reads highlights and their inks', () => {
    expect(parse('A ==marked== word and ==another=={.iris}.')).toEqual([
      {
        type: 'paragraph',
        spans: [
          { text: 'A ', marks: [] },
          { text: 'marked', marks: [], ink: 'amber' },
          { text: ' word and ', marks: [] },
          { text: 'another', marks: [], ink: 'iris' },
          { text: '.', marks: [] },
        ],
      },
    ])
  })

  it.each([
    '==amber==',
    '==iris=={.iris} and ==sky=={.sky}',
    '==**bold highlight**==',
    '==amber=={.amber}==iris=={.iris}',
    '==highlight with **bold** and *italic*==',
    '*a ==b== c*',
    '==a *b*==*c*',
    '> A quote with ==a highlight=={.sage}.',
    // Written before highlights, or not a highlight: kept as text.
    'a = b',
    'a == b',
    'x==y',
    'a==b == c',
    '== spaced ==',
    '=== three ===',
    'an ==unknown=={.teal} ink',
    'a {.iris} brace',
    'a < b',
  ])('gives back the same text, as a paragraph: %j', (md) => {
    expect(roundTrip(md)).toBe(md)
    expect(parse(md)[0]?.type).not.toBe('raw')
  })

  it('escapes = and { only where they would read back as a highlight', () => {
    const typed: Block[] = [
      { type: 'paragraph', spans: [{ text: '==not marked== and a = b', marks: [] }] },
      {
        type: 'paragraph',
        spans: [
          { text: 'marked', marks: [], ink: 'amber' },
          { text: '{.iris} typed', marks: [] },
        ],
      },
    ]
    const md = serialize(typed)
    expect(md).toBe('\\=\\=not marked\\=\\= and a \\= b\n\n==marked==\\{.iris} typed')
    expect(parse(md)).toEqual(typed)
  })

  it('leaves spaces at the edges of a highlight out of it', () => {
    const blocks: Block[] = [
      {
        type: 'paragraph',
        spans: [
          { text: 'a', marks: [] },
          { text: ' marked ', marks: [], ink: 'coral' },
          { text: 'b', marks: [] },
        ],
      },
    ]
    expect(serialize(blocks)).toBe('a ==marked=={.coral} b')
  })

  it('writes any mix of marks, highlights and symbols so it reads back', () => {
    // A seeded walk over short texts: every block the writer makes must read back as itself.
    let seed = 7
    const next = (n: number) => {
      seed = (seed * 48271) % 2147483647
      return seed % n
    }
    const pieces = ['a', 'b c', ' ', '=', '==', '{.iris}', '*', '\\', '#', 'x']
    const allMarks: Mark[][] = [[], ['em'], ['strong'], ['em', 'strong']]
    for (let round = 0; round < 2000; round++) {
      const spans: Span[] = Array.from({ length: 1 + next(5) }, () => {
        const ink = next(3) === 0 ? INKS[next(INKS.length)] : undefined
        return { text: pieces[next(pieces.length)]! + pieces[next(pieces.length)]!, marks: allMarks[next(4)]!, ...(ink && { ink }) }
      })
      const md = serialize([{ type: 'paragraph', spans }])
      const back = parse(md)
      expect(back.length <= 1 && back[0]?.type !== 'raw', md).toBe(true)
      expect(serialize(back), md).toBe(md)
      const words = (b: Block | undefined) => (b && b.type !== 'raw' ? b.spans.map((s) => s.text).join('') : '')
      expect(words(back[0]), md).toBe(spans.map((s) => s.text).join(''))
    }
  })

  it('counts words, not symbols', () => {
    expect(countWords('One *two* **three**.\n\n> Four — five.')).toBe(5)
    expect(countWords('')).toBe(0)
  })
})
