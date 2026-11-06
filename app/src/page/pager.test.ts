import { describe, expect, it } from 'vitest'
import { aboveMomentBar, geometry, linesOf, MAX_SCALE, pageAt, RAIL_WIDTH } from './pager'

describe('the page beside the rail', () => {
  it('centres in the width right of an open rail, at the same scale, so its breaks stay', () => {
    const alone = geometry(1440, 900)
    const beside = geometry(1440, 900, false, false, true)
    expect(beside.side).toBe(alone.side + RAIL_WIDTH / 2)
    expect({ ...beside, side: 0 }).toEqual({ ...alone, side: 0 })
  })

  it('stays centred on the window where the rail has no room beside it', () => {
    expect(geometry(1000, 900, false, false, true)).toEqual(geometry(1000, 900))
  })
})

describe('the page above the moment bar', () => {
  it('ends 24px above the bar on a phone: 86px shorter than the writing page', () => {
    const page = geometry(390, 844)
    const short = aboveMomentBar(page, 844)
    expect(short.height).toBe(602)
    expect(page.height - short.height).toBe(86)
    expect(short.top + short.height).toBe(666)
  })

  it('ends 20px above the bar on desktop', () => {
    const short = aboveMomentBar(geometry(1440, 900), 900)
    expect(short.top + short.height).toBe(730)
  })

  it('keeps the column and the type: only the height changes', () => {
    for (const [width, height] of [
      [390, 844],
      [1440, 900],
      [1440, 620],
    ] as const) {
      const page = geometry(width, height)
      const { height: _, bottom: __, ...rest } = aboveMomentBar(page, height)
      const { height: ___, bottom: ____, ...same } = page
      expect(rest).toEqual(same)
    }
  })

  it('never grows past the writing page', () => {
    const page = geometry(1440, 2000)
    expect(aboveMomentBar(page, 2000).height).toBe(page.height)
  })
})

describe('paging maths', () => {
  it('a 390px phone shows the phone page as it is', () => {
    expect(geometry(390, 826)).toMatchObject({ k: 1, measure: 342, side: 24, stride: 390, top: 64, height: 670 })
  })

  it('a phone fills its width, and its text all the height between the head and the foot', () => {
    const g = geometry(402, 670)
    expect(g.k).toBeCloseTo(402 / 390)
    expect(g.measure / g.k).toBeCloseTo(342)
    expect(g.top).toBe(64)
    expect(g.height).toBeCloseTo(670 - 64 - 92)
    expect(g.bottom).toBeCloseTo(92)
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
