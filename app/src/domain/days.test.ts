import { describe, expect, it } from 'vitest'
import { type Day, dayBeyond, daysAsItWas, daysLine, journalDays, monthAfter, monthCells, monthLine, monthOf, monthsOf } from './days'
import type { Piece } from './model'

const journal = (days: Record<string, number>): Piece => ({
  id: 'j',
  kind: 'journal',
  lang: 'en',
  createdAt: 0,
  updatedAt: 0,
  title: 'Journal',
  sections: Object.keys(days).map((iso) => ({ sectionId: `s-${iso}`, title: iso })),
  words: Object.fromEntries(Object.entries(days).map(([iso, n]) => [`s-${iso}`, n])),
  outlineId: null,
})

const TODAY = '2026-10-30'

describe('journalDays', () => {
  it('lists today first, then each stored day, latest first', () => {
    const days = journalDays(journal({ '2026-10-26': 312, '2026-10-29': 412 }), TODAY)
    expect(days).toEqual([
      { iso: '2026-10-30', words: 0 },
      { iso: '2026-10-29', sectionId: 's-2026-10-29', words: 412 },
      { iso: '2026-10-26', sectionId: 's-2026-10-26', words: 312 },
    ])
  })

  it('gives the open day the words on the page, not the ones last stored', () => {
    const days = journalDays(journal({ '2026-10-26': 312 }), TODAY, { sectionId: 's-2026-10-26', words: 320 })
    expect(days[1]?.words).toBe(320)
  })

  it('keeps a day emptied since: its history is still there to reach', () => {
    const days = journalDays(journal({ '2026-10-26': 0 }), TODAY)
    expect(days.map((d) => d.iso)).toEqual(['2026-10-30', '2026-10-26'])
  })

  it('counts a section with no words kept as none', () => {
    const { words: _, ...piece } = journal({ '2026-10-26': 1 })
    expect(journalDays(piece, TODAY)[1]?.words).toBe(0)
  })

  it('keeps a day written ahead of today in date order, so it can be reached', () => {
    const days = journalDays(journal({ '2026-11-02': 9 }), TODAY)
    expect(days.map((d) => d.iso)).toEqual(['2026-11-02', '2026-10-30'])
  })
})

describe('daysAsItWas', () => {
  const sections = [
    { sectionId: 's-22', title: '2026-10-22' },
    { sectionId: 's-26', title: '2026-10-26' },
  ]

  it('lists each day the journal had, latest first, with the words it held then, and no today', () => {
    expect(daysAsItWas(sections, { 's-22': 3, 's-26': 5 })).toEqual([
      { iso: '2026-10-26', sectionId: 's-26', words: 5 },
      { iso: '2026-10-22', sectionId: 's-22', words: 3 },
    ])
  })

  it('counts a day with no words known as none', () => {
    expect(daysAsItWas(sections, { 's-22': 3 }).map((d) => d.words)).toEqual([0, 3])
  })
})

describe('dayBeyond', () => {
  const days = journalDays(journal({ '2026-10-26': 312, '2026-10-29': 412 }), TODAY)

  it('turns on to the next day and back to the one before', () => {
    expect(dayBeyond(days, '2026-10-26', 1)?.iso).toBe('2026-10-29')
    expect(dayBeyond(days, '2026-10-29', -1)?.iso).toBe('2026-10-26')
  })

  it('turns on from the last written day to today, written or not', () => {
    expect(dayBeyond(days, '2026-10-29', 1)?.iso).toBe('2026-10-30')
  })

  it('stops at the journal’s ends', () => {
    expect(dayBeyond(days, '2026-10-30', 1)).toBeUndefined()
    expect(dayBeyond(days, '2026-10-26', -1)).toBeUndefined()
  })
})

describe('the count lines', () => {
  const days: Day[] = [
    { iso: '2026-10-30', words: 0 },
    { iso: '2026-10-29', sectionId: 'a', words: 412 },
    { iso: '2026-10-26', sectionId: 'b', words: 312 },
    { iso: '2026-09-12', sectionId: 'c', words: 90 },
  ]

  it('says the journal’s written days and the month’s, leaving out a today not begun', () => {
    expect(daysLine(days, '2026-10-26')).toBe('3 days · 2 in October')
  })

  it('counts today once it has words', () => {
    const begun = [{ iso: TODAY, sectionId: 't', words: 5 }, ...days.slice(1)]
    expect(daysLine(begun, TODAY)).toBe('4 days · 3 in October')
  })

  it('leaves out a past day open but not begun', () => {
    expect(daysLine([...days, { iso: '2026-10-04', sectionId: 'd', words: 0 }], '2026-10-26')).toBe('3 days · 2 in October')
  })

  it('writes a thousand as the app does, and one day as one', () => {
    const many: Day[] = Array.from({ length: 1240 }, (_, i) => ({ iso: '2020-01-02', sectionId: `${i}`, words: 1 }))
    expect(daysLine(many, '2020-01-02')).toBe('1.240 days · 1.240 in January')
    expect(daysLine(days.slice(3), '2026-09-12')).toBe('1 day · 1 in September')
  })

  it('says how many days of a month are written', () => {
    expect(monthLine(days, '2026-10')).toBe('2 days written in October')
    expect(monthLine(days, '2026-09')).toBe('1 day written in September')
    expect(monthLine(days, '2026-08')).toBe('No days written in August')
  })
})

