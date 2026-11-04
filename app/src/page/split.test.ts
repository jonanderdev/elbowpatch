import { describe, expect, it } from 'vitest'
import { countWords, parse } from '../domain/markdown'
import { schema, toDoc } from './schema'
import { halvesAt, halvesAtLine } from './split'

const docOf = (markdown: string) => toDoc(parse(markdown))

/** The position just before `words`, found in the document as the page holds it. */
function posOf(markdown: string, words: string): { doc: ReturnType<typeof docOf>; pos: number } {
  const doc = docOf(markdown)
  let pos = -1
  doc.descendants((node, at) => {
    const i = node.isText ? node.text!.indexOf(words) : -1
    if (pos < 0 && i >= 0) pos = at + i
  })
  if (pos < 0) throw new Error(`No "${words}" in the text.`)
  return { doc, pos }
}
const cutBefore = (markdown: string, words: string) => {
  const { doc, pos } = posOf(markdown, words)
  return halvesAt(doc, pos)
}

describe('where a chapter starts', () => {
  it('between paragraphs, each half keeps its own', () => {
    expect(cutBefore('One.\n\nTwo.\n\nThree.', 'Two')).toEqual({ before: 'One.', after: 'Two.\n\nThree.', title: '' })
  })

  it('inside a paragraph, the paragraph splits there, every character kept', () => {
    expect(cutBefore('The ferry at seven.', 'at seven')).toEqual({ before: 'The ferry ', after: 'at seven.', title: '' })
  })

  it('a mark across the point closes on each side', () => {
    expect(cutBefore('Salt *on the windows* and rail.', 'the windows')).toEqual({ before: 'Salt *on *', after: '*the windows* and rail.', title: '' })
    expect(cutBefore('**Bold *and italic* here**', 'italic')).toEqual({ before: '**Bold *and ***', after: '***italic* here**', title: '' })
  })

  it('a pull quote splits into two pull quotes', () => {
    expect(cutBefore('> One two', 'two')).toEqual({ before: '> One ', after: '> two', title: '' })
  })

  it('Markdown outside the v1 marks stays exactly as written on both sides', () => {
    const list = '- one\n- two\n- [link](http://example.com)'
    const { before, after } = cutBefore(`Before.\n\n${list}\n\nAfter.`, '- two')
    expect(before).toBe('Before.\n\n- one')
    expect(after).toBe('- two\n- [link](http://example.com)\n\nAfter.')
    // An unpaired mark is outside them too, and neither half closes it.
    expect(cutBefore('Two **stars and no end', 'and no end')).toEqual({ before: 'Two **stars ', after: 'and no end', title: '' })
  })

  it('every word lands in one half, exactly once', () => {
    const text = 'Salt *on the* **windows** of\nthe shop.\n\n> A quote of four.\n\n| a | table |\n\nThe end.'
    for (let pos = 1; pos < docOf(text).content.size; pos++) {
      const doc = docOf(text)
      const $pos = doc.resolve(pos)
      if (!$pos.parent.isTextblock) continue
      const { before, after } = halvesAt(doc, pos)
      const letters = (s: string) => s.replace(/[^a-z]/gi, '')
      expect(letters(before) + letters(after)).toBe(letters(text))
      // A word cut in two counts on both sides; nothing else changes the count.
      expect(countWords(before) + countWords(after)).toBeGreaterThanOrEqual(countWords(text))
    }
  })

  it('a line break at the point goes: it is only space', () => {
    expect(cutBefore('One\nTwo', 'Two')).toEqual({ before: 'One', after: 'Two', title: '' })
  })

  it('an empty paragraph at the point leaves nothing behind', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text('One.')),
      schema.nodes.paragraph.create(),
      schema.nodes.paragraph.create(null, schema.text('Two.')),
    ])
    expect(halvesAt(doc, 7)).toEqual({ before: 'One.', after: 'Two.', title: '' })
  })

  it('a # or > that now starts the moved text stays ordinary text', () => {
    expect(cutBefore('Rule # one', '# one').after).toBe('\\# one')
    expect(cutBefore('Rule > one', '> one').after).toBe('\\> one')
    // Kept as written, it would read as a heading: one more chapter than the writer made.
    const after = cutBefore('a **b # c', '# c').after
    expect(parse(after)).toEqual([{ type: 'paragraph', spans: [{ text: '# c', marks: [] }] }])
  })

  it('at the very start and the very end, one half is empty', () => {
    const doc = docOf('One.')
    expect(halvesAt(doc, 1).before).toBe('')
    expect(halvesAt(doc, 5).after).toBe('')
  })
})

describe('a # line', () => {
  it('the rest of the line is the title, and what follows it moves', () => {
    const { doc, pos } = posOf('Before.\n\n\\# The harbour\n\nAfter.', '# The')
    expect(halvesAtLine(doc, pos)).toEqual({ before: 'Before.', title: 'The harbour', after: 'After.' })
  })

  it('a line ends at a line break; the rest of the paragraph moves', () => {
    const { doc, pos } = posOf('Before.\n\n\\# The harbour\nIn winter.', '# The')
    expect(halvesAtLine(doc, pos)).toEqual({ before: 'Before.', title: 'The harbour', after: 'In winter.' })
  })

  it('a line after a line break starts there, and the break goes', () => {
    const { doc, pos } = posOf('Before.\n\\# The harbour', '# The')
    expect(halvesAtLine(doc, pos)).toEqual({ before: 'Before.', title: 'The harbour', after: '' })
  })

  it('a line with nothing on it gives an empty title', () => {
    const { doc, pos } = posOf('Before.\n\n\\# \n\nAfter.', '# ')
    expect(halvesAtLine(doc, pos)).toEqual({ before: 'Before.', title: '', after: 'After.' })
  })
})
