import { describe, expect, it } from 'vitest'
import { momentFull, momentName, momentPhrase, momentShort, tapeLabel } from './words'

// Local time throughout, so these read the same in any time zone. Friday 6 November 2026.
const at = (month: number, day: number, hour = 0, minute = 0, year = 2026): number => new Date(year, month - 1, day, hour, minute).getTime()
const NOW = at(11, 6, 15, 30)

describe('a moment in plain words', () => {
  it('is just now under a minute', () => {
    expect(momentName(NOW - 59_000, NOW)).toBe('Just now')
    expect(momentName(NOW, NOW)).toBe('Just now')
  })

  it('never reads as the future, whatever the clock did', () => {
    expect(momentName(NOW + 3_600_000, NOW)).toBe('Just now')
  })

  it('counts minutes within the hour', () => {
    expect(momentName(NOW - 60_000, NOW)).toBe('1 minute ago')
    expect(momentName(NOW - 12 * 60_000, NOW)).toBe('12 minutes ago')
    expect(momentName(NOW - 59 * 60_000, NOW)).toBe('59 minutes ago')
    expect(momentName(NOW - 60 * 60_000, NOW)).toBe('This afternoon, 14:30')
  })

  it('names the part of today, with a 24-hour clock', () => {
    expect(momentName(at(11, 6, 14, 5), NOW)).toBe('This afternoon, 14:05')
    expect(momentName(at(11, 6, 12, 0), NOW)).toBe('This afternoon, 12:00')
    expect(momentName(at(11, 6, 11, 59), NOW)).toBe('This morning, 11:59')
    expect(momentName(at(11, 6, 9, 5), NOW)).toBe('This morning, 9:05')
    expect(momentName(at(11, 6, 5, 0), NOW)).toBe('This morning, 5:00')
    expect(momentName(at(11, 6, 17, 59), at(11, 6, 22, 0))).toBe('This afternoon, 17:59')
    expect(momentName(at(11, 6, 18, 0), at(11, 6, 22, 0))).toBe('This evening, 18:00')
    expect(momentName(at(11, 6, 19, 0), at(11, 6, 22, 0))).toBe('This evening, 19:00')
  })

  it('calls the small hours of today last night', () => {
    expect(momentName(at(11, 6, 4, 59), NOW)).toBe('Last night, 4:59')
  })

  it('goes by the calendar for yesterday, not by 24 hours', () => {
    expect(momentName(at(11, 5, 21, 10), NOW)).toBe('Yesterday evening, 21:10')
    expect(momentName(at(11, 5, 23, 0), NOW)).toBe('Yesterday night, 23:00')
    expect(momentName(at(11, 5, 22, 59), NOW)).toBe('Yesterday evening, 22:59')
    expect(momentName(at(11, 5, 22, 50), at(11, 6, 0, 55))).toBe('Yesterday evening, 22:50')
    expect(momentName(at(11, 5, 8, 0), NOW)).toBe('Yesterday morning, 8:00')
  })

  it('turns the day at midnight', () => {
    const small = at(11, 6, 2, 0)
    expect(momentName(at(11, 6, 0, 0), small)).toBe('Last night, 0:00')
    expect(momentName(at(11, 5, 23, 59), small)).toBe('Yesterday night, 23:59')
    expect(momentName(at(11, 5, 0, 0), small)).toBe('Yesterday night, 0:00')
    expect(momentName(at(11, 4, 23, 59), small)).toBe('Wednesday night')
  })

  it('counts days as the calendar does when the clocks change', () => {
    // Where the clocks go back or forward on these Sundays, the day between is 25 or 23 hours long.
    expect(momentName(at(10, 25, 0, 10), at(10, 26, 0, 30))).toBe('Yesterday night, 0:10')
    expect(momentName(at(10, 25, 12, 0), at(10, 25, 23, 50))).toBe('This afternoon, 12:00')
    expect(momentName(at(3, 29, 0, 10), at(3, 30, 0, 30))).toBe('Yesterday night, 0:10')
    expect(momentName(at(3, 28, 23, 50), at(3, 29, 23, 30))).toBe('Yesterday night, 23:50')
    expect(momentName(at(10, 19, 12, 0), at(10, 26, 12, 0))).toBe('19 October')
  })

  it('names the weekday within the week, and never one that could be today', () => {
    expect(momentName(at(11, 4, 18, 0), NOW)).toBe('Wednesday evening')
    expect(momentName(at(11, 1, 21, 0), NOW)).toBe('Sunday evening')
    expect(momentName(at(10, 31, 12, 0), NOW)).toBe('Saturday afternoon')
    expect(momentName(at(10, 30, 16, 0), NOW)).toBe('30 October')
  })

  it('gives the date this year, and the year before it', () => {
    expect(momentName(at(10, 14, 9), NOW)).toBe('14 October')
    expect(momentName(at(1, 1, 9), NOW)).toBe('1 January')
    expect(momentName(at(12, 31, 22, 0, 2025), NOW)).toBe('31 December 2025')
    expect(momentName(at(10, 14, 9, 0, 2025), NOW)).toBe('14 October 2025')
  })

  it('crosses a new year as a calendar does', () => {
    const newYear = at(1, 1, 10, 0, 2027)
    expect(momentName(at(12, 31, 21, 10), newYear)).toBe('Yesterday evening, 21:10')
    expect(momentName(at(12, 28, 21, 10), newYear)).toBe('Monday evening')
  })
})

