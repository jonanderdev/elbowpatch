import { history, undo } from 'prosemirror-history'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { parse, serialize } from '../domain/markdown'
import { bringPassage, passageOf } from './passage'
import { paragraphOf } from './place'
import { schema, toBlocks, toDoc } from './schema'

const doc = (markdown: string) => toDoc(parse(markdown))

/** The positions of `words` in the first place they appear in the document. */
function range(markdown: string, words: string): { from: number; to: number } {
  const d = doc(markdown)
  let found = -1
  d.descendants((node, pos) => {
    if (found < 0 && node.isText) {
      const at = node.text!.indexOf(words)
      if (at >= 0) found = pos + at
    }
  })
  if (found < 0) throw new Error(`${words} is not in the text`)
  return { from: found, to: found + words.length }
}

/** What a passage taken from `old` comes to when it is brought back into `now`. */
function brought(old: string, words: string, now: string): { text: string; selected: string } {
  const { from, to } = range(old, words)
  const passage = passageOf(doc(old), from, to)!
  let state = EditorState.create({ schema, doc: doc(now) })
  state = state.apply(bringPassage(state, passage)!)
  return { text: serialize(toBlocks(state.doc)), selected: state.doc.textBetween(state.selection.from, state.selection.to, '\n') }
}

describe('the passage taken from old text', () => {
  it('is the selected words, as Markdown, with their marks and pull quotes', () => {
    const old = 'One *two* three.\n\n> A quoted line\n\nFour **five**.'
    const { from } = range(old, 'two')
    const { to } = range(old, 'Four')
    expect(passageOf(doc(old), from, to)?.markdown).toBe('*two* three.\n\n> A quoted line\n\nFour')
  })

  it('is nothing for a selection with no words', () => {
    const old = 'One two three.'
    expect(passageOf(doc(old), 4, 5)).toBeNull()
  })

  it('stands after the paragraph before the one it was taken from', () => {
    const old = 'First paragraph.\n\nSecond paragraph with a part.\n\nThird.'
    const { from, to } = range(old, 'a part')
    expect(passageOf(doc(old), from, to)?.after).toEqual({ paragraph: 0, snippet: 'First paragraph.' })
  })

  it('has nothing before it in the first paragraph', () => {
    const old = 'First paragraph with a part.\n\nSecond.'
    const { from, to } = range(old, 'a part')
    expect(passageOf(doc(old), from, to)?.after).toBeNull()
  })
})

describe('finding the paragraph that came before', () => {
  const snippet = { paragraph: 1, snippet: 'The second paragraph begins here and goes on.' }

  it('finds it where it was', () => {
    expect(paragraphOf(doc('One.\n\nThe second paragraph begins here and goes on.\n\nThree.'), snippet.paragraph, snippet.snippet)).toBe(1)
  })

  it('finds it after paragraphs were added and removed around it', () => {
    expect(
      paragraphOf(doc('New.\n\nNew too.\n\nAnother.\n\nThe second paragraph begins here and goes on, longer now.'), snippet.paragraph, snippet.snippet),
    ).toBe(3)
  })

  it('says it is gone when its words are', () => {
    expect(paragraphOf(doc('One.\n\nSomething else entirely.'), snippet.paragraph, snippet.snippet)).toBeUndefined()
  })

  it('keeps the one at its old place among paragraphs that begin alike, as a reading place does', () => {
    expect(paragraphOf(doc('Yes.\n\nA.\n\nB.\n\nC.\n\nYes.\n\nD.'), 4, 'Yes.')).toBe(4)
  })

  it('takes the first that begins alike when none is at its old place, as a reading place does', () => {
    expect(paragraphOf(doc('A.\n\nYes.\n\nB.\n\nYes.'), 5, 'Yes.')).toBe(1)
  })

  it('cannot tell a paragraph with no words, and says it is gone', () => {
    expect(paragraphOf(doc('One.\n\nTwo.'), 0, '')).toBeUndefined()
  })
})

describe('bringing a passage back', () => {
  it('lands as its own paragraph after the paragraph before it, selected', () => {
    const old = 'Alpha one.\n\nBeta has a lost sentence here. And more.\n\nGamma.'
    const now = 'Alpha one.\n\nBeta has And more.\n\nGamma.'
    const result = brought(old, 'a lost sentence here.', now)
    expect(result.text).toBe('Alpha one.\n\na lost sentence here.\n\nBeta has And more.\n\nGamma.')
    expect(result.selected).toBe('a lost sentence here.')
  })

  it('lands where it stood after heavy edits around it', () => {
    const old = 'Alpha one is here.\n\nBeta had the lost words in it.\n\nGamma.'
    const now = 'A new start.\n\nAlpha one is here.\n\nThen Beta, rewritten.\n\nGamma, longer now.\n\nMore.'
    const result = brought(old, 'the lost words', now)
    expect(result.text).toBe('A new start.\n\nAlpha one is here.\n\nthe lost words\n\nThen Beta, rewritten.\n\nGamma, longer now.\n\nMore.')
  })

  it('goes at the end of the section when the paragraph before it is gone', () => {
    const old = 'Alpha one is here.\n\nBeta had the lost words in it.'
    const now = 'Something else.\n\nAnd more.'
    expect(brought(old, 'the lost words', now).text).toBe('Something else.\n\nAnd more.\n\nthe lost words')
  })

  it('goes at the start of the section when it came from the first paragraph', () => {
    const old = 'The lost words were first.\n\nBeta.'
    const now = 'Beta.\n\nAnd more.'
    expect(brought(old, 'The lost words', now).text).toBe('The lost words\n\nBeta.\n\nAnd more.')
  })

  it('keeps bold, italic and a pull quote', () => {
    const old = 'Alpha.\n\nBeta *with* some **bold** words.\n\n> and a pull quote'
    const from = range(old, 'with').from
    const to = range(old, 'and a pull quote').to
    const passage = passageOf(doc(old), from, to)!
    let state = EditorState.create({ schema, doc: doc('Alpha.') })
    state = state.apply(bringPassage(state, passage)!)
    expect(serialize(toBlocks(state.doc))).toBe('Alpha.\n\n*with* some **bold** words.\n\n> and a pull quote')
  })

  it('fills an empty section, not leaving an empty paragraph', () => {
    expect(brought('Only the lost words.', 'the lost words', '').text).toBe('the lost words')
  })

  it('is one undo, even straight after typing', () => {
    const old = 'Alpha.\n\nBeta words.'
    const { from, to } = range(old, 'Beta words')
    let state = EditorState.create({ schema, doc: doc('Alpha.'), plugins: [history({ newGroupDelay: 1000 })] })
    state = state.apply(state.tr.insertText(' More.', 7))
    state = state.apply(bringPassage(state, passageOf(doc(old), from, to)!)!)
    expect(serialize(toBlocks(state.doc))).toBe('Alpha. More.\n\nBeta words')
    undo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(serialize(toBlocks(state.doc))).toBe('Alpha. More.')
  })

  it('replaces nothing and merges nothing, even beside a selection', () => {
    const old = 'Alpha.\n\nBeta words.'
    const now = doc('Alpha.\n\nGamma.')
    const { from, to } = range(old, 'Beta words')
    let state = EditorState.create({ schema, doc: now, selection: TextSelection.create(now, 9, 12) })
    state = state.apply(bringPassage(state, passageOf(doc(old), from, to)!)!)
    expect(serialize(toBlocks(state.doc))).toBe('Alpha.\n\nBeta words\n\nGamma.')
  })
})
