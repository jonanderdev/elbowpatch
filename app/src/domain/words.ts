// How the app writes numbers and dates (DESIGN.md, Type).

/** Thousands take a dot, European style: 1.240, never 1,240. */
export function number(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function words(n: number): string {
  return `${number(n)} ${n === 1 ? 'word' : 'words'}`
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
