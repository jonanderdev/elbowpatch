import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Kind } from '../../domain/model'
import { geometry, Pager } from '../../page/pager'
import type { Settings } from '../stores/settings'

/** The screen's height with no keyboard up, and the tallest the window has been, at this width: on a touch screen the keyboard shortens the window, never the page. */
let tallest = { width: 0, height: 0, window: 0 }

export interface PagerState {
  pager: Pager | null
  /** The page in view, from 0. */
  page: number
  count: number
  /** "Page 3 of 9", after a turn; a page added by typing is not announced (DESIGN.md, Behaviour). */
  announcement: string
}

interface Options {
  screen: RefObject<HTMLDivElement | null>
  viewport: RefObject<HTMLDivElement | null>
  flow: RefObject<HTMLDivElement | null>
  /** The text, laid out in the columns. */
  columns: RefObject<HTMLDivElement | null>
  kind: Kind
  settings: Settings
  /** The phone keyboard is up: the page keeps the height it was laid out at. */
  keyboard: boolean
  /** After the pages were laid out again: show the caret's page. */
  onRelayout(pager: Pager): void
}

/**
 * The pager for the page: the text in CSS columns, one per page (docs/decisions/0003). Laid out
 * before the first paint, and again when the window, the fonts or the text settings change.
 */
export function usePager({ screen, viewport, flow, columns, kind, settings, keyboard, onRelayout }: Options): PagerState {
  const [pager, setPager] = useState<Pager | null>(null)
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(1)
  const [announcement, setAnnouncement] = useState('')
  // Read when the window or the fonts change, long after this render.
  const onRelayoutNow = useRef(onRelayout)
  onRelayoutNow.current = onRelayout

  useLayoutEffect(() => {
    const viewportEl = viewport.current
    const flowEl = flow.current
    const screenEl = screen.current
    const columnsEl = columns.current
    if (!viewportEl || !flowEl || !screenEl || !columnsEl) return
    let shown = -1
    const p = new Pager(viewportEl, flowEl, columnsEl, (next, total) => {
      setPage(next)
      setCount(total)
      if (shown !== -1 && next !== shown) setAnnouncement(`Page ${next + 1} of ${total}`)
      shown = next
    })
    layOut(p, screenEl, kind)
    setPager(p)

    const relayout = (): void => {
      layOut(p, screenEl, kind)
      onRelayoutNow.current(p)
    }
    // Laid out again once the fonts are in, so page breaks do not move after load (0011).
    let alive = true
    void document.fonts.ready.then(() => alive && relayout())
    // A font arriving late, for a script first used now, moves the breaks too.
    const remeasure = (): void => p.measure()
    document.fonts.addEventListener('loadingdone', remeasure)
    window.addEventListener('resize', relayout)
    return () => {
      alive = false
      document.fonts.removeEventListener('loadingdone', remeasure)
      window.removeEventListener('resize', relayout)
    }
  }, [screen, viewport, flow, columns, kind])

  // Text settings change the page: lay it out again, on the next frame, once they apply. So does the
  // keyboard going down, as it does not resize an installed iPhone app's window.
  const { size, leading, measure, align, dropcap, indent } = settings
  // biome-ignore lint/correctness/useExhaustiveDependencies: the settings act through CSS; they are the triggers.
  useEffect(() => {
    const screenEl = screen.current
    if (!pager || !screenEl) return
    const frame = requestAnimationFrame(() => {
      layOut(pager, screenEl, kind)
      onRelayoutNow.current(pager)
    })
    return () => cancelAnimationFrame(frame)
  }, [pager, screen, kind, size, leading, measure, align, dropcap, indent, keyboard])

  return { pager, page, count, announcement }
}

/** Lays the pages out: the page fitted to the screen, at the text settings. */
function layOut(pager: Pager, screen: HTMLElement, kind: Kind): void {
  const width = screen.clientWidth
  let height = screen.clientHeight
  if (matchMedia('(pointer: coarse)').matches) {
    // A keyboard shortens the window by more than 80px (as in useKeyboard): the page keeps its height and
    // scrolls to every line. Anything less (the home bar's inset, browser chrome) is the window itself: the
    // page is laid out again at its height, so with no keyboard nothing scrolls. While the keyboard is up
    // the screen is only the part above it, so the page keeps its height until it goes down (turned with
    // the keyboard up, the window's height stands in till then).
    const windowHeight = document.documentElement.clientHeight
    if (width !== tallest.width) tallest = { width, height: 0, window: 0 }
    tallest.window = Math.max(tallest.window, windowHeight)
    if (!screen.hasAttribute('data-keyboard')) {
      if (!tallest.height || tallest.window - windowHeight <= 80) {
        screen.style.removeProperty('--page-height')
        tallest.height = screen.clientHeight
      }
    } else if (!tallest.height) tallest.height = windowHeight
    height = tallest.height
    // The screen keeps that height, and the page's scroller its length.
    screen.style.setProperty('--page-height', `${height}px`)
  }
  const g = geometry(width, height, document.documentElement.dataset.measure === 'wide', kind === 'journal')
  const set = (name: string, px: number): void => screen.style.setProperty(name, `${px}px`)
  screen.style.setProperty('--k', `${g.k}`)
  set('--side', g.side)
  set('--measure-px', g.measure)
  set('--stride', g.stride)
  set('--top', g.top)
  set('--bottom', g.bottom)
  set('--text-height', g.height)
  pager.layout(g)
}
