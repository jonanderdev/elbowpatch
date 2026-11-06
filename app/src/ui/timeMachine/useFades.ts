import { type RefObject, useLayoutEffect, useRef } from 'react'
import { fadeIn, fadeOut, MOMENT_FADE, SCREEN_FADE } from './motion'

/**
 * The Time Machine opening and closing as a cross-fade over the page (DESIGN.md, Motion). It fades in as it is
 * made, and once left it fades out, no longer taking the pointer or the focus, over a page that is already the
 * writer's again.
 */
export function useScreenFade(screen: RefObject<HTMLElement | null>, leaving: boolean): void {
  // Before paint, or its first frame would show whole.
  useLayoutEffect(() => {
    if (screen.current) fadeIn(screen.current, SCREEN_FADE)
  }, [screen])
  useLayoutEffect(() => {
    const el = screen.current
    if (!leaving || !el) return
    el.inert = true
    fadeOut(el, SCREEN_FADE)
  }, [screen, leaving])
}

/**
 * A change of moment as a fade in place, on what shows the text, never a slide: the page turn is the slide, and this must
 * not read as one. Called after the effect that swaps the text, so what fades in is the new moment. The first
 * moment to show is one too: today's text gives way to it.
 */
export function useMomentFade(el: RefObject<HTMLElement | null>, at: number | undefined): void {
  const shown = useRef(at)
  // Before paint, so the new text is never seen at full strength for a frame.
  useLayoutEffect(() => {
    if (shown.current === at) return
    shown.current = at
    if (el.current) fadeIn(el.current, MOMENT_FADE)
  }, [el, at])
}
