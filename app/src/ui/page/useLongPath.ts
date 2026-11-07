import { type RefObject, useLayoutEffect, useState } from 'react'

/** The space above the name, and two of its lines: what the path can hold above the rail's first line (DESIGN.md, Control). */
const TWO_LINES = 8 + 2 * 20

/**
 * Whether the piece's name in the path takes its third and last line, which needs the rail to start lower.
 * Only the browser knows how the name wraps, and it changes as the title is written.
 */
export function useLongPath(head: RefObject<HTMLElement | null>): boolean {
  const [long, setLong] = useState(false)
  // Before paint, so a piece does not open with its name over the rail for a frame.
  useLayoutEffect(() => {
    const crumbs = head.current?.querySelector('.crumbs')
    if (!crumbs) return
    const observer = new ResizeObserver(() => setLong(crumbs.getBoundingClientRect().height > TWO_LINES))
    observer.observe(crumbs)
    return () => observer.disconnect()
  }, [head])
  return long
}
