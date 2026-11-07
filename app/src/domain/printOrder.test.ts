import { describe, expect, it } from 'vitest'
import type { Kind, Piece } from './model'
import type { OpenSection } from './pieces'
import { printOrder } from './printOrder'

function piece(kind: Kind, title: string, subtitle?: string): Piece {
  return { id: 'p', kind, lang: 'en', createdAt: 0, updatedAt: 0, title, ...(subtitle === undefined ? {} : { subtitle }), sections: [], outlineId: null }
}

const day = (title: string, content: string): OpenSection => ({ sectionId: title, title, content })

describe('what a journal prints, and in what order', () => {
  it('opens with its title page, then each day with words, the day set as the page shows it', () => {
    const order = printOrder(piece('journal', 'Dream journal', 'nights since the move'), [
      day('2026-10-26', 'Rain all morning.'),
      day('2026-10-27', 'Walked to the quay.'),
    ])
    expect(order).toEqual([
      { kind: 'title', title: 'Dream journal', subtitle: 'nights since the move' },
      { kind: 'section', heading: 'Monday 26 October', content: 'Rain all morning.' },
      { kind: 'section', heading: 'Tuesday 27 October', content: 'Walked to the quay.' },
    ])
  })

  it('leaves out a day with no words, whatever else surrounds it', () => {
    const order = printOrder(piece('journal', 'Dream journal'), [
      day('2026-10-25', ''),
      day('2026-10-26', 'Rain all morning.'),
      day('2026-10-27', '  \n\n '),
      day('2026-10-28', 'Kept one page of four.'),
    ])
    expect(order.map((item) => (item.kind === 'section' ? item.heading : item.kind))).toEqual(['title', 'Monday 26 October', 'Wednesday 28 October'])
  })

  it('is its title page alone when no day has words', () => {
    expect(printOrder(piece('journal', 'Dream journal'), [day('2026-10-26', '')])).toEqual([{ kind: 'title', title: 'Dream journal', subtitle: '' }])
    expect(printOrder(piece('journal', 'Dream journal'), [])).toEqual([{ kind: 'title', title: 'Dream journal', subtitle: '' }])
  })

  it('keeps the title page for a journal with no title, so there is still a page', () => {
    expect(printOrder(piece('journal', '  '), [])).toEqual([{ kind: 'title', title: '', subtitle: '' }])
  })

  it('sets a subtitle on one line, without the stray spaces', () => {
    const [title] = printOrder(piece('journal', ' Dream  journal ', '  nights\nsince   the move '), [])
    expect(title).toEqual({ kind: 'title', title: 'Dream  journal', subtitle: 'nights since the move' })
  })
})

describe('what an essay prints', () => {
  it('is its text under its title, with no title page', () => {
    expect(printOrder(piece('essay', ' The second draft '), [{ sectionId: 'a', title: '', content: 'We kept the lamp lit.' }])).toEqual([
      { kind: 'section', heading: 'The second draft', content: 'We kept the lamp lit.' },
    ])
  })

  it('is one page even with no words', () => {
    expect(printOrder(piece('essay', 'Empty'), [])).toEqual([{ kind: 'section', heading: 'Empty', content: '' }])
  })
})

describe('what a book prints, and in what order', () => {
  const chapter = (title: string, content: string): OpenSection => ({ sectionId: title, title, content })

  it('opens with its title page, then its contents, then each chapter under its title', () => {
    const order = printOrder(piece('book', 'The harbour in winter', 'a story in six chapters'), [
      chapter('The ferry at seven', 'The first boat was late.'),
      chapter('Salt on the windows', 'Ana scraped a small square clear.'),
    ])
    expect(order).toEqual([
      { kind: 'title', title: 'The harbour in winter', subtitle: 'a story in six chapters' },
      { kind: 'contents' },
      { kind: 'section', heading: 'The ferry at seven', content: 'The first boat was late.' },
      { kind: 'section', heading: 'Salt on the windows', content: 'Ana scraped a small square clear.' },
    ])
  })

  it('keeps a chapter with no words, in its place', () => {
    const order = printOrder(piece('book', 'The harbour in winter'), [chapter('One', 'Words.'), chapter('Two', ''), chapter('Three', '  \n ')])
    expect(order.map((item) => (item.kind === 'section' ? item.heading : item.kind))).toEqual(['title', 'contents', 'One', 'Two', 'Three'])
  })

  it('calls a chapter with no title Untitled, as Contents does', () => {
    const order = printOrder(piece('book', 'B'), [chapter('  ', 'Words.')])
    expect(order[2]).toEqual({ kind: 'section', heading: 'Untitled', content: 'Words.' })
  })

  it('is its title page and contents when it has no chapters, so there is still a file', () => {
    expect(printOrder(piece('book', 'B'), [])).toEqual([{ kind: 'title', title: 'B', subtitle: '' }, { kind: 'contents' }])
  })
})
