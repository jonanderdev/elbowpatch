import { history, undo } from 'prosemirror-history'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { parse, serialize } from '../domain/markdown'
import { schema, toBlocks, toDoc } from './schema'
import { forgetChapter, forgetSplit, forgetUndo, keepUndo, rememberSplit, splitOf, takeUndo } from './undoMemory'

const opened = (markdown: string) => EditorState.create({ doc: toDoc(parse(markdown)), plugins: [history()] })
const typed = (state: EditorState, text: string) => state.apply(state.tr.insertText(text, 1))
const markdownOf = (state: EditorState) => serialize(toBlocks(state.doc))
const SEAM = { front: 'inside', ending: 'Salt', raw: false, escaped: false } as const

describe("a chapter's undo, kept for the session", () => {
  it('comes back on a new page and still steps back', () => {
    keepUndo('a', typed(opened('Salt.'), 'Sea '))
    const back = takeUndo('a', 'Sea Salt.')?.reconfigure({ plugins: [history()] })
    expect(back).toBeDefined()
    let state = back!
    expect(
      undo(state, (tr) => {
        state = state.apply(tr)
      }),
    ).toBe(true)
    expect(markdownOf(state)).toBe('Salt.')
  })

  it('is not used on a text it did not end on: replayed there it would double or lose words', () => {
    keepUndo('a', typed(opened('The whole text.'), 'Sea '))
    expect(takeUndo('a', 'The whole')).toBeUndefined()
    // And it is gone, not kept for later.
    expect(takeUndo('a', 'Sea The whole text.')).toBeUndefined()
  })

  it('reads the text as the page would, so Markdown the page tidies still matches', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text('One.')),
      schema.nodes.paragraph.create(),
      schema.nodes.paragraph.create(null, schema.text('Two.')),
    ])
    keepUndo('a', EditorState.create({ doc, plugins: [history()] }))
    expect(takeUndo('a', 'One.\n\n\n\nTwo.\n')).toBeDefined()
  })

  it('a section never left has nothing kept', () => {
    expect(takeUndo('never', 'Words.')).toBeUndefined()
  })
})

describe('a chapter born of a split', () => {
  it('is remembered while its text is what the split gave it', () => {
    rememberSplit('b', { into: 'a', after: '*windows*  and the rail.', seam: SEAM })
    expect(splitOf('b', '*windows*  and the rail.')).toMatchObject({ into: 'a', seam: SEAM })
  })

  it('is not rejoined by undo with words still typed in it', () => {
    rememberSplit('b', { into: 'a', after: 'The rail.', seam: SEAM })
    expect(splitOf('b', 'The rail. Typed.')).toBeUndefined()
  })

  it('is forgotten once it has gone back', () => {
    rememberSplit('b', { into: 'a', after: 'The rail.', seam: SEAM })
    forgetSplit('b')
    expect(splitOf('b', 'The rail.')).toBeUndefined()
  })

  it('a chapter that was never split is not one', () => {
    expect(splitOf('other', 'The rail.')).toBeUndefined()
  })
})

describe('a chapter that left the book', () => {
  it('takes its history with it', () => {
    keepUndo('gone', opened(''))
    forgetChapter('gone')
    expect(takeUndo('gone', '')).toBeUndefined()
  })

  it('takes its split with it', () => {
    rememberSplit('gone', { into: 'a', after: 'Salt.', seam: SEAM })
    forgetChapter('gone')
    expect(splitOf('gone', 'Salt.')).toBeUndefined()
  })

  it('takes with it the splits that would go back into it, and no other', () => {
    rememberSplit('later', { into: 'gone', after: 'Salt.', seam: SEAM })
    rememberSplit('other', { into: 'a', after: 'Sea.', seam: SEAM })
    forgetChapter('gone')
    expect(splitOf('later', 'Salt.')).toBeUndefined()
    expect(splitOf('other', 'Sea.')).toBeDefined()
    forgetSplit('other')
  })
})

describe('a section brought back to a moment', () => {
  it('has no history for the session, even where the text it holds is the text that history ended on', () => {
    keepUndo('a', typed(opened('Salt.'), 'Sea '))
    forgetUndo('a')
    expect(takeUndo('a', 'Sea Salt.')).toBeUndefined()
  })

  it('is not rejoined by undo as a chapter split off, nor is what split off from it, and no other split goes', () => {
    rememberSplit('b', { into: 'a', after: 'The rail.', seam: SEAM })
    rememberSplit('c', { into: 'b', after: 'Sea.', seam: SEAM })
    rememberSplit('d', { into: 'a', after: 'Tide.', seam: SEAM })
    forgetUndo('b')
    expect(splitOf('b', 'The rail.')).toBeUndefined()
    expect(splitOf('c', 'Sea.')).toBeUndefined()
    expect(splitOf('d', 'Tide.')).toBeDefined()
    forgetSplit('d')
  })
})
