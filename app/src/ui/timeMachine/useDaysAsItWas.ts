import { useEffect, useRef, useState } from 'react'
import { type Day, daysAsItWas } from '../../domain/days'
import type { Listed } from '../../domain/lookBack'
import { wordsAt } from '../../domain/lookBack'
import type { Deps } from '../../domain/pieces'

/**
 * A journal's Days as it was (DESIGN.md, The Time Machine): the days of that moment, each with the words it held
 * then. The days are there at once; their words are read, in one go, only while Days is `wanted` on screen, so a
 * year of journal is not read for a list nobody opened. Until the first read, there is nothing to show: a day with
 * no words would read as not written. Between two moments the last read stands for the instant a new one takes.
 * Kept in memory only: nothing is stored.
 */
export function useDaysAsItWas(deps: Pick<Deps, 'store'>, sections: Listed[] | undefined, at: number | undefined, wanted: boolean): Day[] | undefined {
  /** Words by the time they were read at, kept so a moment seen once is not read again. */
  const known = useRef(new Map<number, Record<string, number>>())
  const [words, setWords] = useState<Record<string, number> | undefined>(undefined)
  const ids = sections?.map((s) => s.sectionId).join('\n')

  useEffect(() => {
    if (!wanted || !ids || at === undefined) return
    const found = known.current.get(at)
    if (found) {
      setWords(found)
      return
    }
    let alive = true
    wordsAt(deps, ids.split('\n'), at).then(
      (read) => {
        known.current.set(at, read)
        if (alive) setWords(read)
      },
      () => {
        // Words that cannot be read leave Days as it stands: none is better than a wrong one.
      },
    )
    return () => {
      alive = false
    }
  }, [deps, ids, at, wanted])

  return sections && words ? daysAsItWas(sections, words) : undefined
}
