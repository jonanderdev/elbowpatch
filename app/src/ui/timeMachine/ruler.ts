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
