import { useRef, useState } from 'react'
import type { Moment } from '../../domain/lookBack'

export interface KeepCopy {
  /** The moment whose copy could not be made: the bar says so and offers *Try again*. */
  failed: Moment | null
  /** Keeps a copy of this moment, once at a time. */
  keep(moment: Moment): void
}

/**
 * Keeping a copy of the moment on screen. `make` opens the copy and leaves the Time Machine, or rejects
 * with nothing made. A press while one is under way does nothing, so a double press makes one copy.
 */
export function useKeepCopy(make: (moment: Moment) => Promise<void>): KeepCopy {
  const [failed, setFailed] = useState<Moment | null>(null)
  /** A copy is being made: read by the next press, never shown. */
  const busy = useRef(false)

  const keep = (moment: Moment): void => {
    if (busy.current) return
    busy.current = true
    make(moment)
      .catch(() => setFailed(moment))
      .finally(() => {
        busy.current = false
      })
  }

  return { failed, keep }
}
