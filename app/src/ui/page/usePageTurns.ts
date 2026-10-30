import { type RefObject, useEffect, useRef } from 'react'
import { caretToEnd } from '../../page/caret'
import type { Editor } from '../../page/editor'
import type { Pager } from '../../page/pager'

/** How far beside the text a click in the margin must be to turn the page. */
const MARGIN_CLEAR = 80

/**
 * Turning pages by hand (DESIGN.md, Behaviour): Page Up / Page Down and Alt + ← / → everywhere, a
 * sideways swipe on a phone, a click in the side margins on desktop, where the pointer becomes an
 * arrow while there is a page to go to. Scrolling turns nothing (nothing listens to the wheel). Off while
 * the library covers the page.
 */
interface Options {
  screen: RefObject<HTMLDivElement | null>
  viewport: RefObject<HTMLDivElement | null>
  /** On a page with no text (a book's title page), a turn takes the caret into the book's title. */
  bookTitle: RefObject<HTMLHeadingElement | null>
  editor: Editor | null
  pager: Pager | null
  covered: boolean
  readOnly: boolean
  /** A turn by hand is the writer moving: their place follows. */
  onTurn(): void
}

export function usePageTurns({ screen, viewport, bookTitle, editor, pager, covered, readOnly, onTurn }: Options): void {
  // Read when a turn happens.
  const now = useRef({ readOnly, onTurn })
  now.current = { readOnly, onTurn }

  useEffect(() => {
    const el = screen.current
    const viewportEl = viewport.current
    if (covered || !editor || !pager || !el || !viewportEl) return

    /**
     * A page on or back. It takes the caret along, to the end of the text on the new page, where
     * words are added next: always while writing, and on desktop also while reading, so a turn
     * leaves the page ready to type (DESIGN.md, Behaviour). Not taken from the tools or a sheet;
     * on a phone a swipe does not raise the keyboard, and a tap places it.
     */
    const turn = (dir: 1 | -1): void => {
      now.current.onTurn()
      const from = pager.page
      if (dir > 0) pager.next()
      else pager.previous()
      // At the first or last page nothing turns, and the caret stays put.
      if (pager.page === from || now.current.readOnly) return
      const view = editor.view
      const writing = view.hasFocus()
      if (!writing && (!matchMedia('(pointer: fine)').matches || document.activeElement?.closest('.sheet, .foot, .head'))) return
      // Placed before the text takes focus, so the browser never scrolls to the old caret first.
      if (caretToEnd(view, viewportEl)) {
        if (!writing) view.focus()
        return
      }
      const title = bookTitle.current
      if (title) {
        title.focus()
        getSelection()?.collapse(title, title.childNodes.length)
      }
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'PageDown' || (e.altKey && e.key === 'ArrowRight')) turn(1)
      else if (e.key === 'PageUp' || (e.altKey && e.key === 'ArrowLeft')) turn(-1)
      else return
      e.preventDefault()
    }

    let touchStart: { x: number; y: number } | undefined
    const onTouchStart = (e: TouchEvent): void => {
      const t = e.touches[0]
      touchStart = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : undefined
    }
    const onTouchEnd = (e: TouchEvent): void => {
      const t = e.changedTouches[0]
      const from = touchStart
      touchStart = undefined
      if (!from || !t) return
      const dx = t.clientX - from.x
      const dy = t.clientY - from.y
      // A swipe: mostly sideways, and not while selecting.
      if (Math.abs(dx) < 50 || Math.abs(dx) < 1.5 * Math.abs(dy) || !getSelection()?.isCollapsed) return
      turn(dx < 0 ? 1 : -1)
    }

    // A click in the side margins turns the page, but not on the head (the path, the tools), not near the text, where a click is likely
    // aimed at a word, and never after a drag, which is selecting. A click there never reaches the
    // text, even with no page to turn to.
    const side = (e: MouseEvent): 1 | -1 | 0 => {
      const g = pager.g
      if (g.side < 120 || (e.target as HTMLElement).closest('button, .head, .pager, .sheet, [contenteditable]')) return 0
      if (e.clientX < g.side - MARGIN_CLEAR) return -1
      if (e.clientX > g.side + g.measure + MARGIN_CLEAR) return 1
      return 0
    }
    // The pointer shows the way while there is a page to go to; held while pressed, so clicking
    // through pages never flickers it.
    const onMouseMove = (e: MouseEvent): void => {
      if (e.buttons) return
      const dir = side(e)
      const can = dir < 0 ? pager.page > 0 : dir > 0 && pager.page < pager.count - 1
      el.dataset.turn = can ? (dir < 0 ? 'back' : 'on') : ''
    }
    let down: { x: number; y: number } | undefined
    const onMouseDown = (e: MouseEvent): void => {
      down = { x: e.clientX, y: e.clientY }
      // Keeps the caret where it is, so a turn takes it along as a key does; a selection clears as usual.
      if (side(e) && getSelection()?.isCollapsed) e.preventDefault()
    }
    const onClick = (e: MouseEvent): void => {
      const from = down
      down = undefined
      const dir = side(e)
      if (!dir || (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 4) || !getSelection()?.isCollapsed) return
      turn(dir)
      onMouseMove(e)
    }

    window.addEventListener('keydown', onKey)
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('click', onClick)
    return () => {
      el.dataset.turn = ''
      window.removeEventListener('keydown', onKey)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('click', onClick)
    }
  }, [screen, viewport, bookTitle, editor, pager, covered])
}
