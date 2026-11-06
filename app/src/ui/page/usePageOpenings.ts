import { type RefObject, useLayoutEffect, useState } from 'react'
import { pageOpenings } from '../../page/openings'
import type { Pager } from '../../page/pager'

/** How long the text rests before the labels are read again: typing on one page moves the first words of the rest. */
const REST = 200

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((words, i) => words === b[i])

/**
 * Each page's first words, in the text `pager` lays out, kept up with the text while `watching`. When
 * the pages change in number they are read at once, so the rail's rows keep to the pages.
 */
export function usePageOpenings(pager: Pager | null, columns: RefObject<HTMLElement | null>, watching: boolean): readonly string[] {
  const [openings, setOpenings] = useState<readonly string[]>([])

  // Before paint, so a rail opened on a page never shows a frame with no rows.
  useLayoutEffect(() => {
    const el = columns.current
    if (!pager || !el || !watching) return
    let pages = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = (): void => {
      clearTimeout(timer)
      pages = pager.count
      const next = pageOpenings(el, pager.g, pager.count)
      setOpenings((now) => (same(now, next) ? now : next))
    }
    pager.onMeasured = () => {
      if (pager.count !== pages) read()
      else {
        clearTimeout(timer)
        timer = setTimeout(read, REST)
      }
    }
    read()
    return () => {
      clearTimeout(timer)
      pager.onMeasured = undefined
    }
  }, [pager, columns, watching])

  return openings
}
