// Paging (docs/decisions/0003): the text flows in CSS columns, one column per
// page. The pager is exactly one column wide and sits at the side margin; a
// gap of two margins puts page k at scrollLeft = k × stride, so a turn only
// changes the scroll position and the browser keeps the caret, selection and
// keyboard as they are.

export interface Geometry {
  /** The text column, in whole pixels. */
  measure: number
  /** The margin left of it. */
  side: number
  /** Screen width: page k starts at k × stride. */
  stride: number
}

/**
 * Whole pixels, so page 300 lands where page 1 does. The column is centred,
 * with at least `minSide` either side and `minLeft` on the left (the journal's
 * margin rule wants more room there).
 */
export function geometry(screenWidth: number, maxMeasure: number, minSide: number, minLeft = minSide): Geometry {
  const width = Math.floor(screenWidth)
  const measure = Math.floor(Math.min(maxMeasure, width - minSide - minLeft))
  const side = Math.max(minLeft, Math.floor((width - measure) / 2))
  return { measure, side, stride: width }
}

export function pageCount(scrollWidth: number, g: Geometry): number {
  return Math.max(1, Math.round((scrollWidth - g.measure) / g.stride) + 1)
}

/** The page holding a point, given its distance from the start of the flow. */
export function pageAt(offset: number, g: Geometry): number {
  return Math.max(0, Math.floor((offset + (g.stride - g.measure) / 2) / g.stride))
}

export class Pager {
  page = 0
  count = 1
  g: Geometry = { measure: 0, side: 0, stride: 1 }
  /** Called when the browser scrolled on its own: the page shows the caret's page again. */
  onDrift?: () => void

  constructor(
    readonly viewport: HTMLElement,
    readonly flow: HTMLElement,
    readonly onChange: (page: number, count: number) => void,
  ) {
    // The browser may scroll the viewport itself to show the caret; settle it on the caret's page.
    viewport.addEventListener('scroll', () => {
      if (viewport.scrollLeft === this.page * this.g.stride) return
      if (this.onDrift) this.onDrift()
      else this.turnTo(Math.round(viewport.scrollLeft / this.g.stride))
    })
  }

  layout(g: Geometry) {
    this.g = g
    this.flow.style.columnWidth = `${g.measure}px`
    this.flow.style.columnGap = `${g.stride - g.measure}px`
    this.measure()
  }

  /** Recount pages after the text or the layout changed. */
  measure() {
    const count = pageCount(this.viewport.scrollWidth, this.g)
    const page = Math.min(this.page, count - 1)
    const changed = count !== this.count || page !== this.page
    this.count = count
    this.page = page
    this.viewport.scrollLeft = page * this.g.stride
    if (changed) this.onChange(this.page, this.count)
  }

  turnTo(page: number) {
    const next = Math.max(0, Math.min(this.count - 1, page))
    this.viewport.scrollLeft = next * this.g.stride
    if (next === this.page) return
    this.page = next
    this.onChange(this.page, this.count)
  }

  next = () => this.turnTo(this.page + 1)
  previous = () => this.turnTo(this.page - 1)

  /** Turns to the page holding a point on screen (a caret, a found word). */
  show(clientX: number) {
    const start = this.flow.getBoundingClientRect().left
    this.measure()
    this.turnTo(pageAt(clientX - start, this.g))
  }
}
