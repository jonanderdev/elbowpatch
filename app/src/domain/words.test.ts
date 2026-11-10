import { describe, expect, it } from 'vitest'
import { pieceAsMarkdown } from './export'
import type { Piece } from './model'
import { countLine, countSaid, dayTitle, number, ordinal, pageLine, words } from './words'

describe('the count, where a number is not known', () => {
  it('says as much as is known, and nothing that is not', () => {
    expect(pageLine(3, 9)).toBe('Page 3 of 9')
    expect(pageLine(3, undefined)).toBe('Page 3')
    expect(pageLine(undefined, 9)).toBe('')
    expect(countLine(3, 9, '12 words')).toBe('3 of 9  ·  12 words')
    expect(countLine(3, undefined, '12 words')).toBe('3  ·  12 words')
    expect(countLine(undefined, undefined, '12 words')).toBe('12 words')
    expect(countSaid(3, 9, 1240)).toBe('Page 3 of 9, 1.240 words')
    expect(countSaid(undefined, undefined, 12)).toBe('12 words')
  })
})

describe('words', () => {
  it('writes thousands with a dot', () => {
    expect(number(1240)).toBe('1.240')
    expect(number(41240)).toBe('41.240')
    expect(number(1_000_000)).toBe('1.000.000')
    expect(number(999)).toBe('999')
    expect(words(1)).toBe('1 word')
    expect(words(1240)).toBe('1.240 words')
  })

  it('names journal days', () => {
    expect(dayTitle('2026-10-26')).toBe('Monday 26 October')
    expect(dayTitle('2026-10-26', true)).toBe('Monday 26 October 2026')
  })

  it('gives ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 27, 31].map((d) => d + ordinal(d))).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '27th',
      '31st',
    ])
  })
})

describe('one piece as markdown', () => {
  const base: Piece = { id: 'p', kind: 'essay', lang: 'en', createdAt: 0, updatedAt: 0, title: 'The second draft', sections: [], outlineId: null }

  it('writes an essay under its title', () => {
    expect(pieceAsMarkdown(base, [{ sectionId: 's', title: '', content: 'One.\n\nTwo.' }])).toEqual({
      name: 'The second draft.md',
      text: '# The second draft\n\nOne.\n\nTwo.\n',
    })
  })

  it('writes a journal under its title, each day a heading that carries the year', () => {
    const journal = { ...base, kind: 'journal' as const, title: 'Journal' }
    expect(pieceAsMarkdown(journal, [{ sectionId: 's', title: '2026-10-26', content: 'Rain.' }]).text).toBe('# Journal\n\n## Monday 26 October 2026\n\nRain.\n')
  })

  it('writes a book under its title and subtitle, a heading per chapter', () => {
    const book = { ...base, kind: 'book' as const, title: 'The Long Winter', subtitle: 'A year on the island' }
    const sections = [
      { sectionId: 'a', title: 'One', content: 'The ferry.' },
      { sectionId: 'b', title: '', content: 'Salt.' },
    ]
    expect(pieceAsMarkdown(book, sections).text).toBe('# The Long Winter\n\n*A year on the island*\n\n## One\n\nThe ferry.\n\n## Untitled\n\nSalt.\n')
  })

  it('leaves the subtitle line out when there is none, and keeps an empty book titled', () => {
    const book = { ...base, kind: 'book' as const, title: 'Quiet', subtitle: '  ' }
    expect(pieceAsMarkdown(book, []).text).toBe('# Quiet\n')
  })

  it('escapes what would end a subtitle early', () => {
    const book = { ...base, kind: 'book' as const, title: 'T', subtitle: 'A *star* and_a\\slash' }
    expect(pieceAsMarkdown(book, []).text).toBe('# T\n\n*A \\*star\\* and\\_a\\\\slash*\n')
  })

  it('names an untitled piece, and keeps file names safe', () => {
    expect(pieceAsMarkdown({ ...base, title: '' }, []).name).toBe('Untitled.md')
    expect(pieceAsMarkdown({ ...base, title: 'A/B: c?' }, []).name).toBe('AB c.md')
  })
})
