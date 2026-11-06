// An essay's pages by their first words (DESIGN.md, Layout). They come from the text as laid out, so
// any text in columns can be read this way: the page being written, or text from another moment.

import { type Geometry, pageAt } from './pager'

/** A page's label stays under this many characters, as whole words, so it keeps to a rail row's line. */
const LABEL_BELOW = 20

/** The words a text starts with, as many as a label holds. A first word too long for one stands whole. */
export function firstWords(text: string): string {
  let label = ''
  for (const [word] of text.matchAll(/\S+/g)) {
    const longer = label ? `${label} ${word}` : word
    if (label && longer.length >= LABEL_BELOW) break
    label = longer
  }
  return label
}

/** Enough of the text from here on for a label: a whole first word, and all the words that could follow it. */
function textFrom(runs: readonly string[], run: number, start: number): string {
  let text = (runs[run] ?? '').slice(start)
  for (let next = run + 1; next < runs.length && !(text.trim().length >= LABEL_BELOW && /\s/.test(text.trim())); next++) text += runs[next]
  return text
}

/**
 * The first words of each of `count` pages; a page with no words on it has none. `runs` are the text in
 * reading order, and `pageOf` says which page a run's word starts on. Pages only go up as the words do,
 * so a run is asked about its last word, and by halves only when a page starts in it. A word carried
 * over a page break belongs to the page it starts on, so no label starts halfway through a word.
 */
export function openingsOf(runs: readonly string[], count: number, pageOf: (run: number, start: number, end: number) => number): string[] {
  const openings = Array.from({ length: count }, () => '')
  let next = 0
  runs.forEach((text, run) => {
    const words = [...text.matchAll(/\S+/g)].map((m) => ({ start: m.index, end: m.index + m[0].length }))
    const page = (at: number): number => {
      const word = words[at]
      return word ? pageOf(run, word.start, word.end) : -1
    }
    while (next < count && page(words.length - 1) >= next) {
      let lo = 0
      let hi = words.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (page(mid) >= next) hi = mid
        else lo = mid + 1
      }
      const found = page(lo)
      if (found >= count) return
      openings[found] = firstWords(textFrom(runs, run, words[lo]?.start ?? 0))
      next = found + 1
    }
  })
  return openings
}

/** The first words of each page of `columns`, the text as `g` lays it out. Measured in place, so pages out of view count too. */
export function pageOpenings(columns: HTMLElement, g: Geometry, count: number): string[] {
  const left = columns.getBoundingClientRect().left
  const runs: string[] = []
  const texts: (Text | null)[] = []
  const walker = document.createTreeWalker(columns, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text) {
      runs.push(node.data)
      texts.push(node)
    } else if ((node as Element).matches('p, blockquote, br')) {
      // A new line parts the words on either side of it; a change of style, as in *Sun*day, does not.
      runs.push(' ')
      texts.push(null)
    }
  }
  const range = document.createRange()
  return openingsOf(runs, count, (run, start, end) => {
    const text = texts[run]
    if (!text) return 0
    range.setStart(text, start)
    range.setEnd(text, end)
    const box = range.getClientRects()[0]
    return box ? pageAt(box.left - left, g) : 0
  })
}
