import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { parse, serialize } from '../domain/markdown'
import { toggleQuote } from './editor'
import { schema, toBlocks, toDoc } from './schema'

/** Quotes the text between `from` and `to` of the first paragraph, and gives back the Markdown. */
function quote(markdown: string, from: number, to: number): string {
  const doc = toDoc(parse(markdown))
  let state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 1 + from, 1 + to) })
  toggleQuote(state, (tr) => {
    state = state.apply(tr)
  })
  return serialize(toBlocks(state.doc))
}

describe('pull quote', () => {
  it('quotes only the selected words, splitting their paragraph around them', () => {
    expect(quote('One two three.', 4, 7)).toBe('One\n\n> two\n\nthree.')
  })

  it('quotes a selection at the start or the end without leaving an empty paragraph', () => {
    expect(quote('One two', 0, 3)).toBe('> One\n\ntwo')
    expect(quote('One two', 4, 7)).toBe('One\n\n> two')
  })

  it('quotes the whole paragraph when it is all selected', () => {
    expect(quote('One two', 0, 7)).toBe('> One two')
  })
})
