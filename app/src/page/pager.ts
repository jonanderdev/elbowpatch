// Paging (docs/decisions/0003): the text flows in CSS columns, one column per
// page. The pager is exactly one column wide and sits at the side margin; a
// gap of two margins puts page k at scrollLeft = k × stride, so a turn only
// changes the scroll position and the browser keeps the caret, selection and
// keyboard as they are. The text itself is the column box, as wide as all its
// pages: iOS places and draws the caret only within the editable element's
// own box, and a box split across columns is only page 1's.

import type { Screen } from '../domain/model'

export interface Geometry {
  /** The text column's width. */
  measure: number
  /** The margin left of it. */
  side: number
  /** Screen width: page k starts at k × stride. */
  stride: number
}

/**
 * The pages, in their own px (DESIGN.md, Layout): one for phones, as wide as the screen and as tall as it
 * allows, one for larger screens, a paperback page that keeps its size and is only scaled. Side margins:
 * normal, with the wide measure, and the journal's left one, which leaves room for its margin rule.
 */
export const PAGES = {
  phone: { width: 390, height: 826, top: 64, bottom: 92, side: 24, wide: 12, journal: 44 },
  desktop: { width: 540, height: 834, top: 64, bottom: 84, side: 36, wide: 18, journal: 56 },
}
/** Screens narrower than this take the phone's page. */
export const PHONE_BELOW = 700

/** Which page a screen this wide takes. */
export function screenOf(width: number): Screen {
  return width < PHONE_BELOW ? 'phone' : 'desktop'
}
/** The most a screen scales the page up: past it the type outgrows reading size, and a big screen shows more room around the page instead. */
export const MAX_SCALE = 1.3

/** The page fitted to a screen: the column and the margins around it, in screen px. */
export interface Fit extends Geometry {
  /** The screen scale: every size on the page is its page size times this. */
  k: number
  /** From the screen's top to the text, and from the text's foot to the screen's bottom. */
  top: number
  bottom: number
  /** The text's height. */
  height: number
}

/**
 * The screen's page at the largest scale that fits it, up to MAX_SCALE. The text fits between the head and
 * the foot, which keep their size, and sits centred between them. On a phone the page fills the screen's
 * width and the text all the height between the head and the foot: only the width scales it. The stride
 * stays whole pixels, so page 300 lands where page 1 does.
 */
export function geometry(screenWidth: number, screenHeight: number, wide = false, journal = false): Fit {
  const stride = Math.floor(screenWidth)
  const phone = screenOf(stride) === 'phone'
  const page = PAGES[phone ? 'phone' : 'desktop']
  const right = wide ? page.wide : page.side
  const left = journal ? page.journal : right
  const room = screenHeight - page.top - page.bottom
  const designed = page.height - page.top - page.bottom
  const k = phone ? Math.min(MAX_SCALE, stride / page.width) : Math.min(MAX_SCALE, stride / page.width, room / designed)
  // The text's height in the page's own px.
  const text = phone ? room / k : designed
  const top = page.top + (room - text * k) / 2
  return {
    measure: (page.width - left - right) * k,
    side: (stride - page.width * k) / 2 + left * k,
    stride,
    k,
    top,
    bottom: screenHeight - top - text * k,
    height: text * k,
  }
}

/** The page holding a point, given its distance from the start of the flow. */
export function pageAt(offset: number, g: Geometry): number {
  return Math.max(0, Math.floor((offset + (g.stride - g.measure) / 2) / g.stride))
}

/** A line of text: its page, its top and bottom on screen, and its ends measured from its page's left edge. */
export interface Line {
  page: number
  top: number
  bottom: number
  left: number
  right: number
}

type Box = { top: number; bottom: number; left: number; right: number }

/**
 * The lines that boxes of text make, in reading order: page by page, top to bottom. Boxes on the
 * same page whose tops are within half a line are one line (a word in italic is its own box).
 * `flowLeft` is where page 1 starts on screen now.
 */
