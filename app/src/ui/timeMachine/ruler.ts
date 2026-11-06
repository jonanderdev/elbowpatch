import { tapeLabel } from '../../domain/words'

// The tape's measures and its ruler (DESIGN.md, The moment bar), with no DOM in them.

const CLOSEST = 11
const FURTHEST = 44
/** About the tape's width, which a few ticks spread across. */
const SPREAD = 300
/** A label's width per character at 12px, and the least room between two. */
const CHARACTER = 6.5
const CLEAR = 10

/** How far apart the ticks stand: about 11px, and up to 44px when there are few. */
export function tickSpacing(count: number): number {
  return Math.min(FURTHEST, Math.max(CLOSEST, Math.floor(SPREAD / Math.max(1, count - 1))))
}

/**
 * The label under each tick, if it has one: at the first tick of each unit, and "Now" at the right end, which
 * always stands. Going left from there, a label that would meet its neighbour is left out, as on a ruler.
 */
export function tapeLabels(ats: number[], now: number, spacing: number): (string | undefined)[] {
  const units = ats.map((at) => tapeLabel(at, now))
  const labels: (string | undefined)[] = ats.map(() => undefined)
  let placed = ats.length - 1
  let word = 'Now'
  labels[placed] = word
  for (let i = placed - 1; i >= 0; i--) {
    const unit = units[i]!
    if (units[i - 1] === unit) continue
    const room = (placed - i) * spacing
    if (room < ((word.length + unit.length) / 2) * CHARACTER + CLEAR) continue
    labels[i] = unit
    placed = i
    word = unit
  }
  return labels
}

/** The tick nearest a point on the tape, given how far that point is from the hairline, which stands over tick `index`. */
export function nearestTick(index: number, count: number, spacing: number, fromHairline: number): number {
  return Math.max(0, Math.min(count - 1, index + Math.round(fromHairline / spacing)))
}

/** How long the tape goes on in the way it was going, in ms of its speed when let go. */
const COAST = 180
/** The most ticks a throw can pass, so the glide stays over ticks that are drawn. */
export const MAX_THROW = 50
/** How many ticks are drawn each side of the one under the hairline. A year can be thousands, and only a few hundred pixels show. */
const REACH = 100
/** How far the tick under the hairline may stray from the middle of what is drawn before the drawing follows. */
export const RECENTER = 30

/**
 * The tick the tape settles on when let go at `x` (its distance from the oldest tick, in px) moving at
 * `velocity` (px per ms, positive towards now): the nearest, a little further if it was going, and never
 * past the ends or `MAX_THROW` ticks.
 */
export function settleOn(x: number, velocity: number, spacing: number, count: number): number {
  const from = Math.round(x / spacing)
  const thrown = Math.max(-MAX_THROW, Math.min(MAX_THROW, Math.round((x + velocity * COAST) / spacing) - from))
  return Math.max(0, Math.min(count - 1, from + thrown))
}

/** How long a glide over `distance` px takes: a tick's step is quick, a throw longer, none past 300ms. */
export function glideTime(distance: number): number {
  return distance === 0 ? 0 : Math.min(300, 160 + Math.abs(distance) * 0.5)
}

/** The ticks drawn while the one at `center` stands under the hairline. */
export function ticksInReach(center: number, count: number): { from: number; to: number } {
  return { from: Math.max(0, center - REACH), to: Math.min(count - 1, center + REACH) }
}
