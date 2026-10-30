import { describe, expect, it } from 'vitest'
import { pieceAsMarkdown } from './export'
import type { Piece } from './model'
import { dayTitle, number, ordinal, words } from './words'

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

  it('writes a journal with the year in each day', () => {
    const journal = { ...base, kind: 'journal' as const, title: 'Journal' }
    expect(pieceAsMarkdown(journal, [{ sectionId: 's', title: '2026-10-26', content: 'Rain.' }]).text).toBe('# Monday 26 October 2026\n\nRain.\n')
  })

  it('names an untitled piece, and keeps file names safe', () => {
    expect(pieceAsMarkdown({ ...base, title: '' }, []).name).toBe('Untitled.md')
    expect(pieceAsMarkdown({ ...base, title: 'A/B: c?' }, []).name).toBe('AB c.md')
  })
})