export function linesOf(boxes: Box[], g: Geometry, flowLeft: number, lineHeight: number): Line[] {
  const placed = boxes
    .filter((b) => b.bottom > b.top)
    .map((b) => {
      const page = pageAt(b.left - flowLeft, g)
      const edge = flowLeft + page * g.stride
      return { page, top: b.top, bottom: b.bottom, left: b.left - edge, right: b.right - edge }
    })
    .sort((a, b) => a.page - b.page || a.top - b.top)
  const lines: Line[] = []
  for (const b of placed) {
    const last = lines.at(-1)
    if (last && last.page === b.page && Math.abs(b.top - last.top) < lineHeight / 2) {
      last.left = Math.min(last.left, b.left)
      last.right = Math.max(last.right, b.right)
      last.bottom = Math.max(last.bottom, b.bottom)
    } else lines.push({ ...b })
  }
  return lines
}

export class Pager {
  page = 0
  count = 1
  g: Geometry = { measure: 0, side: 0, stride: 1 }
  /** Called when the browser scrolled on its own: the page shows the caret's page again. */
  onDrift?: () => void

  /** The section title's height, as the text's room for it was last set. */
  private titleHeight = -1

  constructor(
    readonly viewport: HTMLElement,
    readonly flow: HTMLElement,
    /** The text, in columns: one box across every page. */
    readonly columns: HTMLElement,
    readonly onChange: (page: number, count: number) => void,
  ) {
    // The browser may scroll the viewport itself to show the caret; settle it on the caret's page.
    viewport.addEventListener('scroll', () => {
      if (viewport.scrollLeft === this.page * this.g.stride) return
      if (this.onDrift) this.onDrift()
      else this.turnTo(Math.round(viewport.scrollLeft / this.g.stride))
    })
  }

  layout(g: Geometry): void {
    this.g = g
    this.columns.style.columnGap = `${g.stride - g.measure}px`
    this.size(this.count)
    this.measure()
  }

  /**
   * Recount pages after the text or the layout changed. The titles sit over the text, which keeps
   * room for them; their height is read first, since it moves every page break after it.
   */
  measure(): void {
    const title = this.flow.querySelector<HTMLElement>('.title')
    const height = title?.offsetHeight ?? 0
    if (height !== this.titleHeight) {
      this.titleHeight = height
      this.flow.style.setProperty('--title-height', `${height}px`)
    }
    // Text past the columns the box has flows on into more to its right: the last line says how many.
    const lines = this.columns.lastElementChild?.getClientRects()
    const last = lines?.[lines.length - 1]
    const count = last ? pageAt(last.left - this.columns.getBoundingClientRect().left, this.g) + 1 : 1
    const page = Math.min(this.page, count - 1)
    const changed = count !== this.count || page !== this.page
    if (count !== this.count) this.size(count)
    this.count = count
    this.page = page
    this.viewport.scrollLeft = page * this.g.stride
    if (changed) this.onChange(this.page, this.count)
  }

  /** The text's box, as wide as `count` pages: their columns, and the gaps between them. */
  private size(count: number): void {
    this.columns.style.columnCount = String(count)
    this.columns.style.width = `${count * this.g.stride - (this.g.stride - this.g.measure)}px`
  }

  turnTo(page: number): void {
    const next = Math.max(0, Math.min(this.count - 1, page))
    this.viewport.scrollLeft = next * this.g.stride
    if (next === this.page) return
    this.page = next
    this.onChange(this.page, this.count)
  }

  next = (): void => this.turnTo(this.page + 1)
  previous = (): void => this.turnTo(this.page - 1)

  /** Turns to the page holding a point on screen (a caret, a found word). */
  show(clientX: number): void {
    const start = this.flow.getBoundingClientRect().left
    this.measure()
    this.turnTo(pageAt(clientX - start, this.g))
  }
}
