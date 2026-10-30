import { describe, expect, it } from 'vitest'
import { geometry, linesOf, pageAt, pageCount } from './pager'

describe('paging maths', () => {
  it('a phone keeps 24px margins; a desktop keeps the reading measure, centred', () => {
    expect(geometry(390, 544, 24)).toEqual({ measure: 342, side: 24, stride: 390 })
    expect(geometry(1440, 544, 24)).toEqual({ measure: 544, side: 448, stride: 1440 })
  })

  it("the journal's margin rule gets room on the left of a phone page", () => {
    expect(geometry(390, 544, 24, 44)).toEqual({ measure: 322, side: 44, stride: 390 })
    // On a desktop the centred column already has more than enough.
    expect(geometry(1440, 544, 24, 44)).toEqual({ measure: 544, side: 448, stride: 1440 })
  })

  it('stays in whole pixels on an odd width', () => {
    const g = geometry(391, 544, 24)
    expect(Number.isInteger(g.measure) && Number.isInteger(g.side)).toBe(true)
    expect(g.stride).toBeLessThanOrEqual(391)
  })

  it('counts pages from the width the columns take', () => {
    const g = geometry(390, 544, 24)
    expect(pageCount(g.measure, g)).toBe(1)
    expect(pageCount(g.measure + g.stride, g)).toBe(2)
    expect(pageCount(g.measure + 299 * g.stride, g)).toBe(300)
  })

  it('finds the page holding a point', () => {
    const g = geometry(390, 544, 24)
    expect(pageAt(0, g)).toBe(0)
    expect(pageAt(g.measure - 1, g)).toBe(0)
    expect(pageAt(g.stride, g)).toBe(1)
    expect(pageAt(5 * g.stride + 10, g)).toBe(5)
  })

  it('groups boxes of text into lines, page by page, top to bottom', () => {
    const g = geometry(390, 544, 24)
    const flowLeft = 24 - g.stride // page 2 is in view
    const box = (page: number, top: number, left: number, right: number) => ({
      top,
      bottom: top + 28,
      left: flowLeft + page * g.stride + left,
      right: flowLeft + page * g.stride + right,
    })
    const lines = linesOf([box(1, 88, 0, 300), box(0, 700, 0, 340), box(1, 88, 300, 330), box(0, 671, 0, 342), box(1, 117, 0, 120)], g, flowLeft, 29)
    expect(lines.map((l) => [l.page, l.top, l.left, l.right])).toEqual([
      [0, 671, 0, 342],
      [0, 700, 0, 340],
      // A word in italic is its own box on the same line.
      [1, 88, 0, 330],
      [1, 117, 0, 120],
    ])
  })
})
