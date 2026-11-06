import { momentName } from './words'

/**
 * A moment's name inside a sentence ("A copy of yesterday evening, 21:10"): the relative words lose
 * their capital, as "Just now" and "This afternoon" do. Weekdays, dates and numbers keep theirs.
 */
export function momentInSentence(at: number, now: number): string {
  const name = momentName(at, now)
  return /^(Just|This|Yesterday|Last)\b/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name
}
