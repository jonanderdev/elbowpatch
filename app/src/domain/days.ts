// A journal's days as the writer reaches them (DESIGN.md, The journal). Everything here works on what
// it is given, so the same rail and month sheet can show the days as they stand or as they were.

import type { Piece } from './model'
import { dayAndMonth, monthName, number } from './words'

/** A day of a journal, by its date: "2026-10-26". A today not begun has no section yet. */
export interface Day {
  iso: string
  sectionId?: string
  words: number
}

/** The open section's words, which run ahead of what is stored while the writer types. */
export interface OpenDay {
  sectionId: string
  words: number
}

/** Today and each day of the piece, latest first. A day emptied since stays: its moments are there to reach. */
export function journalDays(piece: Piece, today: string, open?: OpenDay): Day[] {
  const days = piece.sections.map(({ sectionId, title }): Day => {
    return { iso: title, sectionId, words: sectionId === open?.sectionId ? open.words : (piece.words?.[sectionId] ?? 0) }
  })
  if (!days.some((d) => d.iso === today)) days.push({ iso: today, words: 0 })
  return days.sort((a, b) => b.iso.localeCompare(a.iso))
}

/** The day a turn reaches from this one, on (1) or back (-1). Days are latest first. */
export function dayBeyond(days: Day[], iso: string, dir: 1 | -1): Day | undefined {
  const here = days.findIndex((d) => d.iso === iso)
  return here < 0 ? undefined : days[here - dir]
}

/** Everything but a today with nothing in it. */
const written = (days: Day[], today?: string): Day[] => days.filter((d) => d.iso !== today || d.words > 0)

/** A month: "2026-10". */
export const monthOf = (iso: string): string => iso.slice(0, 7)

const daysWord = (n: number): string => `${number(n)} ${n === 1 ? 'day' : 'days'}`

/** The rail's line, "214 days · 19 in October": the month is the one of the day on the page. */
export function daysLine(days: Day[], current: string, today?: string): string {
  const all = written(days, today)
  const month = monthOf(current)
  return `${daysWord(all.length)} · ${number(all.filter((d) => monthOf(d.iso) === month).length)} in ${monthName(month)}`
}

/** The month sheet's line: "19 days written in October". */
export function monthLine(days: Day[], month: string, today?: string): string {
  const n = written(days, today).filter((d) => monthOf(d.iso) === month).length
  return `${n === 0 ? 'No days' : daysWord(n)} written in ${monthName(month)}`
}

/** The month before (-1) or after (1). */
export function monthAfter(month: string, by: 1 | -1): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const at = y * 12 + (m - 1) + by
  return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, '0')}`
}

/** Days under their month, in the order given. */
export function monthsOf(days: Day[]): { month: string; days: Day[] }[] {
  const months: { month: string; days: Day[] }[] = []
  for (const day of days) {
    const month = monthOf(day.iso)
    const group = months.at(-1)
    if (group?.month === month) group.days.push(day)
    else months.push({ month, days: [day] })
  }
  return months
}

export type DayState = 'written' | 'empty' | 'today' | 'future'

export interface MonthCell {
  day: number
  state: DayState
  /** What a screen reader hears. */
  label: string
  /** The day that opens from here, if any. */
  opens?: Day
}

const SAID: Record<DayState, string> = { written: 'written', empty: 'nothing written', today: 'today', future: 'still to come' }

/**
 * A month as a grid, Monday first, with a blank for each weekday before the 1st. With no `today`,
 * nothing is marked as one. Days after `last` recede, but a day written never does: nothing written
 * is out of reach.
 */
export function monthCells(month: string, days: Day[], { today, last }: { today?: string; last: string }): (MonthCell | null)[] {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const byDate = new Map(days.map((d) => [d.iso, d]))
  const cells: (MonthCell | null)[] = Array.from({ length: (new Date(y, m - 1, 1).getDay() + 6) % 7 }, () => null)
  const length = new Date(y, m, 0).getDate()
  for (let day = 1; day <= length; day++) {
    const iso = `${month}-${String(day).padStart(2, '0')}`
    const opens = byDate.get(iso)
    const state: DayState = iso === today ? 'today' : opens ? 'written' : iso > last ? 'future' : 'empty'
    const said = state === 'today' && opens?.words ? 'today, written' : SAID[state]
    cells.push({ day, state, label: `${dayAndMonth(iso)}, ${said}`, ...(opens ? { opens } : {}) })
  }
  return cells
}
