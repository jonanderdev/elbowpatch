import { describe, expect, it } from 'vitest'
import { geometry, linesOf, MAX_SCALE, pageAt, pageCount } from './pager'

describe('paging maths', () => {
  it('a 390px phone shows the phone page as it is', () => {
    expect(geometry(390, 826)).toMatchObject({ k: 1, measure: 342, side: 24, stride: 390, top: 64, height: 670 })
  })

  it('a shorter phone shows it smaller, between the head and the foot', () => {
    const g = geometry(375, 667)
    expect(g.k).toBeCloseTo((667 - 64 - 92) / 670)
    expect(g.measure / g.k).toBeCloseTo(342)
    expect(g.top).toBeCloseTo(64)
  })

  it('a desktop takes the paperback page, scaled up to MAX_SCALE at most, centred', () => {
    expect(geometry(2560, 1440).k).toBe(MAX_SCALE)
    const g = geometry(1440, 620)
    expect(g.k).toBeCloseTo((620 - 64 - 84) / 686)
    expect(g.measure / g.k).toBeCloseTo(468)
    expect(g.height / g.k).toBeCloseTo(686)
    expect(g.side).toBeCloseTo((1440 - 540 * g.k) / 2 + 36 * g.k)
  })

  it('the wide measure narrows the side margins; the journal keeps room on the left for its rule', () => {
    expect(geometry(390, 826, true)).toMatchObject({ measure: 366, side: 12 })
    expect(geometry(390, 826, false, true)).toMatchObject({ measure: 322, side: 44 })
  })

  it('keeps the stride in whole pixels on an odd width', () => {
    expect(geometry(391.5, 800).stride).toBe(391)
  })

  it('counts pages from the width the columns take', () => {
    const g = geometry(540, 900)
    expect(pageCount(g.measure, g)).toBe(1)
    expect(pageCount(g.measure + g.stride, g)).toBe(2)
    expect(pageCount(g.measure + 299 * g.stride, g)).toBe(300)
  })

  it('finds the page holding a point', () => {
    const g = geometry(540, 900)
    expect(pageAt(0, g)).toBe(0)
    expect(pageAt(g.measure - 1, g)).toBe(0)
    expect(pageAt(g.stride, g)).toBe(1)
    expect(pageAt(5 * g.stride + 10, g)).toBe(5)
  })

  it('groups boxes of text into lines, page by page, top to bottom', () => {
    const g = geometry(540, 900)
    const flowLeft = 36 - g.stride // page 2 is in view
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