describe('months', () => {
  it('names a day’s month', () => {
    expect(monthOf('2026-10-26')).toBe('2026-10')
  })

  it('steps across a year', () => {
    expect(monthAfter('2026-12', 1)).toBe('2027-01')
    expect(monthAfter('2026-01', -1)).toBe('2025-12')
    expect(monthAfter('2026-10', 1)).toBe('2026-11')
  })

  it('groups days under their month, keeping their order', () => {
    const grouped = monthsOf([
      { iso: '2026-10-29', words: 1 },
      { iso: '2026-10-26', words: 1 },
      { iso: '2026-09-12', words: 1 },
    ])
    expect(grouped.map((m) => [m.month, m.days.length])).toEqual([
      ['2026-10', 2],
      ['2026-09', 1],
    ])
  })
})

describe('monthCells', () => {
  const days: Day[] = [
    { iso: '2026-10-27', words: 0 },
    { iso: '2026-10-26', sectionId: 'a', words: 312 },
    { iso: '2026-10-01', sectionId: 'b', words: 40 },
  ]
  const october = monthCells('2026-10', days, { today: '2026-10-27', last: '2026-10-27' })
  const cell = (cells: ReturnType<typeof monthCells>, day: number) => cells.find((c) => c?.day === day)

  it('starts the week on Monday', () => {
    // 1 October 2026 is a Thursday: three blanks, as drawn.
    expect(october.slice(0, 4).map((c) => c?.day)).toEqual([undefined, undefined, undefined, 1])
  })

  it('holds every day of the month', () => {
    expect(october.filter(Boolean)).toHaveLength(31)
    expect(monthCells('2028-02', [], { last: '2028-12-31' }).filter(Boolean)).toHaveLength(29)
  })

  it('tells written, empty, today and days to come apart', () => {
    expect(cell(october, 26)?.state).toBe('written')
    expect(cell(october, 4)?.state).toBe('empty')
    expect(cell(october, 27)?.state).toBe('today')
    expect(cell(october, 28)?.state).toBe('future')
  })

  it('holds the day that opens: a written one, a today not begun, a past day not written, and none to come', () => {
    expect(cell(october, 26)?.opens?.sectionId).toBe('a')
    expect(cell(october, 27)?.opens).toEqual({ iso: '2026-10-27', words: 0 })
    expect(cell(october, 4)?.opens).toEqual({ iso: '2026-10-04', words: 0 })
    expect(cell(october, 28)?.opens).toBeUndefined()
  })

  it('opens only what was there when no today is named', () => {
    const asItWas = monthCells('2026-10', days.slice(1), { last: '2026-10-26' })
    expect(cell(asItWas, 26)?.opens?.sectionId).toBe('a')
    expect(cell(asItWas, 4)?.state).toBe('empty')
    expect(cell(asItWas, 4)?.opens).toBeUndefined()
  })

  it('shows a day emptied since as empty, and still opens it: its moments are there', () => {
    const emptied = monthCells('2026-10', [{ iso: '2026-10-05', sectionId: 'e', words: 0 }], { last: '2026-10-27' })
    expect(cell(emptied, 5)?.state).toBe('empty')
    expect(cell(emptied, 5)?.opens?.sectionId).toBe('e')
  })

  it('marks nothing as today when none is named, and days after the last recede', () => {
    const asItWas = monthCells('2026-10', days.slice(1), { last: '2026-10-26' })
    expect(cell(asItWas, 26)?.state).toBe('written')
    expect(cell(asItWas, 27)?.state).toBe('future')
    expect(asItWas.some((c) => c?.state === 'today')).toBe(false)
  })

  it('never lets a written day recede: one dated ahead of today still opens', () => {
    const ahead = monthCells('2026-11', [{ iso: '2026-11-02', sectionId: 'x', words: 9 }], { today: '2026-10-30', last: '2026-10-30' })
    expect(cell(ahead, 2)?.state).toBe('written')
    expect(cell(ahead, 3)?.state).toBe('future')
  })

  it('labels each day for a screen reader', () => {
    expect(cell(october, 26)?.label).toBe('26 October, written')
    expect(cell(october, 4)?.label).toBe('4 October, nothing written')
    expect(cell(october, 27)?.label).toBe('27 October, today')
    expect(cell(october, 28)?.label).toBe('28 October, still to come')
  })

  it('says when today is written', () => {
    const written = monthCells('2026-10', [{ iso: '2026-10-27', sectionId: 't', words: 3 }], { today: '2026-10-27', last: '2026-10-27' })
    expect(cell(written, 27)?.label).toBe('27 October, today, written')
  })
})
