import { describe, expect, it } from 'vitest'
import { momentInSentence } from './momentInSentence'

// Local time throughout. Friday 6 November 2026.
const at = (month: number, day: number, hour = 0, minute = 0, year = 2026): number => new Date(year, month - 1, day, hour, minute).getTime()
const NOW = at(11, 6, 15, 30)

describe('a moment named mid-sentence', () => {
  it('starts relative words in lower case', () => {
    expect(momentInSentence(NOW - 10_000, NOW)).toBe('just now')
    expect(momentInSentence(at(11, 6, 14, 5), NOW)).toBe('this afternoon, 14:05')
    expect(momentInSentence(at(11, 5, 21, 10), NOW)).toBe('yesterday evening, 21:10')
    expect(momentInSentence(at(11, 6, 3, 0), NOW)).toBe('last night, 3:00')
  })

  it('leaves minutes as they are', () => {
    expect(momentInSentence(NOW - 12 * 60_000, NOW)).toBe('12 minutes ago')
  })

  it('keeps weekdays and dates in capitals', () => {
    expect(momentInSentence(at(11, 1, 21, 10), NOW)).toBe('Sunday evening')
    expect(momentInSentence(at(10, 14, 9, 0), NOW)).toBe('14 October')
    expect(momentInSentence(at(10, 14, 9, 0, 2025), NOW)).toBe('14 October 2025')
  })
})
