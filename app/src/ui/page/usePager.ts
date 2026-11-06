import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Kind } from '../../domain/model'
import { layOut } from '../../page/layout'
import { Pager } from '../../page/pager'
import type { Settings } from '../stores/settings'

export interface PagerState {
  pager: Pager | null
  /** The page in view, from 0. */
  page: number
  count: number
  /** The text has been laid out at its fonts: until then `count` is only a start, and says nothing of the text. */
  laidOut: boolean
  /** What `say` said after a turn; a page added by typing is not announced (DESIGN.md, Behaviour). */
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
  /** The page ends above the moment bar. */
  short?: boolean
  /** An open rail stands at the left. */
  rail?: boolean
  /** After the pages were laid out again: show the caret's page. */
  onRelayout(pager: Pager): void
  /** What a turn to this page says, when it is read out. */
  say(page: number, count: number): string
}

/**
 * The pager for the page: the text in CSS columns, one per page (docs/decisions/0003). Laid out
 * before the first paint, and again when the window, the fonts or the text settings change.
 */
export function usePager({ screen, viewport, flow, columns, kind, settings, keyboard, short = false, rail = false, onRelayout, say }: Options): PagerState {
  const [pager, setPager] = useState<Pager | null>(null)
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(1)
  const [laidOut, setLaidOut] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  // Read when the window or the fonts change, long after this render.
  const onRelayoutNow = useRef(onRelayout)
  onRelayoutNow.current = onRelayout
  const sayNow = useRef(say)
  sayNow.current = say
  const shortNow = useRef(short)
  shortNow.current = short
  const railNow = useRef(rail)
  railNow.current = rail

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
      if (!p.opening && shown !== -1 && next !== shown) setAnnouncement(sayNow.current(next, total))
      shown = next
    })
    layOut(p, screenEl, kind, shortNow.current, railNow.current)
    setPager(p)

    const relayout = (): void => {
      layOut(p, screenEl, kind, shortNow.current, railNow.current)
      onRelayoutNow.current(p)
    }
    // Laid out again once the fonts are in, so page breaks do not move after load (0011).
    let alive = true
    void document.fonts.ready.then(() => {
      if (!alive) return
      relayout()
      setLaidOut(true)
    })
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
      layOut(pager, screenEl, kind, short, rail)
      onRelayoutNow.current(pager)
    })
    return () => cancelAnimationFrame(frame)
  }, [pager, screen, kind, size, leading, measure, align, dropcap, indent, keyboard, short, rail])

  return { pager, page, count, laidOut, announcement }
}
