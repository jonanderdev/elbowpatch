import { type ReactElement, useEffect, useRef, useState } from 'react'
import { type Day, daysLine, monthAfter, monthCells, monthLine, monthOf, monthsOf } from '../../domain/days'
import { dayInMonth, dayTitle, monthName, monthTitle, number, words } from '../../domain/words'
import { Icon } from '../components/Icon'
import { RAIL_ID } from './Contents'
import { showCurrent } from './showCurrent'

/**
 * What Days shows, all of it given: neither of these reads the clock or the store, so the same sheet
 * and rail show the journal now or as it was.
 */
interface DaysProps {
  /** The days to list, latest first. */
  days: Day[]
  /** The date of the day on the page. */
  current: string
  /** Today's date; with none, nothing is marked as today. */
  today?: string
  onOpen(day: Day): void
}

const WEEKDAYS = [
  ['monday', 'M'],
  ['tuesday', 'T'],
  ['wednesday', 'W'],
  ['thursday', 'T'],
  ['friday', 'F'],
  ['saturday', 'S'],
  ['sunday', 'S'],
] as const

interface DaysSheetProps extends DaysProps {
  /** The last day that can be reached: those after it recede. */
  last: string
  /** Where it stands: dropped under the head, or above the tools bar it was opened from. */
  from: 'head' | 'tools'
  /** Opened by keyboard: the focus moves to the day on the page. Otherwise it stays, so the phone keyboard stays up. */
  takeFocus: boolean
  onDone(): void
}

/** Days on a phone: a month at a time, between two arrows (DESIGN.md, The journal). */
export function DaysSheet({ days, current, today, last, from, takeFocus, onOpen, onDone }: DaysSheetProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [month, setMonth] = useState(() => monthOf(current))
  // Once, as it opens.
  const opening = useRef(takeFocus)
  useEffect(() => {
    if (opening.current) ref.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true })
  }, [])
  const before = monthAfter(month, -1)
  const after = monthAfter(month, 1)
  return (
    // A press in the sheet leaves the focus where it is: in the text, the keyboard stays up.
    <div ref={ref} className="sheet surface days" data-from={from} role="dialog" aria-label="Days" onMouseDown={(e) => e.preventDefault()}>
      <div className="month-head">
        <button type="button" className="icon-button month-arrow before" aria-label={monthTitle(before)} onClick={() => setMonth(before)}>
          <Icon name="chevronDown" />
        </button>
        <span className="month-title" aria-live="polite">
          {monthTitle(month)}
        </span>
        <button type="button" className="icon-button month-arrow after" aria-label={monthTitle(after)} onClick={() => setMonth(after)}>
          <Icon name="chevronDown" />
        </button>
      </div>
      <div className="month-weekdays" aria-hidden="true">
        {WEEKDAYS.map(([name, initial]) => (
          <span key={name}>{initial}</span>
        ))}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would bring a form's meaning and its own box to a grid of days. */}
      <div className="month-grid" role="group" aria-label={monthTitle(month)}>
        {monthCells(month, days, { ...(today ? { today } : {}), last }).map((cell, i) =>
          cell ? (
            <button
              key={cell.day}
              type="button"
              className="month-day"
              data-state={cell.state}
              aria-label={cell.label}
              aria-current={cell.opens?.iso === current ? 'true' : undefined}
              disabled={!cell.opens}
              onClick={() => {
                if (cell.opens) onOpen(cell.opens)
              }}
            >
              {cell.day}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      <div className="month-foot">
        <span>{monthLine(days, month, today)}</span>
        <button type="button" className="text-link" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}

interface DaysRailProps extends DaysProps {
  open: boolean
  /** Escape, from inside it. */
  onLeave(): void
}

/** A day's row: *Today* says so, and the words stand beside it. */
function DayRow({ day, current, today, onOpen }: { day: Day } & Pick<DaysProps, 'current' | 'today' | 'onOpen'>): ReactElement {
  const isToday = day.iso === today
  const value = isToday && !day.words ? 'nothing yet' : number(day.words)
  return (
    <li className="contents-line">
      <button
        type="button"
        className="contents-row"
        aria-label={`${isToday ? 'Today, ' : ''}${dayTitle(day.iso)}, ${isToday && !day.words ? value : words(day.words)}`}
        aria-current={day.iso === current ? 'true' : undefined}
        onClick={() => onOpen(day)}
      >
        <span className="contents-title">{isToday ? `Today, ${dayInMonth(day.iso)}` : dayInMonth(day.iso)}</span>
        <span className="contents-page">{value}</span>
      </button>
    </li>
  )
}

/** Days on desktop: *Today* first, then each day under its month, in the rail that folds as a book's does. */
export function DaysRail({ days, current, today, open, onOpen, onLeave }: DaysRailProps): ReactElement {
  const ref = useRef<HTMLElement>(null)
  // A new page opens for each day, so a long list starts at the current one; and again on opening.
  useEffect(() => {
    if (open) showCurrent(ref.current)
  }, [open])
  const year = days[0]?.iso.slice(0, 4)
  return (
    <nav
      ref={ref}
      id={RAIL_ID}
      className="rail contents-rail days-rail"
      aria-label="Days"
      data-folded={open ? undefined : ''}
      // A press in the rail leaves the focus where it is: a day chosen while writing keeps the caret going.
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onLeave()
      }}
    >
      <p className="rail-line">{daysLine(days, current, today)}</p>
      {/* One list scrolls, whatever the months: the current day is brought into view in it. */}
      <div className="contents-list">
        {monthsOf(days).map((group) => {
          const name = group.month.startsWith(`${year}-`) ? monthName(group.month) : monthTitle(group.month)
          return (
            <section key={group.month} className="days-month" aria-label={name}>
              <h2 className="days-month-name">{name}</h2>
              <ol className="days-list">
                {group.days.map((day) => (
                  <DayRow key={day.iso} day={day} current={current} {...(today ? { today } : {})} onOpen={onOpen} />
                ))}
              </ol>
            </section>
          )
        })}
      </div>
    </nav>
  )
}
