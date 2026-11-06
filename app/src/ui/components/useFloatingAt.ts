import { type CSSProperties, type RefObject, useLayoutEffect, useRef, useState } from 'react'

/**
 * Where a bar floats over some selected words: centred on them, above if there is room, else below, and always
 * at least 16px from the window's edge. Hidden until measured, so it never shows a frame in the wrong place.
 * Measured before paint, for the same reason.
 */
export function useFloatingAt(rect: DOMRect): { ref: RefObject<HTMLDivElement | null>; style: CSSProperties } {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const bar = ref.current
    if (!bar) return
    const w = bar.offsetWidth
    const h = bar.offsetHeight
    const edge = 16
    const left = Math.max(edge, Math.min(window.innerWidth - w - edge, rect.left + rect.width / 2 - w / 2))
    const top = rect.top - h - 10 > edge ? rect.top - h - 10 : rect.bottom + 10
    setPos({ left, top })
  }, [rect.left, rect.top, rect.width, rect.bottom])
  return { ref, style: pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' } }
}
