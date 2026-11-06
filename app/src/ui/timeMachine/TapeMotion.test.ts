import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TapeMotion } from './TapeMotion'

// The tape's landing: the moment is shown when the glide has ended, never before. No DOM here: the layer is a stand-in
// whose glides end when the test says so.

interface FakeGlide {
  onfinish: (() => void) | null
  oncancel: (() => void) | null
  cancel(): void
}

let glides: FakeGlide[]
let reduced: boolean

function layer(): HTMLElement {
  return {
    style: {} as CSSStyleDeclaration,
    animate: () => {
      const glide: FakeGlide = { onfinish: null, oncancel: null, cancel: () => glide.oncancel?.() }
      glides.push(glide)
      return glide
    },
  } as unknown as HTMLElement
}

function tape(): { motion: TapeMotion; landed: number[] } {
  const motion = new TapeMotion()
  const landed: number[] = []
  motion.layer = layer()
  motion.spacing = 44
  motion.count = 10
  motion.onSettle = (tick) => landed.push(tick)
  motion.show(5, false)
  return { motion, landed }
}

const hand = (x: number, t: number) =>
  ({ pointerType: 'touch', pointerId: 1, clientX: x, timeStamp: t, currentTarget: { setPointerCapture: () => {} } }) as never

/** A drag by `dx`, held still, and let go. */
function dragAndRelease(motion: TapeMotion, dx: number): void {
  motion.down(hand(200, 0))
  motion.move(hand(200 + dx, 50))
  motion.up(hand(200 + dx, 400))
}

beforeEach(() => {
  vi.useFakeTimers()
  glides = []
  reduced = false
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
  vi.stubGlobal('getComputedStyle', () => ({ transform: 'none' }))
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m41 = -5 * 44
    },
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the tape landing', () => {
  it('shows nothing during the drag, and the moment when the glide ends', () => {
    const { motion, landed } = tape()
    motion.down(hand(200, 0))
    motion.move(hand(150, 50))
    expect(landed).toEqual([])
    motion.up(hand(150, 400))
    expect(glides).toHaveLength(1)
    expect(landed).toEqual([])
    glides[0]!.onfinish!()
    expect(landed).toEqual([6])
  })

  it('lands once, whether the end event or the timer comes first, or both', () => {
    const { motion, landed } = tape()
    dragAndRelease(motion, -50)
    glides[0]!.onfinish!()
    vi.advanceTimersByTime(1000)
    expect(landed).toEqual([6])
  })

  it('lands by the timer when the end of the glide is never heard', () => {
    const { motion, landed } = tape()
    dragAndRelease(motion, -50)
    vi.advanceTimersByTime(100)
    expect(landed).toEqual([])
    vi.advanceTimersByTime(500)
    expect(landed).toEqual([6])
  })

  it('does not land when the tape is taken in the hand mid-glide, and lands on the next release', () => {
    const { motion, landed } = tape()
    dragAndRelease(motion, -50)
    motion.down(hand(200, 500))
    glides[0]!.onfinish?.()
    vi.advanceTimersByTime(1000)
    expect(landed).toEqual([])
    motion.move(hand(150, 550))
    motion.up(hand(150, 900))
    glides.at(-1)!.onfinish!()
    expect(landed).toHaveLength(1)
  })

  it('does not land after a step or a tap moves the tape on, which shows its own tick', () => {
    const { motion, landed } = tape()
    dragAndRelease(motion, -50)
    motion.show(2, true)
    vi.advanceTimersByTime(1000)
    for (const g of glides) g.onfinish?.()
    expect(landed).toEqual([])
  })

  it('lands at once with reduced motion', () => {
    reduced = true
    const { motion, landed } = tape()
    dragAndRelease(motion, -50)
    expect(landed).toEqual([6])
    expect(glides).toHaveLength(0)
  })

  it('lands at once for a glide of no distance', () => {
    const { motion, landed } = tape()
    motion.down(hand(200, 0))
    motion.move(hand(210, 50))
    motion.move(hand(200, 60))
    motion.up(hand(200, 400))
    expect(landed).toEqual([5])
  })

  it('does not land once the tape has gone', () => {
    const { motion, landed } = tape()
    dragAndRelease(motion, -50)
    motion.destroy()
    vi.advanceTimersByTime(1000)
    for (const g of glides) g.onfinish?.()
    expect(landed).toEqual([])
  })

  it('lands for a cancelled pointer as for a release', () => {
    const { motion, landed } = tape()
    motion.down(hand(200, 0))
    motion.move(hand(150, 50))
    motion.cancel(hand(150, 60))
    expect(landed).toEqual([])
    glides[0]!.onfinish!()
    expect(landed).toEqual([6])
  })
})
