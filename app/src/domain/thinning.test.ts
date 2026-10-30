import { describe, expect, it } from 'vitest'
import { memoryStore } from '../adapters/memory-store'
import { history, newPiece, openPiece, putAway, restore, takeMoment, write } from './pieces'
import { forgetPutAway, type Thinnable, thin, toThin } from './thinning'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 9, 28, 12)

const v = (id: string, seq: number, createdAt: number, isProtected = false): Thinnable => ({ id, seq, createdAt, protected: isProtected })

describe('the thinning rule', () => {
  it('keeps everything from the last hour', () => {
    const items = Array.from({ length: 12 }, (_, i) => v(`v${i}`, i + 1, NOW - (12 - i) * 5 * MIN + MIN))
    expect(toThin(items, NOW).size).toBe(0)
  })

  it('keeps one an hour for a day, the last in each hour', () => {
    // Four versions in the same hour, three hours ago.
    const t = NOW - 3 * HOUR - (NOW % HOUR)
    const items = [v('first', 1, t - 10 * DAY), v('a', 2, t + 1 * MIN), v('b', 3, t + 20 * MIN), v('c', 4, t + 40 * MIN), v('latest', 5, NOW)]
    expect([...toThin(items, NOW)].sort()).toEqual(['a', 'b'])
  })

  it('never removes the first, the latest or a protected version', () => {
    const t = NOW - 40 * DAY
    const items = [
      v('first', 1, t),
      v('kept', 2, t + 1),
      v('plain', 3, t + 2),
      v('beforeBack', 4, t + 3, true),
      v('last-of-day', 5, t + 4),
      v('latest', 6, t + 5),
    ]
    items[1]!.protected = true
    const gone = toThin(items, NOW)
    expect(gone.has('first')).toBe(false)
    expect(gone.has('latest')).toBe(false)
    expect(gone.has('kept')).toBe(false)
    expect(gone.has('beforeBack')).toBe(false)
    expect(gone.has('plain')).toBe(true)
  })

  it('follows order, not the clock: the highest seq in a period stays', () => {
    const t = NOW - 5 * DAY
    // seq 3 has an earlier timestamp than seq 2 (a clock that jumped back).
    const items = [v('first', 1, t - DAY), v('two', 2, t + 10 * MIN), v('three', 3, t + 5 * MIN), v('latest', 4, NOW)]
    expect([...toThin(items, NOW)]).toEqual(['two'])
  })

  it('keeps moments from a clock that ran ahead', () => {
    const items = [v('first', 1, NOW - DAY), v('future', 2, NOW + 3 * DAY), v('latest', 3, NOW + 3 * DAY + 1)]
    expect(toThin(items, NOW).size).toBe(0)
  })

  it('a year of hourly moments thins to about the size 0005 promises', () => {
    const items: Thinnable[] = []
    for (let i = 0; i < 365 * 24; i++) items.push(v(`v${i}`, i + 1, NOW - (365 * 24 - i) * HOUR))
    const left = items.length - toThin(items, NOW).size
    // ~24 hourly + ~29 daily + ~48 weekly + first and latest.
    expect(left).toBeGreaterThan(80)
    expect(left).toBeLessThan(200)
  })
})

function setup() {
  let t = NOW - 400 * DAY
  let n = 0
  const clock = { now: () => t, set: (x: number) => (t = x) }
  const deps = { store: memoryStore(), clock, ids: { next: () => `id${++n}` } }
  return { deps, clock }
}

describe('thinning the store', () => {
  it('thins a section written over a year, keeps the text, and is safe to run twice', async () => {
    const { deps, clock } = setup()
    const piece = newPiece(deps, 'essay', 'en')
    const section = piece.sections[0]!.sectionId
    for (let day = 0; day < 400; day += 1) {
      for (const h of [9, 13, 21]) {
        clock.set(NOW - (400 - day) * DAY + h * HOUR)
        await write(deps, piece, section, `Day ${day}, ${h}:00`)
        await takeMoment(deps, piece.id, { kept: day === 100 && h === 13 })
      }
    }
    clock.set(NOW)
    const before = await deps.store.transaction((tx) => tx.versionsOf(section))
    const removed = await thin(deps)
    expect(removed).toBeGreaterThan(900)
    expect(await thin(deps)).toBe(0)
    const after = history(await deps.store.transaction((tx) => tx.versionsOf(section)))
    expect(after.length).toBe(before.length - removed)
    expect(after.at(-1)!.content).toBe('Day 399, 21:00')
    expect(after[0]!.content).toBe('Day 0, 9:00')
    expect(after.some((x) => x.kept && x.content === 'Day 100, 13:00')).toBe(true)
    // The text now is untouched.
    expect((await openPiece(deps, piece.id))?.sections[0]?.content).toBe('Day 399, 21:00')
  })

  it('a put-away piece goes for good after 30 days, not before, and not if brought back', async () => {
    const { deps, clock } = setup()
    const a = newPiece(deps, 'essay', 'en')
    const b = newPiece(deps, 'essay', 'en')
    for (const p of [a, b]) {
      await write(deps, p, p.sections[0]!.sectionId, 'Words.')
      await takeMoment(deps, p.id)
      await putAway(deps, p.id)
    }
    clock.set(clock.now() + 29 * DAY)
    expect(await forgetPutAway(deps)).toBe(0)
    await restore(deps, b.id)
    clock.set(clock.now() + 2 * DAY)
    expect(await forgetPutAway(deps)).toBe(1)
    expect(await openPiece(deps, a.id)).toBeUndefined()
    expect(await deps.store.transaction((tx) => tx.versionsOf(a.sections[0]!.sectionId))).toEqual([])
    expect(await deps.store.transaction((tx) => tx.working(a.sections[0]!.sectionId))).toBeUndefined()
    expect((await openPiece(deps, b.id))?.sections[0]?.content).toBe('Words.')
  })
})
