// The Time Machine's motion (DESIGN.md, Motion): a cross-fade in and out, a fade in place for a change of
// moment, and the glide of the tape. All of it is off for a writer who asked for less motion.

/** A strong ease-out: it starts quickly, so what the writer is waiting for is there at once. */
export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
/** The Time Machine opening and closing. */
export const SCREEN_FADE = 220
/** A change of moment, in place. */
export const MOMENT_FADE = 120

const FADE = 'time-machine-fade'

export function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Whether this browser can animate an element by script at all. */
function animatable(el: HTMLElement): boolean {
  return typeof el.animate === 'function'
}

/**
 * Fades `el` in over `ms`. One already on the way is taken over from where it is, so a key held down
 * dims the text and lets it up at the end, and never flashes it back to nothing for each step.
 */
export function fadeIn(el: HTMLElement, ms: number): void {
  if (reducedMotion() || !animatable(el)) return
  const running = el.getAnimations().find((a) => a.id === FADE)
  const from = running ? Number(getComputedStyle(el).opacity) : 0
  running?.cancel()
  el.animate([{ opacity: from }, { opacity: 1 }], { duration: ms, easing: EASE_OUT }).id = FADE
}

/** Fades `el` out over `ms` and holds it there, for as long as it stays. */
export function fadeOut(el: HTMLElement, ms: number): void {
  if (reducedMotion() || !animatable(el)) return
  const running = el.getAnimations().find((a) => a.id === FADE)
  const from = running ? Number(getComputedStyle(el).opacity) : 1
  running?.cancel()
  el.animate([{ opacity: from }, { opacity: 0 }], { duration: ms, easing: EASE_OUT, fill: 'forwards' }).id = FADE
}
