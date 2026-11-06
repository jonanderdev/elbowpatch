// How the app writes numbers and dates (DESIGN.md, Type).

/** Thousands take a dot, European style: 1.240, never 1,240. */
export function number(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function words(n: number): string {
  return `${number(n)} ${n === 1 ? 'word' : 'words'}`
}

/** "Page 3 of 9", or as much of it as is known; a number that is not known stands aside. */
export function pageLine(page: number | undefined, count: number | undefined): string {
  if (page === undefined) return ''
  return count === undefined ? `Page ${number(page)}` : `Page ${number(page)} of ${number(count)}`
}

/** The count in the tools: the page and the pages once known, then the words. */
export function countLine(page: number | undefined, count: number | undefined, wordsShown: string): string {
  if (page === undefined) return wordsShown
  return `${number(page)}${count === undefined ? '' : ` of ${number(count)}`}  ·  ${wordsShown}`
}

/** What a screen reader hears of the count. */
export function countSaid(page: number | undefined, count: number | undefined, wordCount: number): string {
  return [pageLine(page, count), `${number(wordCount)} words`].filter(Boolean).join(', ')
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "26 Oct" — in the library's meta lines. */
export function shortDate(at: number, now: number): string {
  const d = new Date(at)
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]!.slice(0, 3)}`
  return new Date(now).getFullYear() === d.getFullYear() ? label : `${label} ${d.getFullYear()}`
}

/** "12 October" this year, "12 October 2025" before; with `year`, always the year. */
export function longDate(at: number, now: number, year = false): string {
  const d = new Date(at)
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return year || new Date(now).getFullYear() !== d.getFullYear() ? `${label} ${d.getFullYear()}` : label
}

/** "14 MB": storage, in whole units. */
export function size(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`
  return `${number(Math.round(bytes / 1_000_000))} MB`
}

/** A journal day's title: "Monday 26 October", and with the year where the file must be read across years. */
export function dayTitle(isoDay: string, withYear = false): string {
  const [y, m, d] = isoDay.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  return `${DAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`
}

/** "Monday 26": a day under its month, in the rail. */
export function dayInMonth(isoDay: string): string {
  return dayTitle(isoDay).split(' ').slice(0, 2).join(' ')
}

/** "26 October": a day in the month sheet. */
export function dayAndMonth(isoDay: string): string {
  return dayTitle(isoDay).split(' ').slice(1).join(' ')
}

/** "October", of a month like "2026-10". */
export function monthName(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1]!
}

/** "October 2026": the month sheet's title. */
export function monthTitle(month: string): string {
  return `${monthName(month)} ${month.slice(0, 4)}`
}

/** "26 Oct": a journal's count goes by the day, not by pages. */
export function dayShort(isoDay: string, now: number): string {
  const [y, m, d] = isoDay.split('-').map(Number) as [number, number, number]
  return shortDate(new Date(y, m - 1, d).getTime(), now)
}

/** "27th": the journal's mark. */
export function ordinal(day: number): string {
  const tens = day % 100
  if (tens >= 11 && tens <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'
}

/** "2026-10-30": a day in the writer's own time zone, as a journal's sections are titled. */
export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Morning 5–12, afternoon 12–18, evening 18–23, night 23–5. */
function partOfDay(hour: number): string {
  if (hour < 5 || hour >= 23) return 'night'
  if (hour < 12) return 'morning'
  return hour < 18 ? 'afternoon' : 'evening'
}

/** "21:10", "9:05": a 24-hour clock, the hour with no leading zero. */
function clock(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** How many calendar days before `now` a moment falls, whatever the hours between: a day can be 23 or 25 hours long. */
function daysBefore(at: number, now: number): number {
  const day = (t: number): number => {
    const d = new Date(t)
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  }
  return Math.round((day(now) - day(at)) / 86_400_000)
}

/** A moment's name, and the clock time that goes with it, if any. */
function named(at: number, now: number): { name: string; time?: string } {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return { name: 'Just now' }
  if (minutes < 60) return { name: `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago` }
  const d = new Date(at)
  const part = partOfDay(d.getHours())
  const days = daysBefore(at, now)
  // The small hours of today are the night just gone. Today's last hour is never reached here: it is under an hour old, or tomorrow.
  if (days === 0) return { name: part === 'night' ? 'Last night' : `This ${part}`, time: clock(d) }
  if (days === 1) return { name: `Yesterday ${part}`, time: clock(d) }
  // Six days back at most: a seventh would name today's weekday.
  if (days < 7) return { name: `${DAYS[d.getDay()]} ${part}` }
  return { name: longDate(at, now) }
}

/** A moment in plain words (DESIGN.md, Dates in plain words): "Yesterday evening, 21:10", "Sunday evening", "14 October 2025". */
export function momentName(at: number, now: number): string {
  const { name, time } = named(at, now)
  return time ? `${name}, ${time}` : name
}

/** A moment without its clock time, for the desktop path, where it must stand whole in little room. */
export function momentShort(at: number, now: number): string {
  return named(at, now).name
}

/** What assistive tech hears: "Sunday 25 October, 21:10", with the year when it is not this one. */
export function momentFull(at: number, now: number): string {
  const d = new Date(at)
  return `${DAYS[d.getDay()]} ${longDate(at, now)}, ${clock(d)}`
}

/** A tape label, which changes unit with age: hours today, weekdays within the week, dates within the year, months before. */
export function tapeLabel(at: number, now: number): string {
  const d = new Date(at)
  const days = daysBefore(at, now)
  if (days <= 0) return `${d.getHours()}:00`
  if (days < 7) return DAYS[d.getDay()]!.slice(0, 3)
  const month = MONTHS[d.getMonth()]!.slice(0, 3)
  return d.getFullYear() === new Date(now).getFullYear() ? `${d.getDate()} ${month}` : month
}
