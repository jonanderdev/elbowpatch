import { describe, expect, it } from 'vitest'
import { glideTime, MAX_THROW, nearestTick, settleOn, tapeLabels, tickSpacing, ticksInReach } from './ruler'

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

describe('where the tape settles when let go', () => {
  it('on the nearest tick when it was still', () => {
    expect(settleOn(5 * 11 + 4, 0, 11, 20)).toBe(5)
    expect(settleOn(5 * 11 + 6, 0, 11, 20)).toBe(6)
  })

  it('further on in the way it was going, by how fast it was', () => {
    expect(settleOn(100, 0.5, 11, 40)).toBeGreaterThan(settleOn(100, 0.1, 11, 40))
    expect(settleOn(100, -0.5, 11, 40)).toBeLessThan(settleOn(100, -0.1, 11, 40))
  })

  it('never far enough to leave the ticks that are drawn', () => {
    expect(settleOn(1000, 50, 11, 500)).toBe(Math.round(1000 / 11) + MAX_THROW)
    expect(settleOn(1000, -50, 11, 500)).toBe(Math.round(1000 / 11) - MAX_THROW)
  })

  it('stays on the tape', () => {
    expect(settleOn(10, -5, 11, 20)).toBe(0)
    expect(settleOn(200, 5, 11, 20)).toBe(19)
    expect(settleOn(-30, 0, 11, 20)).toBe(0)
  })
})

describe('how long a glide takes', () => {
  it('is none when there is nowhere to go', () => {
    expect(glideTime(0)).toBe(0)
  })

  it('is short for a tick and longer for a throw, and never past 320ms', () => {
    expect(glideTime(11)).toBeLessThan(200)
    expect(glideTime(300)).toBeGreaterThan(glideTime(11))
    expect(glideTime(100_000)).toBe(320)
  })
})

describe('which ticks are drawn', () => {
  it('is all of them on a short tape', () => {
    expect(ticksInReach(3, 20)).toEqual({ from: 0, to: 19 })
  })

  it('is a stretch either side of the tick under the hairline, within the tape', () => {
    const { from, to } = ticksInReach(500, 1000)
    expect(from).toBeLessThan(500 - 50)
    expect(to).toBeGreaterThan(500 + 50)
    expect(to - from).toBeLessThan(300)
    expect(ticksInReach(2, 1000).from).toBe(0)
    expect(ticksInReach(998, 1000).to).toBe(999)
  })
})
