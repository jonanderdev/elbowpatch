import { describe, expect, it } from 'vitest'
import { firstWords, openingsOf } from './openings'

/** The pages of a text laid out by hand: for each run, the page each of its words falls on. */
function openings(runs: string[], count: number, pages: number[][]): string[] {
  return openingsOf(runs, count, (run, start) => {
    const before = [...(runs[run] ?? '').slice(0, start).matchAll(/\S+/g)].length
    return pages[run]?.[before] ?? -1
  })
}

describe('a page by its first words', () => {
  it('keeps whole words, under twenty characters', () => {
    expect(firstWords('Nobody remembers the first draft.')).toBe('Nobody remembers')
    expect(firstWords('This is why writers keep their old pages.')).toBe('This is why writers')
    expect(firstWords('So the second draft is the one.')).toBe('So the second draft')
  })

  it('a short page says all it has', () => {
    expect(firstWords('The end.')).toBe('The end.')
  })

  it('a long first word stands whole', () => {
    expect(firstWords('Donaudampfschifffahrtsgesellschaft sailed on')).toBe('Donaudampfschifffahrtsgesellschaft')
  })

  it('ignores the space around the words', () => {
    expect(firstWords('  one \n two  ')).toBe('one two')
  })

  it('has nothing to say of no words', () => {
    expect(firstWords('   ')).toBe('')
  })
})

describe('the openings of the pages', () => {
  it('finds the first word on each page, inside a paragraph too', () => {
    expect(openings(['one two three four five six'], 3, [[0, 0, 1, 1, 2, 2]])).toEqual(['one two three four', 'three four five six', 'five six'])
  })

  it('reads on past the end of a paragraph, with a space between them', () => {
    expect(openings(['one', ' ', 'two three'], 2, [[0], [], [1, 1]])).toEqual(['one two three', 'two three'])
  })

  it('keeps a word whole across a change of style', () => {
    expect(openings(['Sun', 'day came'], 1, [[0], [0, 0]])).toEqual(['Sunday came'])
  })

  it('leaves a page with no words blank, and goes on', () => {
    expect(openings(['one', ' ', 'two'], 3, [[0], [], [2]])).toEqual(['one two', '', 'two'])
  })

  it('leaves every page blank in an empty text', () => {
    expect(openings([], 2, [])).toEqual(['', ''])
  })
})
