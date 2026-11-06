import type { KeyboardEvent, MouseEvent, ReactElement, RefObject } from 'react'
import type { Moment } from '../../domain/lookBack'
import { momentFull } from '../../domain/words'
import { nearestTick, tapeLabels, tickSpacing } from './ruler'

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
 * the right end. It is a slider: ← and → step, Home goes to the oldest, End to now, and a tap goes to a tick.
 */
export function Tape({ moments, index, now, tapeRef, onMoment }: TapeProps): ReactElement {
  const spacing = tickSpacing(moments.length)
  const labels = tapeLabels(
    moments.map((m) => m.at),
    now,
    spacing,
  )
  const last = moments.length - 1

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
    const box = e.currentTarget.getBoundingClientRect()
    onMoment(nearestTick(index, moments.length, spacing, e.clientX - (box.left + box.width / 2)))
  }

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
    >
      <div className="tape-ticks" style={{ transform: `translateX(${-index * spacing}px)` }} aria-hidden="true">
        {moments.map((m, i) => (
          <span key={m.at} className="tick" data-tall={!!labels[i] || m.kept || undefined} data-kept={m.kept || undefined} style={{ left: i * spacing }} />
        ))}
        {labels.map((label, i) =>
          label ? (
            <span key={moments[i]!.at} className="tick-label" style={{ left: i * spacing }}>
              {label}
            </span>
          ) : null,
        )}
      </div>
    </div>
  )
}

/** The tape while moments load: the hairline, and nothing to step through. */
export function EmptyTape(): ReactElement {
  return <div className="tape" aria-hidden="true" />
}
