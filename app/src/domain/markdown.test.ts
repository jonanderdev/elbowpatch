import { describe, expect, it } from 'vitest'
import { type Block, countWords, parse, serialize } from './markdown'

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

  it('counts words, not symbols', () => {
    expect(countWords('One *two* **three**.\n\n> Four — five.')).toBe(5)
    expect(countWords('')).toBe(0)
  })
})
