import type { Kind } from '../domain/model'
import { geometry, type Pager } from './pager'

/** The screen's height with no keyboard up, and the tallest the window has been, at this width: on a touch screen the keyboard shortens the window, never the page. */
let tallest = { width: 0, height: 0, window: 0 }

/** Lays the pages out: the page fitted to the screen, at the text settings. */
export function layOut(pager: Pager, screen: HTMLElement, kind: Kind): void {
  const width = screen.clientWidth
  let height = screen.clientHeight
  if (matchMedia('(pointer: coarse)').matches) {
    // A keyboard shortens the window by more than 80px (as in useKeyboard): the page keeps its height and
    // scrolls to every line. Anything less (the home bar's inset, browser chrome) is the window itself: the
    // page is laid out again at its height, so with no keyboard nothing scrolls. While the keyboard is up
    // the screen is only the part above it, so the page keeps its height until it goes down (turned with
    // the keyboard up, the window's height stands in till then).
    const windowHeight = document.documentElement.clientHeight
    if (width !== tallest.width) tallest = { width, height: 0, window: 0 }
    tallest.window = Math.max(tallest.window, windowHeight)
    if (!screen.hasAttribute('data-keyboard')) {
      if (!tallest.height || tallest.window - windowHeight <= 80) {
        screen.style.removeProperty('--page-height')
        tallest.height = screen.clientHeight
      }
    } else if (!tallest.height) tallest.height = windowHeight
    height = tallest.height
    // The screen keeps that height, and the page's scroller its length.
    screen.style.setProperty('--page-height', `${height}px`)
  }
  const g = geometry(width, height, document.documentElement.dataset.measure === 'wide', kind === 'journal')
  const set = (name: string, px: number): void => screen.style.setProperty(name, `${px}px`)
  screen.style.setProperty('--k', `${g.k}`)
  set('--side', g.side)
  set('--measure-px', g.measure)
  set('--stride', g.stride)
  set('--top', g.top)
  set('--bottom', g.bottom)
  set('--text-height', g.height)
  pager.layout(g)
}
