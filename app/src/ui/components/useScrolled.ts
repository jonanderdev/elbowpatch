import { type RefObject, useEffect, useState } from 'react'

/**
 * Whether a scroller (or, without one, the window) has scrolled from its top: the head then stands on a
 * strip of page colour with a fade under it, so what scrolls never meets it (DESIGN.md, One head).
 */
export function useScrolled(scroller?: RefObject<HTMLElement | null>): boolean {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const el = scroller?.current
    const target: HTMLElement | Window = el ?? window
    const read = (): void => setScrolled((el ? el.scrollTop : window.scrollY) > 0)
    read()
    target.addEventListener('scroll', read, { passive: true })
    return () => target.removeEventListener('scroll', read)
  }, [scroller])
  return scrolled
}

/** Whether an element has scrolled up under the head (the top `head` px of its scroller), as a big title does. */
export function useGoneUnder(el: RefObject<HTMLElement | null>, scroller: RefObject<HTMLElement | null>, head: number): boolean {
  const [gone, setGone] = useState(false)
  useEffect(() => {
    const target = el.current
    if (!target) return
    const io = new IntersectionObserver(([entry]) => setGone(!!entry && !entry.isIntersecting && entry.boundingClientRect.top < head), {
      root: scroller.current,
      rootMargin: `-${head}px 0px 0px 0px`,
    })
    io.observe(target)
    return () => io.disconnect()
  }, [el, scroller, head])
  return gone
}
