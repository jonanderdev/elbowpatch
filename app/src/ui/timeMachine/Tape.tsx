import { type KeyboardEvent, type MouseEvent, type ReactElement, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Moment } from '../../domain/lookBack'
import { momentFull } from '../../domain/words'
import { nearestTick, tapeLabels, tickSpacing, ticksInReach } from './ruler'
import { TapeMotion } from './TapeMotion'

interface TapeProps {
  moments: Moment[]
  /** The moment under the hairline. */
  index: number
  now: number
  tapeRef: RefObject<HTMLDivElement | null>
  onMoment(index: number): void
}

/**
 * The tape (DESIGN.md, The moment bar): one tick per moment, sliding under a fixed hairline, with now at
 * the right end. It is a slider: ← and → step, Home goes to the oldest, End to now, a tap goes to a tick,
 * and a drag or a swipe carries it, to glide on and settle on a tick when let go (TapeMotion).
 *
 * Only the ticks near the hairline are drawn: a year of moments is a long tape, and a phone shows a few dozen.
 */
export function Tape({ moments, index, now, tapeRef, onMoment }: TapeProps): ReactElement {
  const count = moments.length
  const spacing = tickSpacing(count)
  const last = count - 1
  const minute = Math.floor(now / 60_000)
  const labels = useMemo(
    () =>
      tapeLabels(
        moments.map((m) => m.at),
        minute * 60_000,
        spacing,
      ),
    [moments, minute, spacing],
  )
  // Drawn once for the whole tape; what is near the hairline is cut from it as the tape moves.
  const drawn = useMemo(
    () =>
      moments.map((m, i) => ({
        tick: (
          <span key={`t${i}`} className="tick" data-tall={!!labels[i] || m.kept || undefined} data-kept={m.kept || undefined} style={{ left: i * spacing }} />
        ),
        label: labels[i] ? (
          <span key={`l${i}`} className="tick-label" style={{ left: i * spacing }}>
            {labels[i]}
          </span>
        ) : null,
      })),
    [moments, labels, spacing],
  )

  const layer = useRef<HTMLDivElement>(null)
  const [center, setCenter] = useState(index)
  const [motion] = useState(() => new TapeMotion())
  // Read as the hand moves: they change with the render, and the hand's listeners are not set again.
  motion.spacing = spacing
  motion.count = count
  motion.onSettle = onMoment
  motion.onCenter = setCenter

  // Before paint, so the tape is never seen at the wrong tick. A change from outside (a key, a tap, another section) goes by a glide.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `moments` and `count` are why a section's tape is put again.
  useLayoutEffect(() => {
    motion.layer = layer.current
    if (!motion.held) motion.show(index, true)
  }, [motion, index, spacing, count, moments])
  useEffect(() => () => motion.destroy(), [motion])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    // With Alt the arrows turn the page, and with ⌘ or Ctrl they are the system's.
    if (e.altKey || e.metaKey || e.ctrlKey) return
    const to: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: last }
    const next = to[e.key]
    if (next === undefined) return
    e.preventDefault()
    onMoment(Math.max(0, Math.min(last, next)))
  }

  function onClick(e: MouseEvent<HTMLDivElement>): void {
    if (motion.endsDrag()) return
    const box = e.currentTarget.getBoundingClientRect()
    onMoment(nearestTick(motion.tick, count, spacing, e.clientX - (box.left + box.width / 2)))
  }

  const { from, to } = ticksInReach(center, count)
  const near = drawn.slice(from, to + 1)

  return (
    <div
      ref={tapeRef}
      className="tape"
      role="slider"
      tabIndex={0}
      aria-label="Moment"
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={index}
      aria-valuetext={momentFull(moments[index]!.at, now)}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onPointerDown={motion.down}
      onPointerMove={motion.move}
      onPointerUp={motion.up}
      onPointerCancel={motion.cancel}
      // A swipe on the tape moves the tape: the page, whose swipes turn it, does not hear it.
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div ref={layer} className="tape-ticks" aria-hidden="true">
        {near.map((n) => n.tick)}
        {near.map((n) => n.label)}
      </div>
    </div>
  )
}

/** The tape while moments load: the hairline, and nothing to step through. */
export function EmptyTape(): ReactElement {
  return <div className="tape" aria-hidden="true" />
}
