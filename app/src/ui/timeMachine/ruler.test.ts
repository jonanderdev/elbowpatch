import { describe, expect, it } from 'vitest'
import { nearestTick, tapeLabels, tickSpacing } from './ruler'

const at = (day: number, hour = 12): number => new Date(2026, 10, day, hour).getTime()
const NOW = at(6, 15)

describe('the spacing of the ticks', () => {
  it('spreads a few across the bar, 44px apart at most', () => {
    expect(tickSpacing(2)).toBe(44)
    expect(tickSpacing(4)).toBe(44)
  })

  it('comes down to 11px, and no closer', () => {
    expect(tickSpacing(28)).toBe(11)
    expect(tickSpacing(5000)).toBe(11)
  })
})

describe('the labels on the tape', () => {
  it('end on Now', () => {
    expect(tapeLabels([at(6, 9), at(6, 14)], NOW, 44).at(-1)).toBe('Now')
  })

  it('name a unit once, at its first tick', () => {
    const labels = tapeLabels([at(3, 9), at(3, 10), at(3, 11), at(4, 9), at(4, 10), NOW], NOW, 44)
    expect(labels).toEqual(['Tue', undefined, undefined, 'Wed', undefined, 'Now'])
  })

  it('leave out a label that would meet its neighbour, as on a ruler', () => {
    const labels = tapeLabels([at(6, 9), at(6, 10), NOW], NOW, 11)
    expect(labels).toEqual([undefined, undefined, 'Now'])
  })

  it('keep the ones with room', () => {
    const ats = [...Array.from({ length: 4 }, (_, i) => at(3, i + 1)), ...Array.from({ length: 6 }, (_, i) => at(4, i + 1)), NOW]
    expect(tapeLabels(ats, NOW, 11).filter(Boolean)).toEqual(['Tue', 'Wed', 'Now'])
  })
})

describe('a tap on the tape', () => {
  it('goes to the nearest tick', () => {
    expect(nearestTick(5, 10, 44, 20)).toBe(5)
    expect(nearestTick(5, 10, 44, 23)).toBe(6)
    expect(nearestTick(5, 10, 44, -46)).toBe(4)
  })

  it('stays on the tape', () => {
    expect(nearestTick(1, 3, 44, 500)).toBe(2)
    expect(nearestTick(1, 3, 44, -500)).toBe(0)
  })
})
