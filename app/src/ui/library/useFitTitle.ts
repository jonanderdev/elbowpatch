import { type RefObject, useLayoutEffect } from 'react'

/** A shelf title's size: 15px, the size Figma draws it at, down to the 12px of the line under it. */
const LARGEST = 15
const SMALLEST = 12

/**
 * Shrinks a shelf object's title until its longest word fits across the object, so "Thoughts" is
 * never broken as "Thought / s". Past the smallest size a word still breaks, as it did before.
 * Measured as drawn, so the optical size and the font's own widths count.
 */
export function useFitTitle(ref: RefObject<HTMLElement | null>, title: string, on: boolean): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new title is a new width to fit.
  useLayoutEffect(() => {
    const el = ref.current
    const object = el?.parentElement
    const text = el?.firstChild
    if (!on || !el || !object || !(text instanceof Text)) return
    const shrink = (): void => {
      el.style.fontSize = ''
      const style = getComputedStyle(object)
      const room = object.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
      let size = LARGEST
      while (size > SMALLEST && widest(text) > room) {
        size -= 0.5
        el.style.fontSize = `${size}px`
      }
    }
    shrink()
    let alive = true
    // The fonts change every width.
    void document.fonts.ready.then(() => alive && shrink())
    return () => {
      alive = false
    }
  }, [ref, title, on])
}

/** The widest word in the text as drawn, to the fraction of a pixel. */
function widest(text: Text): number {
  const range = document.createRange()
  let most = 0
  for (const word of text.data.matchAll(/\S+/g)) {
    range.setStart(text, word.index)
    range.setEnd(text, word.index + word[0].length)
    // A word already broken across lines is as wide as its pieces together.
    let width = 0
    for (const r of range.getClientRects()) width += r.width
    most = Math.max(most, width)
  }
  return most
}
