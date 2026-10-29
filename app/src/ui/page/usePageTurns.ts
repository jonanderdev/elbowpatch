import { useEffect, type RefObject } from 'react'
import type { PageSession } from './session'

/** How far beside the text a click in the margin must be to turn the page. */
const MARGIN_CLEAR = 80

/**
 * Turning pages by hand (DESIGN.md, Behaviour): Page Up / Page Down and Alt + ← / → everywhere, a
 * sideways swipe on a phone, a click in the side margins on desktop, where the pointer becomes an
 * arrow while there is a page to go to. Scrolling turns nothing. Off while the library covers the page.
 */
export function usePageTurns(screen: RefObject<HTMLDivElement | null>, session: PageSession | null, covered: boolean) {
  useEffect(() => {
    const el = screen.current
    if (covered || !session || !el) return
    const { pager } = session

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PageDown' || (e.altKey && e.key === 'ArrowRight')) session.turn(1)
      else if (e.key === 'PageUp' || (e.altKey && e.key === 'ArrowLeft')) session.turn(-1)
      else return
      e.preventDefault()
    }

    // Scrolling does not turn pages. A sideways swipe is swallowed, since it is also the browser's
    // Back; up and down are left alone, for a window smaller than the app's least size (and sheets).
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault()
    }

    let touchStart: { x: number; y: number } | undefined
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      touchStart = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : undefined
    }
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      const from = touchStart
      touchStart = undefined
      if (!from || !t) return
      const dx = t.clientX - from.x
      const dy = t.clientY - from.y
      // A swipe: mostly sideways, and not while selecting.
      if (Math.abs(dx) < 50 || Math.abs(dx) < 1.5 * Math.abs(dy) || !getSelection()?.isCollapsed) return
      session.turn(dx < 0 ? 1 : -1)
    }

    // A click in the side margins turns the page, but not near the text, where a click is likely
    // aimed at a word, and never after a drag, which is selecting. A click there never reaches the
    // text, even with no page to turn to.
    const side = (e: MouseEvent): 1 | -1 | 0 => {
      const g = pager.g
      if (g.side < 120 || (e.target as HTMLElement).closest('button, .pager, .sheet, [contenteditable]')) return 0
      if (e.clientX < g.side - MARGIN_CLEAR) return -1
      if (e.clientX > g.side + g.measure + MARGIN_CLEAR) return 1
      return 0
    }
    // The pointer shows the way while there is a page to go to; held while pressed, so clicking
    // through pages never flickers it.
    const onMouseMove = (e: MouseEvent) => {
      if (e.buttons) return
      const dir = side(e)
      const can = dir < 0 ? pager.page > 0 : dir > 0 && pager.page < pager.count - 1
      el.dataset.turn = can ? (dir < 0 ? 'back' : 'on') : ''
    }
    let down: { x: number; y: number } | undefined
    const onMouseDown = (e: MouseEvent) => {
      down = { x: e.clientX, y: e.clientY }
      // Keeps the caret where it is, so a turn takes it along as a key does; a selection clears as usual.
      if (side(e) && getSelection()?.isCollapsed) e.preventDefault()
    }
    const onClick = (e: MouseEvent) => {
      const from = down
      down = undefined
      const dir = side(e)
      if (!dir || (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 4) || !getSelection()?.isCollapsed) return
      session.turn(dir)
      onMouseMove(e)
    }

    window.addEventListener('keydown', onKey)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('click', onClick)
    return () => {
      el.dataset.turn = ''
      window.removeEventListener('keydown', onKey)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('click', onClick)
    }
  }, [screen, session, covered])
}
