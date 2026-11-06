import { type ReactElement, type RefObject, useEffect, useRef } from 'react'

/** How long the mark stays after the list stops, so it does not blink between two flicks. */
const STAYS_MS = 700

/**
 * The scroll mark on a phone's list (DESIGN.md, The scroll mark): it shows only while the writer moves the list.
 * A list too short to scroll never moves, so it never shows. A scroll the app makes (a new area opening at its
 * top) is not the writer's, so it waits for a finger. Written to the DOM, not state: it changes on every scroll.
 */
export function ScrollMark({ scroller }: { scroller: RefObject<HTMLElement | null> }): ReactElement {
  const mark = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = scroller.current
    if (!list) return
    let touched = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const rest = (): void => {
      touched = false
      mark.current?.removeAttribute('data-moving')
    }
    const touch = (): void => {
      touched = true
    }
    const scroll = (): void => {
      if (!touched) return
      mark.current?.setAttribute('data-moving', '')
      clearTimeout(timer)
      timer = setTimeout(rest, STAYS_MS)
    }
    list.addEventListener('touchmove', touch, { passive: true })
    list.addEventListener('scroll', scroll, { passive: true })
    return () => {
      clearTimeout(timer)
      list.removeEventListener('touchmove', touch)
      list.removeEventListener('scroll', scroll)
    }
  }, [scroller])
  return <div ref={mark} className="scroll-mark scroll-mark-list" aria-hidden="true" />
}