describe('a moment in the path', () => {
  it('stands whole, without its clock time', () => {
    expect(momentShort(at(11, 5, 21, 10), NOW)).toBe('Yesterday evening')
    expect(momentShort(at(11, 6, 14, 5), NOW)).toBe('This afternoon')
    expect(momentShort(at(11, 1, 21, 0), NOW)).toBe('Sunday evening')
    expect(momentShort(NOW - 12 * 60_000, NOW)).toBe('12 minutes ago')
    expect(momentShort(at(10, 14, 9, 0, 2025), NOW)).toBe('14 October 2025')
  })
})

describe('a moment read out', () => {
  it('is the full date and time', () => {
    expect(momentFull(at(10, 25, 21, 10), NOW)).toBe('Sunday 25 October, 21:10')
    expect(momentFull(at(10, 26, 9, 5), NOW)).toBe('Monday 26 October, 9:05')
  })

  it('carries the year when it is not this one', () => {
    expect(momentFull(at(10, 14, 21, 10, 2025), NOW)).toBe('Tuesday 14 October 2025, 21:10')
  })
})

describe('a label on the tape', () => {
  it('is the hour today', () => {
    expect(tapeLabel(at(11, 6, 9, 40), NOW)).toBe('9:00')
    expect(tapeLabel(at(11, 6, 13, 5), NOW)).toBe('13:00')
  })

  it('is the weekday within the week', () => {
    expect(tapeLabel(at(11, 5, 21), NOW)).toBe('Thu')
    expect(tapeLabel(at(10, 31, 12), NOW)).toBe('Sat')
  })

  it('changes unit at midnight', () => {
    expect(tapeLabel(at(11, 6, 0, 0), NOW)).toBe('0:00')
    expect(tapeLabel(at(11, 5, 23, 59), NOW)).toBe('Thu')
  })

  it('is the date within the year', () => {
    expect(tapeLabel(at(10, 30, 16), NOW)).toBe('30 Oct')
    expect(tapeLabel(at(1, 9, 16), NOW)).toBe('9 Jan')
  })

  it('is the month before that', () => {
    expect(tapeLabel(at(9, 12, 16, 0, 2025), NOW)).toBe('Sep')
  })

  it('crosses a new year as a calendar does', () => {
    const newYear = at(1, 1, 10, 0, 2027)
    expect(tapeLabel(at(12, 31, 21, 10), newYear)).toBe('Thu')
    expect(tapeLabel(at(12, 26, 12, 0), newYear)).toBe('Sat')
    expect(tapeLabel(at(12, 25, 12, 0), newYear)).toBe('Dec')
    expect(tapeLabel(at(1, 1, 9, 0, 2027), at(1, 9, 10, 0, 2027))).toBe('1 Jan')
    expect(tapeLabel(at(12, 31, 12, 0), at(1, 9, 10, 0, 2027))).toBe('Dec')
  })
})

describe('a moment inside a sentence', () => {
  it('lowercases the relative words', () => {
    expect(momentPhrase(NOW - 5_000, NOW)).toBe('just now')
    expect(momentPhrase(NOW - 12 * 60_000, NOW)).toBe('12 minutes ago')
    expect(momentPhrase(at(11, 6, 9, 5), NOW)).toBe('this morning, 9:05')
    expect(momentPhrase(at(11, 5, 21, 10), NOW)).toBe('yesterday evening, 21:10')
    expect(momentPhrase(at(11, 6, 0, 0), NOW)).toBe('last night, 0:00')
  })

  it('keeps weekdays and dates as they are', () => {
    expect(momentPhrase(at(11, 1, 21, 10), NOW)).toBe('Sunday evening')
    expect(momentPhrase(at(10, 14), NOW)).toBe('14 October')
    expect(momentPhrase(at(10, 14, 12, 0, 2025), NOW)).toBe('14 October 2025')
  })
})
